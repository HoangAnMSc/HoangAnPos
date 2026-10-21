-- Granular HSD actions and a single permission for creating inventory audits.
begin;

-- Preserve previous access once, then respect later role changes on retries.
do $$
declare first_upgrade boolean; role_record record; mapped text[];
begin
  first_upgrade := not exists (
    select 1 from pg_policy
    where polrelid='public.stock_expiry_settings'::regclass
      and polname='stock_expiry_view_permission'
  );
  for role_record in select id,permissions from public.app_roles for update loop
    mapped := array(select permission from unnest(coalesce(role_record.permissions,'{}'::text[])) as permission
      where permission not in ('inventory.count','inventory.submit','warehouse.expiry.manage'));
    if role_record.permissions && array['inventory','inventory.count','inventory.submit'] then
      mapped := mapped || array['warehouse','inventory'];
    end if;
    if 'warehouse.expiry.manage'=any(role_record.permissions) then
      mapped := mapped || array['warehouse','warehouse.expiry.view','warehouse.expiry.create','warehouse.expiry.update','warehouse.expiry.delete'];
    end if;
    if first_upgrade and role_record.permissions && array[
      'warehouse','warehouse.expiry.settings','warehouse.expiry.view',
      'warehouse.expiry.create','warehouse.expiry.update','warehouse.expiry.delete'
    ] then
      mapped := mapped || array['warehouse','warehouse.expiry.view'];
    end if;
    select array_agg(permission order by position) into mapped from (
      select permission,min(ordinality) as position from unnest(mapped) with ordinality as entry(permission,ordinality) group by permission
    ) unique_permissions;
    mapped := coalesce(mapped,'{}'::text[]);
    update public.app_roles set permissions=mapped where id=role_record.id and permissions is distinct from mapped;
  end loop;
end $$;

do $$ declare relation text; begin
  foreach relation in array array['stock_expiry_settings','stock_expiry_receipts','stock_expiry_lots','stock_expiry_allocations'] loop
    execute format('drop policy if exists stock_expiry_read on public.%I',relation);
    execute format('create policy stock_expiry_read on public.%I for select to authenticated using (public.has_permission(''warehouse.expiry.view''))',relation);
    execute format('drop policy if exists stock_expiry_view_permission on public.%I',relation);
    execute format('create policy stock_expiry_view_permission on public.%I as restrictive for select to authenticated using (public.has_permission(''warehouse.expiry.view''))',relation);
  end loop;
end $$;

-- Source lot dates are immutable: assigning, editing and clearing all move
-- quantities into new lots. Classifying these sources also checks retries.
create or replace function public._stock_expiry_require_write(lots_input jsonb) returns void
language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null or not public.has_permission('warehouse.expiry.view') or not (
    public.has_permission('warehouse.expiry.create') or public.has_permission('warehouse.expiry.update')
  ) then raise exception 'Bạn không có quyền thêm hoặc sửa HSD.'; end if;
  if lots_input is null or jsonb_typeof(lots_input)<>'array' or jsonb_array_length(lots_input)=0 then
    raise exception 'Chưa chọn phần hàng cần cập nhật HSD.';
  end if;
  if exists(select 1 from public.stock_expiry_lots l join jsonb_to_recordset(lots_input) as x(id uuid) on x.id=l.id where l.expiry_date is null)
    and not public.has_permission('warehouse.expiry.create') then raise exception 'Bạn không có quyền thêm HSD.'; end if;
  if exists(select 1 from public.stock_expiry_lots l join jsonb_to_recordset(lots_input) as x(id uuid) on x.id=l.id where l.expiry_date is not null)
    and not public.has_permission('warehouse.expiry.update') then raise exception 'Bạn không có quyền sửa HSD.'; end if;
end $$;
revoke all on function public._stock_expiry_require_write(jsonb) from public,anon,authenticated;

create or replace function public.list_stock_expiry() returns table(variant_id uuid,stock_quantity integer,lots jsonb)
language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null or not public.has_permission('warehouse.expiry.view') then raise exception 'Bạn không có quyền xem HSD.'; end if;
  return query select v.id,v.stock_quantity,coalesce((select jsonb_agg(jsonb_build_object(
    'id',l.id,'receipt_id',r.id,'expiry_date',l.expiry_date,'initial_quantity',l.initial_quantity,'remaining_quantity',l.remaining_quantity,
    'updated_at',l.updated_at,'tracks_expiry',coalesce(l.tracks_expiry,r.tracks_expiry),'import_date',r.import_date,'origin',r.origin,'created_at',r.created_at
  ) order by l.expiry_date nulls last,r.created_at,l.id)
    from public.stock_expiry_lots l join public.stock_expiry_receipts r on r.id=l.receipt_id
    where l.variant_id=v.id and l.remaining_quantity>0),'[]'::jsonb)
  from public.product_variants v join public.products p on p.id=v.product_id where p.deleted_at is null order by v.id;
end $$;

create or replace function public.prepare_stock_expiry(variant_id_input uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v public.product_variants; balance bigint; result jsonb;
begin
  if auth.uid() is null or not public.has_permission('warehouse.expiry.view') or not (public.has_permission('warehouse.expiry.create') or public.has_permission('warehouse.expiry.update')) then raise exception 'Bạn không có quyền thêm hoặc sửa HSD.'; end if;
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

create or replace function public.set_stock_expiry(variant_id_input uuid,lots_input jsonb,allocations_input jsonb,request_id_input uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare previous public.stock_expiry_requests; payload jsonb; available integer; total bigint:=0; part record; source record; remaining integer; taken integer;
begin
  perform public._stock_expiry_require_write(lots_input);
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
  if auth.uid() is null or not public.has_permission('warehouse.expiry.view') or not public.has_permission('warehouse.expiry.delete') then raise exception 'Bạn không có quyền xóa HSD.'; end if;
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

create or replace function public.assign_stock_expiry(lot_id_input uuid,expected_updated_at_input timestamptz,allocations_input jsonb,request_id_input uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare l public.stock_expiry_lots; receipt public.stock_expiry_receipts; part record; total bigint; payload jsonb; previous public.stock_expiry_requests;
begin
  perform public._stock_expiry_require_write(jsonb_build_array(jsonb_build_object('id',lot_id_input)));
  if request_id_input is null then raise exception 'Thiếu mã thao tác.'; end if;
  payload:=jsonb_build_object('lot',lot_id_input,'version',expected_updated_at_input,'allocations',allocations_input);
  perform pg_advisory_xact_lock(hashtextextended(request_id_input::text,0));
  select * into previous from public.stock_expiry_requests where id=request_id_input;
  if found then
    if previous.actor_id<>auth.uid() or previous.kind<>'assign' or previous.payload<>payload then raise exception 'Mã thao tác đã dùng cho dữ liệu khác.'; end if;
    return (previous.result->>'receipt_id')::uuid;
  end if;
  perform 1 from public.product_variants where id=(select variant_id from public.stock_expiry_lots where id=lot_id_input) for update;
  select * into l from public.stock_expiry_lots where id=lot_id_input for update;
  if not found or l.variant_id is null or l.remaining_quantity=0 then raise exception 'Lô không còn tồn để bổ sung HSD. Hãy tải lại.'; end if;
  if expected_updated_at_input is null or l.updated_at<>expected_updated_at_input then raise exception 'Số lượng lô đã thay đổi. Hãy tải lại trước khi nhập HSD.'; end if;
  if allocations_input is null or jsonb_typeof(allocations_input)<>'array' or jsonb_array_length(allocations_input)=0 then raise exception 'Hãy nhập ít nhất một HSD.'; end if;
  total:=0;
  for part in select * from jsonb_to_recordset(allocations_input) as x(expiry_date date,quantity integer) loop
    if part.expiry_date is null or part.quantity is null or part.quantity<=0 then raise exception 'Mỗi HSD cần ngày hợp lệ và số lượng nguyên dương.'; end if;
    total:=total+part.quantity;
  end loop;
  if total<>l.remaining_quantity then raise exception 'Tổng phân bổ phải bằng số lượng còn của lô (%).',l.remaining_quantity; end if;
  select * into receipt from public.stock_expiry_receipts where id=l.receipt_id for update;
  update public.stock_expiry_receipts set tracks_expiry=true where id=receipt.id;
  -- Keep sold quantities on the old lot, so future cancellations restore their
  -- original (possibly unknown) HSD rather than inventing one retroactively.
  update public.stock_expiry_lots set initial_quantity=initial_quantity-remaining_quantity,remaining_quantity=0,updated_at=clock_timestamp() where id=l.id;
  for part in select x.expiry_date,sum(x.quantity)::integer as quantity from jsonb_to_recordset(allocations_input) as x(expiry_date date,quantity integer) group by x.expiry_date loop
    insert into public.stock_expiry_lots(receipt_id,variant_id,expiry_date,initial_quantity,remaining_quantity)
    values(receipt.id,l.variant_id,part.expiry_date,part.quantity,part.quantity);
  end loop;
  insert into public.stock_expiry_requests(id,actor_id,kind,payload,result)
  values(request_id_input,auth.uid(),'assign',payload,jsonb_build_object('receipt_id',receipt.id));
  return receipt.id;
end $$;

create or replace function public.save_stock_expiry_settings(warning_days_input integer,expected_updated_at_input timestamptz)
returns public.stock_expiry_settings language plpgsql security definer set search_path=public as $$
declare result public.stock_expiry_settings;
begin
  if auth.uid() is null or not public.has_permission('warehouse.expiry.view') or not public.has_permission('warehouse.expiry.settings') then raise exception 'Bạn không có quyền cài đặt cảnh báo HSD.'; end if;
  if warning_days_input is null or warning_days_input not between 0 and 3650 then raise exception 'Mốc cảnh báo phải từ 0 đến 3650 ngày.'; end if;
  select * into result from public.stock_expiry_settings where id for update;
  if expected_updated_at_input is null or result.updated_at<>expected_updated_at_input then raise exception 'Cài đặt đã thay đổi. Hãy tải lại.'; end if;
  update public.stock_expiry_settings set warning_days=warning_days_input,updated_at=clock_timestamp() where id returning * into result;
  return result;
end $$;

CREATE OR REPLACE FUNCTION public.submit_inventory_audit(staff_name_input text, lines_input jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare audit_id_value uuid; line jsonb; variant_record public.product_variants;
begin
  if not public.has_permission('inventory') then raise exception 'Permission denied'; end if;
  insert into public.inventory_audits(created_by,staff_name)
  values(auth.uid(),left(trim(staff_name_input),160)) returning id into audit_id_value;
  for line in select value from jsonb_array_elements(lines_input) loop
    select * into variant_record from public.product_variants
    where id=(line->>'variant_id')::uuid and is_active;
    if variant_record.id is null then raise exception 'Product variant not found'; end if;
    insert into public.inventory_audit_lines(audit_id,variant_id,product_name,sku,counted,system_stock)
    values(audit_id_value,variant_record.id,line->>'product_name',variant_record.sku,(line->>'counted')::integer,variant_record.stock_quantity);
  end loop;
  return audit_id_value;
end;
$$;

-- Keep the existing narrow stock guard aligned with the merged permission.
do $$ declare definition text; begin
  definition:=pg_get_functiondef('public.guard_product_engine_write()'::regprocedure);
  execute replace(definition,'public.has_permission(''inventory.submit'')','public.has_permission(''inventory'')');
end $$;

notify pgrst, 'reload schema';
commit;
