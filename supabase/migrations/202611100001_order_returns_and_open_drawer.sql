-- Correct order reversals and allow admins to adjust a staffed, open drawer.
-- Additive upgrade only. Historical balances and stock are not rewritten.
begin;

-- All drawer-changing RPCs use the same lock as open_cash_drawer. An absolute
-- adjustment, a checkout, a refund and a handover must see a consistent balance.
do $$
declare signature text; definition text;
begin
  foreach signature in array array[
    'public.create_pos_order(uuid,numeric,text,uuid,numeric,jsonb,text,text,text,text)',
    'public.close_cash_drawer(uuid,numeric,text[])',
    'public.submit_attendance_cash_check(uuid,numeric,text[])'
  ] loop
    definition := pg_get_functiondef(signature::regprocedure);
    if position('pg_advisory_xact_lock(417902113)' in definition) = 0 then
      definition := regexp_replace(definition, '\mbegin\M', E'begin\n  perform pg_advisory_xact_lock(417902113);', 'i');
      execute definition;
    end if;
  end loop;
end $$;

create or replace function public.adjust_cash_drawer_balance(cash_amount_input numeric)
returns void language plpgsql security definer set search_path=public as $$
declare target public.cash_drawer_sessions; base_cash numeric;
begin
  if auth.uid() is null or not (
    public.has_permission('cash-management.balance.adjust')
    or public.has_permission('cash-management.view-all')
    or public.is_admin(auth.uid())
  ) then raise exception 'Permission denied'; end if;
  if cash_amount_input is null or cash_amount_input < 0 or cash_amount_input::text in ('NaN','Infinity','-Infinity') then
    raise exception 'Cash balance must be a non-negative number';
  end if;
  perform pg_advisory_xact_lock(417902113);
  select * into target from public.cash_drawer_sessions
    order by (status='open') desc, closed_at desc, opened_at desc, id desc limit 1 for update;
  if target.id is null then
    if cash_amount_input=0 then return; end if;
    raise exception 'No cash drawer session is available to adjust';
  end if;
  if target.status='open' and public.requires_cash_reconciliation(target.cashier_id)
    and not public.is_admin(auth.uid()) then
    raise exception 'Only an admin can adjust an open employee cash drawer';
  end if;
  base_cash := public.current_cash_drawer_balance();
  update public.cash_drawer_sessions
    set cash_adjustment=cash_adjustment+cash_amount_input-base_cash where id=target.id;
end $$;

-- Paid totals already change the live drawer for its own invoices. Older
-- invoices were included in a counted handover, so their refund/restore must
-- instead change the current drawer once. Transfer invoices never change cash.
create or replace function public._apply_order_cash_change(order_input public.orders, delta_input numeric)
returns void language plpgsql security definer set search_path=public as $$
declare target public.cash_drawer_sessions;
begin
  if order_input.payment_method<>'cash' or delta_input=0 then return; end if;
  select * into target from public.cash_drawer_sessions
    order by (status='open') desc, closed_at desc, opened_at desc, id desc limit 1 for update;
  if target.id is null then return; end if;
  if target.status='open' and order_input.cash_session_id=target.id then return; end if;
  if target.status='closed' and order_input.cash_session_id is null and order_input.created_at>target.closed_at then return; end if;
  update public.cash_drawer_sessions set cash_adjustment=cash_adjustment+delta_input where id=target.id;
end $$;

-- Both cancellation and deletion use this private, transactional reversal.
create or replace function public._cancel_pos_order(order_id_input uuid, reason_input text)
returns public.orders language plpgsql security definer set search_path=public as $$
declare order_record public.orders; line public.order_items; deleted_product_name text;
begin
  if auth.uid() is null or not (public.has_permission('orders.cancel') or public.has_permission('orders.delete')) then
    raise exception 'Permission denied';
  end if;
  if nullif(trim(coalesce(reason_input,'')), '') is null then raise exception 'Cancellation reason is required'; end if;
  perform pg_advisory_xact_lock(417902113);
  select * into order_record from public.orders where id=order_id_input for update;
  if order_record.id is null then raise exception 'Order not found'; end if;
  if order_record.status='cancelled' then return order_record; end if;
  perform 1 from public.products p where p.id in (
    select item.product_id from public.order_items item where item.order_id=order_id_input
    union select v.product_id from public.order_items item join public.product_variants v on v.id=item.variant_id
      where item.order_id=order_id_input
  ) order by p.id for update;
  select coalesce(nullif(trim(item.product_name),''),'Không xác định') into deleted_product_name
    from public.order_items item
    left join public.product_variants v on v.id=item.variant_id
    left join public.products p on p.id=coalesce(item.product_id,v.product_id)
    where item.order_id=order_id_input and (p.id is null or p.deleted_at is not null)
    order by item.id limit 1;
  if found then
    raise exception 'Không thể hủy hóa đơn vì sản phẩm "%" đã bị xóa. Hóa đơn chưa được hủy và hàng chưa được hoàn.',deleted_product_name;
  end if;
  if not exists(select 1 from public.order_items where order_id=order_id_input) or exists(
    select 1 from public.order_items i left join public.product_variants v on v.id=i.variant_id
    where i.order_id=order_id_input and (v.id is null or v.product_id is distinct from i.product_id or i.quantity<=0)
  ) then
    raise exception 'Hóa đơn thiếu thông tin SKU hoặc số lượng hợp lệ. Chưa hủy hóa đơn hay hoàn tiền/hàng.';
  end if;
  perform 1 from public.product_variants v where v.id in (
    select variant_id from public.order_items where order_id=order_id_input
  ) order by v.id for update;
  for line in select * from public.order_items where order_id=order_id_input order by variant_id,id loop
    update public.product_variants set stock_quantity=stock_quantity+line.quantity,
      shelf_quantity=shelf_quantity+line.quantity,updated_at=now() where id=line.variant_id;
    if line.batch_id is not null then
      update public.product_batches set quantity=quantity+line.quantity,shelf_quantity=shelf_quantity+line.quantity
        where id=line.batch_id and variant_id=line.variant_id;
      if not found then raise exception 'Không tìm thấy lô hàng gốc. Chưa hủy hóa đơn hay hoàn tiền/hàng.'; end if;
    end if;
    insert into public.stock_movements(variant_id,movement_type,quantity,reason,reference_type,reference_id,actor_id,actor_name)
      values(line.variant_id,'return',line.quantity,'Cancel order','order',order_id_input,auth.uid(),
        coalesce((select full_name from public.profiles where id=auth.uid()),'System'));
  end loop;
  if order_record.customer_id is not null then
    update public.customers set points=greatest(points-order_record.points_earned+order_record.points_redeemed,0)
      where id=order_record.customer_id;
  end if;
  update public.orders set status='cancelled',cancelled_at=now(),cancelled_by=auth.uid(),cancel_reason=left(trim(reason_input),1000)
    where id=order_id_input returning * into order_record;
  perform public._apply_order_cash_change(order_record,-order_record.total);
  insert into public.order_audit_events(order_id,actor_id,event_type,reason,details)
    values(order_id_input,auth.uid(),'cancelled',reason_input,jsonb_build_object('points_reversed',true,
      'refund_amount',order_record.total,'payment_method',order_record.payment_method));
  return order_record;
end $$;

create or replace function public.cancel_pos_order(order_id_input uuid, reason_input text)
returns public.orders language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or not public.has_permission('orders.cancel') then raise exception 'Permission denied'; end if;
  return public._cancel_pos_order(order_id_input,reason_input);
end $$;

create or replace function public.cancel_pos_orders(order_ids_input uuid[], reason_input text)
returns integer language plpgsql security definer set search_path=public as $$
declare target public.orders; affected integer:=0;
begin
  if auth.uid() is null or not public.has_permission('orders.cancel') then raise exception 'Permission denied'; end if;
  if nullif(trim(coalesce(reason_input,'')), '') is null then raise exception 'Cancellation reason is required'; end if;
  perform pg_advisory_xact_lock(417902113);
  for target in select * from public.orders where id=any(order_ids_input) and deleted_at is null and status='paid' order by id for update loop
    perform public._cancel_pos_order(target.id,reason_input);
    affected:=affected+1;
  end loop;
  return affected;
end $$;

create or replace function public.delete_pos_orders(order_ids_input uuid[], reason_input text)
returns integer language plpgsql security definer set search_path=public as $$
declare target public.orders; affected integer:=0;
begin
  if auth.uid() is null or not public.has_permission('orders.delete') then raise exception 'Permission denied'; end if;
  if nullif(trim(coalesce(reason_input,'')), '') is null then raise exception 'Deletion reason is required'; end if;
  perform pg_advisory_xact_lock(417902113);
  for target in select * from public.orders where id=any(order_ids_input) and deleted_at is null order by id for update loop
    if target.status='paid' then perform public._cancel_pos_order(target.id,reason_input); end if;
    update public.orders set deleted_at=now(),deleted_by=auth.uid(),delete_reason=left(trim(reason_input),1000),status_before_delete=target.status
      where id=target.id;
    insert into public.order_audit_events(order_id,actor_id,event_type,reason,details)
      values(target.id,auth.uid(),'deleted',reason_input,jsonb_build_object('previous_status',target.status));
    affected:=affected+1;
  end loop;
  return affected;
end $$;

-- Retain existing restore behavior, with deterministic locks, atomic stock
-- checks, and the inverse cash movement when the original session has closed.
do $$
declare definition text;
begin
  definition:=pg_get_functiondef('public.restore_cancelled_orders(uuid[])'::regprocedure);
  if position('_apply_order_cash_change' in definition)=0 then
    definition:=replace(definition,'foreach order_id_value in array order_ids_input loop',
      'perform pg_advisory_xact_lock(417902113);
  for order_id_value in select distinct unnest(order_ids_input) order by 1 loop');
    definition:=replace(definition,'for line in select * from public.order_items where order_id=order_id_value loop',
      'if exists(select 1 from public.order_items i left join public.product_variants v on v.id=i.variant_id
        left join public.products p on p.id=v.product_id
        where i.order_id=order_id_value and (v.id is null or p.deleted_at is not null)) then
        raise exception ''Không thể khôi phục hóa đơn vì SKU không còn tồn tại hoặc sản phẩm đã bị xóa.'';
      end if;
      perform 1 from public.product_variants where id in (select variant_id from public.order_items where order_id=order_id_value) order by id for update;
      for line in select * from public.order_items where order_id=order_id_value order by variant_id,id loop');
    definition:=replace(definition,'stock_quantity=stock_quantity-line.quantity,shelf_quantity=shelf_quantity-line.quantity,updated_at=now() where id=line.variant_id;',
      'stock_quantity=stock_quantity-line.quantity,shelf_quantity=shelf_quantity-line.quantity,updated_at=now()
        where id=line.variant_id and stock_quantity>=line.quantity and shelf_quantity>=line.quantity;
        if not found then raise exception ''Insufficient stock to restore order %'', order_record.code; end if;');
    definition:=replace(definition,'restored_count:=restored_count+1;',
      'perform public._apply_order_cash_change(order_record,order_record.total);
    restored_count:=restored_count+1;');
    execute definition;
  end if;

  definition:=pg_get_functiondef('public.guard_product_engine_write()'::regprocedure);
  if position('public.has_permission(''orders.delete'')' in definition)=0 then
    definition:=replace(definition,'or public.has_permission(''orders.cancel'')',
      'or public.has_permission(''orders.cancel'') or public.has_permission(''orders.delete'')');
    execute definition;
  end if;

  -- Net sales must reflect cancelled/deleted invoices even for closed sessions.
  -- Counted balances and closing variances remain the historical close snapshot.
  definition:=pg_get_functiondef('public.list_cash_drawer_sessions(integer)'::regprocedure);
  definition:=replace(definition,'case when session.status = ''closed'' then session.cash_sales else sales.cash_sales end','sales.cash_sales');
  definition:=replace(definition,'case when session.status = ''closed'' then session.transfer_sales else sales.transfer_sales end','sales.transfer_sales');
  execute definition;
end $$;

revoke all on function public._apply_order_cash_change(public.orders,numeric), public._cancel_pos_order(uuid,text) from public,anon,authenticated;
revoke all on function public.cancel_pos_orders(uuid[],text) from public,anon;
grant execute on function public.cancel_pos_orders(uuid[],text) to authenticated,service_role;
notify pgrst,'reload schema';
commit;
