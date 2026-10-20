-- Additive upgrade only: never run the fresh-install schema against existing data.
begin;

create table if not exists public.stock_conversions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  variant_a_id uuid not null references public.product_variants(id) on delete cascade,
  quantity_a integer not null check (quantity_a > 0),
  variant_b_id uuid not null references public.product_variants(id) on delete cascade,
  quantity_b integer not null check (quantity_b > 0),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (variant_a_id <> variant_b_id)
);
create unique index if not exists stock_conversions_variant_pair
  on public.stock_conversions (least(variant_a_id,variant_b_id), greatest(variant_a_id,variant_b_id));
create index if not exists stock_conversions_product on public.stock_conversions(product_id);

create table if not exists public.stock_conversion_events (
  id uuid primary key, -- Client request ID also makes retries idempotent.
  conversion_id uuid references public.stock_conversions(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  source_variant_id uuid references public.product_variants(id) on delete set null,
  target_variant_id uuid references public.product_variants(id) on delete set null,
  source_sku text not null,
  target_sku text not null,
  source_quantity integer not null check (source_quantity > 0),
  target_quantity integer not null check (target_quantity > 0),
  source_stock_before integer not null,
  target_stock_before integer not null,
  source_stock_after integer not null check (source_stock_after >= 0),
  target_stock_after integer not null check (target_stock_after >= 0),
  reversed boolean not null,
  note text not null default '',
  actor_id uuid,
  actor_name text not null,
  batches jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists stock_conversion_events_created on public.stock_conversion_events(created_at desc);

alter table public.stock_conversions enable row level security;
alter table public.stock_conversion_events enable row level security;
drop policy if exists stock_conversions_read on public.stock_conversions;
create policy stock_conversions_read on public.stock_conversions for select to authenticated
  using (public.has_permission('warehouse.conversion.configure') or public.has_permission('warehouse.conversion.execute'));
drop policy if exists stock_conversion_events_read on public.stock_conversion_events;
create policy stock_conversion_events_read on public.stock_conversion_events for select to authenticated
  using (public.has_permission('warehouse.conversion.configure') or public.has_permission('warehouse.conversion.execute'));
revoke all on public.stock_conversions, public.stock_conversion_events from anon, authenticated;
grant select on public.stock_conversions, public.stock_conversion_events to authenticated;
grant all on public.stock_conversions, public.stock_conversion_events to service_role;

-- Retain the existing guard and RLS policies. Add this permission ONLY to its
-- stock-only UPDATE branch. Conversion operators still cannot write SKUs directly.
do $$
declare definition text;
begin
  definition := pg_get_functiondef('public.guard_product_engine_write()'::regprocedure);
  if position('warehouse.conversion.execute' in definition) = 0 then
    if position('or public.has_permission(''inventory.submit'')' in definition) = 0 then
      raise exception 'Stock conversion upgrade requires the current product stock guard.';
    end if;
    execute replace(definition,
      'or public.has_permission(''inventory.submit'')',
      'or public.has_permission(''inventory.submit'') or public.has_permission(''warehouse.conversion.execute'')');
  end if;
end;
$$;

create or replace function public.save_stock_conversion(
  product_id_input uuid, variant_a_id_input uuid, quantity_a_input integer,
  variant_b_id_input uuid, quantity_b_input integer,
  conversion_id_input uuid default null, expected_updated_at_input timestamptz default null
) returns public.stock_conversions
language plpgsql security definer set search_path = public as $$
declare saved public.stock_conversions; existing public.stock_conversions;
begin
  if auth.uid() is null or not public.has_permission('warehouse.conversion.configure') then
    raise exception 'Bạn không có quyền thiết lập quy đổi.';
  end if;
  if quantity_a_input is null or quantity_a_input <= 0 or quantity_b_input is null or quantity_b_input <= 0 then
    raise exception 'Số lượng hai phía phải là số nguyên lớn hơn 0.';
  end if;
  if variant_a_id_input is null or variant_b_id_input is null or variant_a_id_input = variant_b_id_input then
    raise exception 'Hãy chọn hai biến thể khác nhau của cùng một sản phẩm.';
  end if;
  if conversion_id_input is not null then
    select * into existing from public.stock_conversions where id=conversion_id_input for update;
    if not found then raise exception 'Thiết lập quy đổi không còn tồn tại.'; end if;
    if expected_updated_at_input is null or existing.updated_at <> expected_updated_at_input then
      raise exception 'Thiết lập đã thay đổi. Hãy mở lại trước khi lưu.';
    end if;
    if existing.product_id <> product_id_input then raise exception 'Không thể chuyển thiết lập sang sản phẩm khác.'; end if;
  end if;
  perform 1 from public.products where id=product_id_input and deleted_at is null and status='active' for update;
  if not found then raise exception 'Sản phẩm không còn hoạt động.'; end if;
  perform 1 from public.product_variants where id in (variant_a_id_input,variant_b_id_input) order by id for update;
  if (select count(*) from public.product_variants where id in (variant_a_id_input,variant_b_id_input)
    and product_id=product_id_input and is_active) <> 2 then
    raise exception 'Hai biến thể phải đang hoạt động và thuộc cùng sản phẩm đã chọn.';
  end if;
  if conversion_id_input is null then
    insert into public.stock_conversions(product_id,variant_a_id,quantity_a,variant_b_id,quantity_b,created_by)
    values(product_id_input,variant_a_id_input,quantity_a_input,variant_b_id_input,quantity_b_input,auth.uid()) returning * into saved;
  else
    update public.stock_conversions set variant_a_id=variant_a_id_input, quantity_a=quantity_a_input,
      variant_b_id=variant_b_id_input, quantity_b=quantity_b_input, updated_at=clock_timestamp()
    where id=conversion_id_input returning * into saved;
  end if;
  return saved;
exception when unique_violation then
  raise exception 'Cặp biến thể này đã có thiết lập quy đổi. Hãy mở card sản phẩm để chỉnh sửa.';
end;
$$;

create or replace function public.execute_stock_conversion(
  conversion_id_input uuid, reversed_input boolean, quantity_input integer,
  request_id_input uuid, expected_updated_at_input timestamptz, note_input text default ''
) returns public.stock_conversion_events
language plpgsql security definer set search_path = public as $$
declare
  setting public.stock_conversions; previous public.stock_conversion_events; result public.stock_conversion_events;
  source public.product_variants; target public.product_variants; product_record public.products;
  source_id uuid; target_id uuid; source_ratio integer; target_ratio integer; received bigint;
  actor_name_value text; remaining integer; taken integer; batch record; batch_details jsonb := '[]'::jsonb;
  earliest_expiry date; unknown_expiry boolean := false;
begin
  if auth.uid() is null or not public.has_permission('warehouse.conversion.execute') then
    raise exception 'Bạn không có quyền thực hiện quy đổi.';
  end if;
  if quantity_input is null or quantity_input <= 0 or request_id_input is null or reversed_input is null then
    raise exception 'Số lượng quy đổi phải là số nguyên lớn hơn 0.';
  end if;
  -- Serialize retries before inspecting the event, including simultaneous requests.
  perform pg_advisory_xact_lock(hashtextextended(request_id_input::text,0));
  select * into previous from public.stock_conversion_events where id=request_id_input;
  if found then
    if previous.actor_id is distinct from auth.uid() or previous.conversion_id is distinct from conversion_id_input
      or previous.reversed <> reversed_input or previous.source_quantity <> quantity_input
      or previous.note <> left(trim(coalesce(note_input,'')),1000) then
      raise exception 'Mã thao tác đã được sử dụng cho một lần quy đổi khác.';
    end if;
    return previous;
  end if;
  select * into setting from public.stock_conversions where id=conversion_id_input for update;
  if not found then raise exception 'Thiết lập quy đổi không còn tồn tại.'; end if;
  if expected_updated_at_input is null or setting.updated_at <> expected_updated_at_input then
    raise exception 'Thiết lập đã thay đổi. Hãy mở lại sản phẩm trước khi quy đổi.';
  end if;
  select * into product_record from public.products where id=setting.product_id and deleted_at is null and status='active' for update;
  if not found then raise exception 'Sản phẩm không còn hoạt động.'; end if;
  source_id := case when reversed_input then setting.variant_b_id else setting.variant_a_id end;
  target_id := case when reversed_input then setting.variant_a_id else setting.variant_b_id end;
  source_ratio := case when reversed_input then setting.quantity_b else setting.quantity_a end;
  target_ratio := case when reversed_input then setting.quantity_a else setting.quantity_b end;
  if quantity_input % source_ratio <> 0 then
    raise exception 'Số lượng quy đổi phải là bội số của %.', source_ratio;
  end if;
  received := (quantity_input::bigint / source_ratio) * target_ratio;
  if received > 2147483647 then raise exception 'Số lượng nhận vượt giới hạn cho phép.'; end if;
  -- Same ordering in both directions avoids deadlocks on a shared variant pair.
  perform 1 from public.product_variants where id in (source_id,target_id) order by id for update;
  select * into source from public.product_variants where id=source_id and product_id=setting.product_id and is_active;
  select * into target from public.product_variants where id=target_id and product_id=setting.product_id and is_active;
  if source.id is null or target.id is null then raise exception 'Biến thể không còn hoạt động hoặc đã thay đổi sản phẩm.'; end if;
  if source.stock_quantity < quantity_input then raise exception 'Không đủ tồn kho để quy đổi. Hiện còn %.', source.stock_quantity; end if;
  if target.stock_quantity::bigint + received > 2147483647 then raise exception 'Tồn sau quy đổi vượt giới hạn cho phép.'; end if;

  update public.product_variants set stock_quantity=stock_quantity-quantity_input,updated_at=now() where id=source_id;
  update public.product_variants set stock_quantity=stock_quantity+received::integer,updated_at=now() where id=target_id;
  -- Carry the earliest known expiry to the resulting batch. Existing unbatched
  -- inventory is supported; no unrelated batches or prices are rewritten.
  remaining := quantity_input;
  for batch in select * from public.product_batches where variant_id=source_id and quantity>0
    order by expiry_date nulls last,created_at,id for update
  loop
    exit when remaining=0;
    taken := least(remaining,batch.quantity);
    update public.product_batches set quantity=quantity-taken,updated_at=now() where id=batch.id;
    batch_details := batch_details || jsonb_build_array(jsonb_build_object('id',batch.id,'quantity',taken,'expiry_date',batch.expiry_date));
    if batch.expiry_date is null then unknown_expiry := true;
    elsif earliest_expiry is null or batch.expiry_date < earliest_expiry then earliest_expiry := batch.expiry_date; end if;
    remaining := remaining-taken;
  end loop;
  if remaining>0 then unknown_expiry := true; end if;
  insert into public.product_batches(variant_id,quantity,import_date,expiry_date)
    values(target_id,received::integer,current_date,case when unknown_expiry then null else earliest_expiry end);
  select coalesce(nullif(trim(full_name),''),'Nhân viên') into actor_name_value from public.profiles where id=auth.uid();
  insert into public.stock_conversion_events(id,conversion_id,product_id,product_name,source_variant_id,target_variant_id,
    source_sku,target_sku,source_quantity,target_quantity,source_stock_before,target_stock_before,
    source_stock_after,target_stock_after,reversed,note,actor_id,actor_name,batches)
  values(request_id_input,setting.id,setting.product_id,product_record.name,source_id,target_id,source.sku,target.sku,
    quantity_input,received::integer,source.stock_quantity,target.stock_quantity,source.stock_quantity-quantity_input,
    target.stock_quantity+received::integer,reversed_input,left(trim(coalesce(note_input,'')),1000),auth.uid(),actor_name_value,batch_details)
  returning * into result;
  insert into public.stock_movements(variant_id,movement_type,quantity,reason,reference_type,reference_id,actor_id,actor_name)
  values
    (source_id,'adjustment',-quantity_input,'Quy đổi: ' || quantity_input || ' ' || source.sku || ' → ' || received || ' ' || target.sku,
      'stock_conversion',result.id,auth.uid(),actor_name_value),
    (target_id,'adjustment',received::integer,'Quy đổi: ' || quantity_input || ' ' || source.sku || ' → ' || received || ' ' || target.sku,
      'stock_conversion',result.id,auth.uid(),actor_name_value);
  return result;
end;
$$;

revoke all on function public.save_stock_conversion(uuid,uuid,integer,uuid,integer,uuid,timestamptz) from public,anon;
revoke all on function public.execute_stock_conversion(uuid,boolean,integer,uuid,timestamptz,text) from public,anon;
grant execute on function public.save_stock_conversion(uuid,uuid,integer,uuid,integer,uuid,timestamptz) to authenticated;
grant execute on function public.execute_stock_conversion(uuid,boolean,integer,uuid,timestamptz,text) to authenticated;
notify pgrst, 'reload schema';
commit;
