-- Additive upgrade: reject cancellation before restoring any stock when an
-- ordered product has been deleted. Existing orders and stock remain intact.
begin;

create or replace function public.cancel_pos_order(order_id_input uuid,reason_input text)
returns public.orders language plpgsql security definer set search_path=public as $$
declare order_record public.orders; line public.order_items; deleted_product_name text;
begin
  if auth.uid() is null or not public.has_permission('orders.cancel') then raise exception 'Permission denied'; end if;
  if nullif(trim(coalesce(reason_input,'')), '') is null then raise exception 'Cancellation reason is required'; end if;
  select * into order_record from public.orders where id=order_id_input for update;
  if order_record.id is null then raise exception 'Order not found'; end if;
  if order_record.status='cancelled' then return order_record; end if;

  -- Use the same product-before-variant lock order as soft_delete_product.
  -- Either cancellation restores stock first (blocking deletion), or deletion
  -- finishes first and this request is rejected. Never return to a deleted SKU.
  perform 1 from public.products p where p.id in (
    select item.product_id from public.order_items item where item.order_id=order_id_input
    union
    select variant.product_id from public.order_items item
      join public.product_variants variant on variant.id=item.variant_id
      where item.order_id=order_id_input
  ) order by p.id for update;
  select coalesce(nullif(trim(item.product_name),''),'Không xác định') into deleted_product_name
    from public.order_items item
    left join public.product_variants variant on variant.id=item.variant_id
    left join public.products p on p.id=coalesce(item.product_id,variant.product_id)
    where item.order_id=order_id_input and (p.id is null or p.deleted_at is not null)
    order by item.id limit 1;
  if found then
    raise exception 'Không thể hủy hóa đơn vì sản phẩm "%" đã bị xóa. Hóa đơn chưa được hủy và hàng chưa được hoàn.',deleted_product_name;
  end if;

  for line in select * from public.order_items where order_id=order_id_input loop
    if line.variant_id is not null then
      update public.product_variants set stock_quantity=stock_quantity+line.quantity,shelf_quantity=shelf_quantity+line.quantity,updated_at=now() where id=line.variant_id;
      if line.batch_id is not null then update public.product_batches set quantity=quantity+line.quantity,shelf_quantity=shelf_quantity+line.quantity where id=line.batch_id; end if;
      insert into public.stock_movements(variant_id,movement_type,quantity,reason,reference_type,reference_id,actor_id,actor_name)
      values(line.variant_id,'return',line.quantity,'Cancel order','order',order_id_input,auth.uid(),coalesce((select full_name from public.profiles where id=auth.uid()),'System'));
    end if;
  end loop;
  if order_record.customer_id is not null then
    update public.customers set points=greatest(points-order_record.points_earned+order_record.points_redeemed,0) where id=order_record.customer_id;
  end if;
  update public.orders set status='cancelled',cancelled_at=now(),cancelled_by=auth.uid(),cancel_reason=left(trim(reason_input),1000) where id=order_id_input returning * into order_record;
  insert into public.order_audit_events(order_id,actor_id,event_type,reason,details) values(order_id_input,auth.uid(),'cancelled',reason_input,jsonb_build_object('points_reversed',true));
  return order_record;
end;
$$;

notify pgrst, 'reload schema';
commit;
