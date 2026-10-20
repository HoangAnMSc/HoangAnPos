-- Additive upgrade: edit current HSD by SKU and remove dates without changing stock.
begin;

-- A cleared part of a receipt can stop tracking while the other parts keep HSD.
alter table public.stock_expiry_lots add column if not exists tracks_expiry boolean;

create or replace function public.list_stock_expiry() returns table(variant_id uuid,stock_quantity integer,lots jsonb)
language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null or not public.has_permission('warehouse') then raise exception 'Bạn không có quyền xem HSD.'; end if;
  return query select v.id,v.stock_quantity,coalesce((select jsonb_agg(jsonb_build_object(
    'id',l.id,'receipt_id',r.id,'expiry_date',l.expiry_date,'initial_quantity',l.initial_quantity,'remaining_quantity',l.remaining_quantity,
    'updated_at',l.updated_at,'tracks_expiry',coalesce(l.tracks_expiry,r.tracks_expiry),'import_date',r.import_date,'origin',r.origin,'created_at',r.created_at
  ) order by l.expiry_date nulls last,r.created_at,l.id)
    from public.stock_expiry_lots l join public.stock_expiry_receipts r on r.id=l.receipt_id
    where l.variant_id=v.id and l.remaining_quantity>0),'[]'::jsonb)
  from public.product_variants v join public.products p on p.id=v.product_id where p.deleted_at is null order by v.id;
end $$;

-- Keep the per-part tracking choice when converting a cleared receipt.
do $$ declare definition text; begin
  definition:=pg_get_functiondef('public._stock_expiry_movement()'::regprocedure);
  if position('bool_or(r.tracks_expiry)' in definition)>0 then
    definition:=replace(definition,'bool_or(r.tracks_expiry)','bool_or(coalesce(l.tracks_expiry,r.tracks_expiry))');
  elsif position('bool_or(coalesce(l.tracks_expiry,r.tracks_expiry))' in definition)=0 then
    raise exception 'Unexpected HSD movement function; upgrade was not applied.';
  end if;
  -- Derive tracking from current units, rather than receipts already consumed
  -- or cleared. A stock adjustment must not turn tracking back on by history.
  definition:=replace(definition,
    'select coalesce(bool_or(tracks_expiry),false) into tracked from public.stock_expiry_receipts where variant_id=new.variant_id;',
    'select coalesce(bool_or(coalesce(l.tracks_expiry,r.tracks_expiry)),false) into tracked from public.stock_expiry_lots l join public.stock_expiry_receipts r on r.id=l.receipt_id where l.variant_id=new.variant_id and l.remaining_quantity>0;');
  definition:=replace(definition,
    'perform public._stock_expiry_add(event.target_variant_id,received,bucket.tracked,bucket.expiry_date,''conversion'',event.id,null,null,bucket.imported);',
    'select coalesce(bool_or(coalesce(l.tracks_expiry,r.tracks_expiry)),false) into tracked from public.stock_expiry_allocations a join public.stock_expiry_lots l on l.id=a.lot_id join public.stock_expiry_receipts r on r.id=l.receipt_id where a.movement_id=new.id and a.quantity_delta<0 and a.expiry_date_snapshot is not distinct from bucket.expiry_date;
        perform public._stock_expiry_add(event.target_variant_id,received,tracked,bucket.expiry_date,''conversion'',event.id,null,null,bucket.imported);');
  execute definition;
  definition:=pg_get_functiondef('public._stock_expiry_balance()'::regprocedure);
  execute replace(definition,
    'select coalesce(bool_or(tracks_expiry),false) into tracked from public.stock_expiry_receipts where variant_id=v.id;',
    'select coalesce(bool_or(coalesce(l.tracks_expiry,r.tracks_expiry)),false) into tracked from public.stock_expiry_lots l join public.stock_expiry_receipts r on r.id=l.receipt_id where l.variant_id=v.id and l.remaining_quantity>0;');
end $$;

create or replace function public.prepare_stock_expiry(variant_id_input uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v public.product_variants; balance bigint; result jsonb;
begin
  if auth.uid() is null or not public.has_permission('warehouse.expiry.manage') then raise exception 'Bạn không có quyền quản lý HSD.'; end if;
  perform 1 from public.products p join public.product_variants pv on pv.product_id=p.id
    where pv.id=variant_id_input and p.deleted_at is null for update of p;
  if not found then raise exception 'Sản phẩm không còn tồn tại hoặc đã bị xóa.'; end if;
  select * into strict v from public.product_variants where id=variant_id_input for update;
  if v.stock_quantity<=0 then raise exception 'SKU chưa có tồn kho. Hãy nhập kho trước khi gắn HSD.'; end if;
  select coalesce(sum(remaining_quantity),0) into balance from public.stock_expiry_lots where variant_id=v.id;
  if balance>v.stock_quantity then raise exception 'Số lượng HSD không khớp tồn kho. Hãy tải lại và đối chiếu số lượng.'; end if;
  if balance<v.stock_quantity then
    perform public._stock_expiry_add(v.id,(v.stock_quantity-balance)::integer,false,null,'opening_stock');
  end if;
  select to_jsonb(entry) into result from public.list_stock_expiry() entry where entry.variant_id=v.id;
  return result;
end $$;

-- Lock and validate every selected lot before changing any date. These helpers
-- are private; public entry points check permission and request idempotency.
create or replace function public._stock_expiry_lock_targets(variant_id_input uuid,lots_input jsonb) returns integer
language plpgsql security definer set search_path=public as $$
declare stock integer; balance bigint; matched integer; available bigint;
begin
  if lots_input is null or jsonb_typeof(lots_input)<>'array' or jsonb_array_length(lots_input)=0 then raise exception 'Chưa chọn phần hàng cần cập nhật HSD.'; end if;
  if (select count(distinct x.id) from jsonb_to_recordset(lots_input) as x(id uuid,updated_at timestamptz))<>jsonb_array_length(lots_input) then
    raise exception 'Danh sách lô HSD không hợp lệ.';
  end if;
  perform 1 from public.products p join public.product_variants pv on pv.product_id=p.id
    where pv.id=variant_id_input and p.deleted_at is null for update of p;
  if not found then raise exception 'Sản phẩm không còn tồn tại hoặc đã bị xóa.'; end if;
  select stock_quantity into strict stock from public.product_variants where id=variant_id_input for update;
  if stock<=0 then raise exception 'SKU không còn tồn kho để cập nhật HSD. Hãy tải lại.'; end if;
  perform 1 from public.stock_expiry_lots l join jsonb_to_recordset(lots_input) as x(id uuid,updated_at timestamptz) on x.id=l.id
    where l.variant_id=variant_id_input order by l.id for update of l;
  select count(*),coalesce(sum(l.remaining_quantity),0) into matched,available
    from public.stock_expiry_lots l join jsonb_to_recordset(lots_input) as x(id uuid,updated_at timestamptz) on x.id=l.id
    where l.variant_id=variant_id_input and l.remaining_quantity>0 and l.updated_at=x.updated_at;
  if matched<>jsonb_array_length(lots_input) then raise exception 'Số lượng hoặc HSD đã thay đổi. Hãy tải lại trước khi lưu.'; end if;
  select coalesce(sum(remaining_quantity),0) into balance from public.stock_expiry_lots where variant_id=variant_id_input;
  if balance<>stock then raise exception 'Số lượng HSD không khớp tồn kho. Hãy tải lại và đối chiếu số lượng.'; end if;
  return available::integer;
end $$;

create or replace function public._stock_expiry_move_part(lot_input uuid,quantity_input integer,expiry_input date,tracked_input boolean) returns void
language plpgsql security definer set search_path=public as $$
declare source public.stock_expiry_lots;
begin
  select * into strict source from public.stock_expiry_lots where id=lot_input for update;
  if quantity_input<=0 or quantity_input>source.remaining_quantity then raise exception 'Số lượng phân bổ không hợp lệ.'; end if;
  -- Retain already-sold units on their original lot for a later cancellation.
  update public.stock_expiry_lots set initial_quantity=initial_quantity-quantity_input,
    remaining_quantity=remaining_quantity-quantity_input,updated_at=clock_timestamp() where id=source.id;
  insert into public.stock_expiry_lots(receipt_id,variant_id,expiry_date,initial_quantity,remaining_quantity,tracks_expiry)
    values(source.receipt_id,source.variant_id,expiry_input,quantity_input,quantity_input,tracked_input);
end $$;

create or replace function public.set_stock_expiry(variant_id_input uuid,lots_input jsonb,allocations_input jsonb,request_id_input uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare previous public.stock_expiry_requests; payload jsonb; available integer; total bigint:=0; part record; source record; remaining integer; taken integer;
begin
  if auth.uid() is null or not public.has_permission('warehouse.expiry.manage') then raise exception 'Bạn không có quyền quản lý HSD.'; end if;
  if request_id_input is null then raise exception 'Thiếu mã thao tác.'; end if;
  payload:=jsonb_build_object('variant',variant_id_input,'lots',lots_input,'allocations',allocations_input);
  perform pg_advisory_xact_lock(hashtextextended(request_id_input::text,0));
  select * into previous from public.stock_expiry_requests where id=request_id_input;
  if found then
    if previous.actor_id<>auth.uid() or previous.kind<>'set_expiry' or previous.payload<>payload then raise exception 'Mã thao tác đã dùng cho dữ liệu khác.'; end if;
    return (previous.result->>'quantity')::integer;
  end if;
  available:=public._stock_expiry_lock_targets(variant_id_input,lots_input);
  if allocations_input is null or jsonb_typeof(allocations_input)<>'array' or jsonb_array_length(allocations_input)=0 then raise exception 'Hãy nhập ít nhất một HSD.'; end if;
  for part in select * from jsonb_to_recordset(allocations_input) as x(expiry_date date,quantity integer) loop
    if part.expiry_date is null or not isfinite(part.expiry_date) or part.expiry_date not between date '0001-01-01' and date '9999-12-31'
      or part.quantity is null or part.quantity<=0 then raise exception 'Mỗi HSD cần ngày hợp lệ và số lượng nguyên dương.'; end if;
    total:=total+part.quantity;
  end loop;
  if total>available then raise exception 'Tổng phân bổ không được vượt quá số lượng đã chọn (%).',available; end if;
  for part in select x.expiry_date,sum(x.quantity)::integer as quantity from jsonb_to_recordset(allocations_input) as x(expiry_date date,quantity integer) group by x.expiry_date order by x.expiry_date loop
    remaining:=part.quantity;
    for source in select l.* from public.stock_expiry_lots l join public.stock_expiry_receipts r on r.id=l.receipt_id
      join jsonb_to_recordset(lots_input) as x(id uuid,updated_at timestamptz) on x.id=l.id
      where l.variant_id=variant_id_input and l.remaining_quantity>0 order by r.import_date nulls last,r.created_at,l.id
    loop
      exit when remaining=0;
      taken:=least(remaining,source.remaining_quantity);
      perform public._stock_expiry_move_part(source.id,taken,part.expiry_date,true);
      remaining:=remaining-taken;
    end loop;
    if remaining<>0 then raise exception 'Số lượng lô đã thay đổi. Hãy tải lại.'; end if;
  end loop;
  -- Starting HSD tracking can be completed later for the unallocated remainder.
  update public.stock_expiry_lots l set tracks_expiry=true,updated_at=clock_timestamp()
    from jsonb_to_recordset(lots_input) as x(id uuid,updated_at timestamptz)
    where l.id=x.id and l.expiry_date is null and l.remaining_quantity>0;
  insert into public.stock_expiry_requests(id,actor_id,kind,payload,result)
    values(request_id_input,auth.uid(),'set_expiry',payload,jsonb_build_object('quantity',total));
  return total::integer;
end $$;

create or replace function public.clear_stock_expiry(variant_id_input uuid,lots_input jsonb,request_id_input uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare previous public.stock_expiry_requests; payload jsonb; available integer; source record;
begin
  if auth.uid() is null or not public.has_permission('warehouse.expiry.manage') then raise exception 'Bạn không có quyền xóa HSD.'; end if;
  if request_id_input is null then raise exception 'Thiếu mã thao tác.'; end if;
  payload:=jsonb_build_object('variant',variant_id_input,'lots',lots_input);
  perform pg_advisory_xact_lock(hashtextextended(request_id_input::text,0));
  select * into previous from public.stock_expiry_requests where id=request_id_input;
  if found then
    if previous.actor_id<>auth.uid() or previous.kind<>'clear_expiry' or previous.payload<>payload then raise exception 'Mã thao tác đã dùng cho dữ liệu khác.'; end if;
    return (previous.result->>'quantity')::integer;
  end if;
  available:=public._stock_expiry_lock_targets(variant_id_input,lots_input);
  if exists(select 1 from public.stock_expiry_lots l join jsonb_to_recordset(lots_input) as x(id uuid,updated_at timestamptz) on x.id=l.id where l.expiry_date is null) then
    raise exception 'Phần hàng này chưa có HSD để xóa.';
  end if;
  for source in select l.* from public.stock_expiry_lots l join jsonb_to_recordset(lots_input) as x(id uuid,updated_at timestamptz) on x.id=l.id order by l.id loop
    perform public._stock_expiry_move_part(source.id,source.remaining_quantity,null,false);
  end loop;
  insert into public.stock_expiry_requests(id,actor_id,kind,payload,result)
    values(request_id_input,auth.uid(),'clear_expiry',payload,jsonb_build_object('quantity',available));
  return available;
end $$;

revoke all on function public._stock_expiry_lock_targets(uuid,jsonb) from public,anon,authenticated;
revoke all on function public._stock_expiry_move_part(uuid,integer,date,boolean) from public,anon,authenticated;
revoke all on function public.prepare_stock_expiry(uuid) from public,anon,authenticated;
revoke all on function public.set_stock_expiry(uuid,jsonb,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.clear_stock_expiry(uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.prepare_stock_expiry(uuid) to authenticated;
grant execute on function public.set_stock_expiry(uuid,jsonb,jsonb,uuid) to authenticated;
grant execute on function public.clear_stock_expiry(uuid,jsonb,uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
