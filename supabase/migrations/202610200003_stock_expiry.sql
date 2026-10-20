-- Additive upgrade. Keep products, existing stock, orders and legacy batches intact.
begin;
-- Prevent receipts or sales from changing the opening balance during activation.
lock table public.product_variants,public.product_batches,public.stock_movements in share row exclusive mode;

create table if not exists public.stock_expiry_settings (
  id boolean primary key default true check (id),
  warning_days integer not null default 30 check (warning_days between 0 and 3650),
  initialized_at timestamptz,
  updated_at timestamptz not null default now()
);
insert into public.stock_expiry_settings(id) values(true) on conflict do nothing;

create table if not exists public.stock_expiry_receipts (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete set null,
  variant_id uuid references public.product_variants(id) on delete set null,
  product_name text not null,
  variant_sku text not null,
  source_batch_id uuid references public.product_batches(id) on delete set null,
  source_movement_id uuid references public.stock_movements(id) on delete set null,
  origin text not null,
  origin_id uuid,
  quantity integer not null check (quantity > 0),
  tracks_expiry boolean not null default false,
  import_date date,
  created_at timestamptz not null default now()
);
create index if not exists stock_expiry_receipts_variant on public.stock_expiry_receipts(variant_id);

create table if not exists public.stock_expiry_lots (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.stock_expiry_receipts(id),
  variant_id uuid references public.product_variants(id) on delete set null,
  expiry_date date,
  initial_quantity integer not null check (initial_quantity >= 0),
  remaining_quantity integer not null check (remaining_quantity between 0 and initial_quantity),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists stock_expiry_lots_available on public.stock_expiry_lots(variant_id,expiry_date) where remaining_quantity>0;
create index if not exists stock_expiry_lots_receipt on public.stock_expiry_lots(receipt_id);

create table if not exists public.stock_expiry_allocations (
  id bigint generated always as identity primary key,
  movement_id uuid references public.stock_movements(id) on delete set null,
  lot_id uuid not null references public.stock_expiry_lots(id),
  variant_id uuid references public.product_variants(id) on delete set null,
  order_id uuid, -- Snapshot: retain traceability even if an order is later removed.
  quantity_delta integer not null check (quantity_delta<>0),
  returned_quantity integer not null default 0 check (returned_quantity>=0),
  expiry_date_snapshot date,
  created_at timestamptz not null default now(),
  check (returned_quantity <= greatest(-quantity_delta,0))
);
create index if not exists stock_expiry_allocations_order on public.stock_expiry_allocations(order_id,variant_id) where quantity_delta<0;

create table if not exists public.stock_expiry_requests (
  id uuid primary key,
  actor_id uuid not null,
  kind text not null,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.stock_expiry_settings enable row level security;
alter table public.stock_expiry_receipts enable row level security;
alter table public.stock_expiry_lots enable row level security;
alter table public.stock_expiry_allocations enable row level security;
alter table public.stock_expiry_requests enable row level security;
do $$ declare relation text; begin
  foreach relation in array array['stock_expiry_settings','stock_expiry_receipts','stock_expiry_lots','stock_expiry_allocations'] loop
    execute format('drop policy if exists stock_expiry_read on public.%I',relation);
    execute format('create policy stock_expiry_read on public.%I for select to authenticated using (public.has_permission(''warehouse''))',relation);
    execute format('revoke all on public.%I from anon,authenticated',relation);
    execute format('grant select on public.%I to authenticated',relation);
    execute format('grant all on public.%I to service_role',relation);
  end loop;
end $$;
revoke all on public.stock_expiry_requests from anon,authenticated;
grant all on public.stock_expiry_requests to service_role;

-- Seed the new ledger once. A legacy excess cannot identify which dates were sold;
-- preserve those old batches and represent the current balance as unknown instead.
do $$ declare v record; b record; receipt_id_value uuid; total bigint; tracked boolean; begin
  perform 1 from public.stock_expiry_settings where id for update;
  if (select initialized_at is not null from public.stock_expiry_settings where id) then return; end if;
  for v in select pv.*,p.name from public.product_variants pv join public.products p on p.id=pv.product_id where pv.stock_quantity>0 loop
    select coalesce(sum(quantity),0),coalesce(bool_or(expiry_date is not null),false) into total,tracked
      from public.product_batches where variant_id=v.id and quantity>0;
    if total<=v.stock_quantity then
      for b in select * from public.product_batches where variant_id=v.id and quantity>0 order by created_at,id loop
        receipt_id_value:=gen_random_uuid();
        insert into public.stock_expiry_receipts(id,product_id,variant_id,product_name,variant_sku,source_batch_id,origin,quantity,tracks_expiry,import_date,created_at)
        values(receipt_id_value,v.product_id,v.id,v.name,v.sku,b.id,'opening_batch',b.quantity,b.expiry_date is not null,b.import_date,b.created_at);
        insert into public.stock_expiry_lots(receipt_id,variant_id,expiry_date,initial_quantity,remaining_quantity)
        values(receipt_id_value,v.id,b.expiry_date,b.quantity,b.quantity);
      end loop;
    else total:=0; end if;
    if total<v.stock_quantity then
      receipt_id_value:=gen_random_uuid();
      insert into public.stock_expiry_receipts(id,product_id,variant_id,product_name,variant_sku,origin,quantity,tracks_expiry)
      values(receipt_id_value,v.product_id,v.id,v.name,v.sku,case when tracked then 'opening_unknown' else 'opening_stock' end,v.stock_quantity-total,tracked);
      insert into public.stock_expiry_lots(receipt_id,variant_id,initial_quantity,remaining_quantity)
      values(receipt_id_value,v.id,v.stock_quantity-total,v.stock_quantity-total);
    end if;
  end loop;
  update public.stock_expiry_settings set initialized_at=clock_timestamp() where id;
end $$;

create or replace function public._stock_expiry_today() returns date language sql stable
  set search_path=public as $$ select (now() at time zone 'Asia/Bangkok')::date $$;

create or replace function public._stock_expiry_add(
  variant_input uuid, quantity_input integer, tracked_input boolean, expiry_input date,
  origin_input text, origin_id_input uuid default null, movement_input uuid default null,
  batch_input uuid default null, import_input date default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare receipt_value uuid:=gen_random_uuid(); lot_value uuid:=gen_random_uuid(); v record;
begin
  select pv.product_id,pv.sku,p.name into strict v from public.product_variants pv join public.products p on p.id=pv.product_id where pv.id=variant_input;
  insert into public.stock_expiry_receipts(id,product_id,variant_id,product_name,variant_sku,source_batch_id,source_movement_id,origin,origin_id,quantity,tracks_expiry,import_date)
  values(receipt_value,v.product_id,variant_input,v.name,v.sku,batch_input,movement_input,origin_input,origin_id_input,quantity_input,tracked_input or expiry_input is not null,import_input);
  insert into public.stock_expiry_lots(id,receipt_id,variant_id,expiry_date,initial_quantity,remaining_quantity)
  values(lot_value,receipt_value,variant_input,expiry_input,quantity_input,quantity_input);
  return lot_value;
end $$;

create or replace function public._stock_expiry_consume(
  variant_input uuid, quantity_input integer, movement_input uuid, order_input uuid,
  allow_expired_input boolean, date_filter_input date default null, filter_date_input boolean default false,
  batch_input uuid default null
) returns void language plpgsql security definer set search_path=public as $$
declare lot record; remaining integer:=quantity_input; taken integer;
begin
  for lot in select l.* from public.stock_expiry_lots l join public.stock_expiry_receipts r on r.id=l.receipt_id
    where l.variant_id=variant_input and l.remaining_quantity>0
      and (allow_expired_input or l.expiry_date is null or l.expiry_date>=public._stock_expiry_today())
      and (not filter_date_input or l.expiry_date is not distinct from date_filter_input)
      and (batch_input is null or r.source_batch_id=batch_input)
    order by l.expiry_date nulls last,r.import_date nulls last,r.created_at,l.id for update of l
  loop
    exit when remaining=0;
    taken:=least(remaining,lot.remaining_quantity);
    update public.stock_expiry_lots set remaining_quantity=remaining_quantity-taken,updated_at=clock_timestamp() where id=lot.id;
    insert into public.stock_expiry_allocations(movement_id,lot_id,variant_id,order_id,quantity_delta,expiry_date_snapshot)
      values(movement_input,lot.id,variant_input,order_input,-taken,lot.expiry_date);
    remaining:=remaining-taken;
  end loop;
  if remaining>0 then
    if allow_expired_input then raise exception 'Số lượng lô HSD không khớp tồn kho. Hãy tải lại và kiểm tra lô.';
    else raise exception 'Không đủ hàng còn hạn để bán. Có hàng hết hạn hoặc lô đã thay đổi.'; end if;
  end if;
end $$;

-- Catch stock changes without a movement (including opening stock in the product
-- editor). This runs at commit, after normal movements have updated the ledger.
create or replace function public._stock_expiry_balance() returns trigger
language plpgsql security definer set search_path=public as $$
declare v public.product_variants; balance bigint; tracked boolean;
begin
  if tg_op='UPDATE' and new.stock_quantity=old.stock_quantity then return null; end if;
  select * into v from public.product_variants where id=new.id for update;
  if not found then return null; end if;
  select coalesce(sum(remaining_quantity),0) into balance from public.stock_expiry_lots where variant_id=v.id;
  if balance<v.stock_quantity then
    select coalesce(bool_or(tracks_expiry),false) into tracked from public.stock_expiry_receipts where variant_id=v.id;
    perform public._stock_expiry_add(v.id,(v.stock_quantity-balance)::integer,tracked,null,'stock_adjustment');
  elsif balance>v.stock_quantity then
    perform public._stock_expiry_consume(v.id,(balance-v.stock_quantity)::integer,null,null,true);
  end if;
  return null;
end $$;
drop trigger if exists stock_expiry_balance on public.product_variants;
create constraint trigger stock_expiry_balance after insert or update on public.product_variants
  deferrable initially deferred for each row execute function public._stock_expiry_balance();

create or replace function public._stock_expiry_movement() returns trigger
language plpgsql security definer set search_path=public as $$
declare
  lot record; allocation record; event public.stock_conversion_events; batch public.product_batches;
  remaining integer; taken integer; tracked boolean; lot_value uuid; source_unit integer; target_unit integer;
  bucket record; available integer; received integer; preferred uuid;
  variant_stock integer; known_balance bigint; stock_before bigint;
begin
  if new.variant_id is null or new.movement_type in ('to_shelf','to_warehouse') then return new; end if;
  select stock_quantity into variant_stock from public.product_variants where id=new.variant_id for update;
  -- Opening stock and direct edits may still have their deferred balance trigger
  -- pending in this transaction. Backfill only that missing, unknown balance
  -- before allocating this movement. Conversion receipts were already added by
  -- the source movement, so their expected balance includes the received units.
  stock_before:=variant_stock::bigint-case when new.reference_type='stock_conversion' and new.quantity>0 then 0 else new.quantity end;
  select coalesce(sum(remaining_quantity),0) into known_balance from public.stock_expiry_lots where variant_id=new.variant_id;
  if known_balance<stock_before then
    select coalesce(bool_or(tracks_expiry),false) into tracked from public.stock_expiry_receipts where variant_id=new.variant_id;
    perform public._stock_expiry_add(new.variant_id,(stock_before-known_balance)::integer,tracked,null,'stock_adjustment');
  end if;
  if new.reference_type='stock_conversion' then
    select * into strict event from public.stock_conversion_events where id=new.reference_id;
    if new.quantity<0 then
      source_unit:=event.source_quantity/gcd(event.source_quantity,event.target_quantity);
      target_unit:=event.target_quantity/gcd(event.source_quantity,event.target_quantity);
      remaining:=event.source_quantity;
      for bucket in select l.expiry_date,sum(l.remaining_quantity) as available,bool_or(r.tracks_expiry) as tracked,min(r.import_date) as imported
        from public.stock_expiry_lots l join public.stock_expiry_receipts r on r.id=l.receipt_id
        where l.variant_id=event.source_variant_id and l.remaining_quantity>0
        group by l.expiry_date order by l.expiry_date nulls last
      loop
        exit when remaining=0;
        available:=least(remaining,(bucket.available/source_unit)*source_unit)::integer;
        if available=0 then continue; end if;
        received:=(available/source_unit)*target_unit;
        perform public._stock_expiry_consume(event.source_variant_id,available,new.id,null,true,bucket.expiry_date,true);
        perform public._stock_expiry_add(event.target_variant_id,received,bucket.tracked,bucket.expiry_date,'conversion',event.id,null,null,bucket.imported);
        remaining:=remaining-available;
      end loop;
      if remaining>0 then raise exception 'Mỗi nhóm HSD phải đủ % đơn vị nguồn để quy đổi. Không gộp các HSD khác nhau.',source_unit; end if;
    else
      remaining:=new.quantity;
      for lot in select l.* from public.stock_expiry_lots l join public.stock_expiry_receipts r on r.id=l.receipt_id
        where r.origin='conversion' and r.origin_id=event.id and l.variant_id=new.variant_id
      loop
        insert into public.stock_expiry_allocations(movement_id,lot_id,variant_id,quantity_delta,expiry_date_snapshot)
        values(new.id,lot.id,new.variant_id,lot.initial_quantity,lot.expiry_date);
        remaining:=remaining-lot.initial_quantity;
      end loop;
      if remaining<>0 then raise exception 'Phân bổ HSD quy đổi không khớp số lượng nhận.'; end if;
    end if;
    return new;
  end if;
  if new.quantity<0 then
    preferred:=nullif(current_setting('app.stock_expiry_batch',true),'')::uuid;
    perform set_config('app.stock_expiry_batch','',true);
    perform public._stock_expiry_consume(new.variant_id,-new.quantity,new.id,
      case when new.reference_type='order' then new.reference_id else null end,new.movement_type<>'sale',null,false,preferred);
  elsif new.quantity>0 then
    remaining:=new.quantity;
    if new.movement_type='return' and new.reference_type='order' then
      for allocation in select * from public.stock_expiry_allocations
        where order_id=new.reference_id and variant_id=new.variant_id and quantity_delta<0 and returned_quantity< -quantity_delta
        order by id for update
      loop
        exit when remaining=0;
        taken:=least(remaining,-allocation.quantity_delta-allocation.returned_quantity);
        update public.stock_expiry_lots set remaining_quantity=remaining_quantity+taken,updated_at=clock_timestamp() where id=allocation.lot_id;
        update public.stock_expiry_allocations set returned_quantity=returned_quantity+taken where id=allocation.id;
        insert into public.stock_expiry_allocations(movement_id,lot_id,variant_id,order_id,quantity_delta,expiry_date_snapshot)
        values(new.id,allocation.lot_id,new.variant_id,new.reference_id,taken,allocation.expiry_date_snapshot);
        remaining:=remaining-taken;
      end loop;
    end if;
    if remaining>0 then
      if new.reference_type='stock_receipt' then
        select * into batch from public.product_batches where id=new.reference_id and variant_id=new.variant_id;
        tracked:=coalesce(nullif(current_setting('app.stock_expiry_tracking',true),'')::boolean,false) or batch.expiry_date is not null;
      else
        select coalesce(bool_or(tracks_expiry),false) into tracked from public.stock_expiry_receipts where variant_id=new.variant_id;
      end if;
      lot_value:=public._stock_expiry_add(new.variant_id,remaining,tracked,batch.expiry_date,
        case when new.movement_type='in' then 'receipt' when new.movement_type='return' then 'legacy_return' else 'stock_adjustment' end,
        new.reference_id,new.id,batch.id,coalesce(batch.import_date,public._stock_expiry_today()));
      insert into public.stock_expiry_allocations(movement_id,lot_id,variant_id,quantity_delta,expiry_date_snapshot)
      values(new.id,lot_value,new.variant_id,remaining,batch.expiry_date);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists stock_expiry_movement on public.stock_movements;
create trigger stock_expiry_movement after insert on public.stock_movements for each row execute function public._stock_expiry_movement();

-- Preserve the receipt API; add a reference so the independent HSD ledger can
-- retain the actual receipt date and original batch without changing products.
create or replace function public.receive_variant_stock(variant_id_input uuid,quantity_input integer,import_date_input date default null,expiry_date_input date default null)
returns public.product_batches language plpgsql security definer set search_path=public as $$
declare v public.product_variants; b public.product_batches;
begin
  if auth.uid() is null or not public.has_permission('products.receive-stock') then raise exception 'Permission denied for stock receipt'; end if;
  if quantity_input is null or quantity_input<=0 then raise exception 'Quantity must be greater than zero'; end if;
  select * into v from public.product_variants where id=variant_id_input and is_active for update;
  if not found then raise exception 'Product variant not found'; end if;
  update public.product_variants set stock_quantity=stock_quantity+quantity_input,updated_at=now() where id=v.id;
  insert into public.product_batches(variant_id,quantity,import_date,expiry_date)
  values(v.id,quantity_input,coalesce(import_date_input,public._stock_expiry_today()),expiry_date_input) returning * into b;
  insert into public.stock_movements(variant_id,movement_type,quantity,reason,reference_type,reference_id,actor_id,actor_name)
  values(v.id,'in',quantity_input,'Nhập kho theo SKU','stock_receipt',b.id,auth.uid(),coalesce((select full_name from public.profiles where id=auth.uid()),'Hệ thống'));
  return b;
end $$;

-- Keep legacy single-product receiving compatible with the same date ledger.
create or replace function public.receive_product_stock(product_id_input uuid,quantity_input integer,import_date_input date,expiry_date_input date)
returns public.product_batches language plpgsql security definer set search_path=public as $$
declare variant_value uuid;
begin
  if auth.uid() is null or not public.has_permission('products.receive-stock') then raise exception 'Permission denied for stock receipt'; end if;
  if (select count(*) from public.product_variants where product_id=product_id_input and is_active)<>1 then
    raise exception 'Choose a SKU in Product editor for multi-variant stock';
  end if;
  select id into variant_value from public.product_variants where product_id=product_id_input and is_active;
  return public.receive_variant_stock(variant_value,quantity_input,import_date_input,expiry_date_input);
end $$;

-- Honor explicit batch selection used by older API consumers; POS can continue
-- sending null and automatically allocate FEFO behind its existing single line.
do $$ declare definition text; begin
  definition:=pg_get_functiondef('public.reserve_variant_stock(uuid,integer,uuid)'::regprocedure);
  if position('app.stock_expiry_batch' in definition)=0 then
    if position('if batch_id_input is not null then' in definition)=0 then raise exception 'Unexpected stock reservation function; upgrade was not applied.'; end if;
    execute replace(definition,'if batch_id_input is not null then',
      'perform set_config(''app.stock_expiry_batch'',coalesce(batch_id_input::text,''''),true); if batch_id_input is not null then');
  end if;
end $$;

create or replace function public.receive_stock_with_expiry(items_input jsonb,request_id_input uuid) returns integer
language plpgsql security definer set search_path=public as $$
declare previous public.stock_expiry_requests; item jsonb; processed integer:=0; prior_tracking text;
begin
  if auth.uid() is null or not public.has_permission('products.receive-stock') then raise exception 'Bạn không có quyền nhập kho.'; end if;
  if request_id_input is null or items_input is null or jsonb_typeof(items_input)<>'array' or jsonb_array_length(items_input)=0 then raise exception 'Hãy chọn sản phẩm và số lượng nhập.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(request_id_input::text,0));
  select * into previous from public.stock_expiry_requests where id=request_id_input;
  if found then
    if previous.actor_id<>auth.uid() or previous.kind<>'receipt' or previous.payload<>items_input then raise exception 'Mã thao tác đã dùng cho dữ liệu khác.'; end if;
    return (previous.result->>'count')::integer;
  end if;
  perform 1 from public.product_variants where id in (select (value->>'variant_id')::uuid from jsonb_array_elements(items_input)) order by id for update;
  prior_tracking:=current_setting('app.stock_expiry_tracking',true);
  for item in select value from jsonb_array_elements(items_input) loop
    perform set_config('app.stock_expiry_tracking',coalesce(item->>'has_expiry','false'),true);
    perform public.receive_variant_stock((item->>'variant_id')::uuid,(item->>'quantity')::integer,null,null);
    processed:=processed+1;
  end loop;
  perform set_config('app.stock_expiry_tracking',coalesce(prior_tracking,''),true);
  insert into public.stock_expiry_requests(id,actor_id,kind,payload,result) values(request_id_input,auth.uid(),'receipt',items_input,jsonb_build_object('count',processed));
  return processed;
end $$;

create or replace function public.list_stock_expiry() returns table(variant_id uuid,stock_quantity integer,lots jsonb)
language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null or not public.has_permission('warehouse') then raise exception 'Bạn không có quyền xem HSD.'; end if;
  return query select v.id,v.stock_quantity,coalesce((select jsonb_agg(jsonb_build_object(
    'id',l.id,'receipt_id',r.id,'expiry_date',l.expiry_date,'initial_quantity',l.initial_quantity,'remaining_quantity',l.remaining_quantity,
    'updated_at',l.updated_at,'tracks_expiry',r.tracks_expiry,'import_date',r.import_date,'origin',r.origin,'created_at',r.created_at
  ) order by l.expiry_date nulls last,r.created_at,l.id)
    from public.stock_expiry_lots l join public.stock_expiry_receipts r on r.id=l.receipt_id
    where l.variant_id=v.id and l.remaining_quantity>0),'[]'::jsonb)
  from public.product_variants v join public.products p on p.id=v.product_id where p.deleted_at is null order by v.id;
end $$;

create or replace function public.assign_stock_expiry(lot_id_input uuid,expected_updated_at_input timestamptz,allocations_input jsonb,request_id_input uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare l public.stock_expiry_lots; receipt public.stock_expiry_receipts; part record; total bigint; payload jsonb; previous public.stock_expiry_requests;
begin
  if auth.uid() is null or not public.has_permission('warehouse.expiry.manage') then raise exception 'Bạn không có quyền bổ sung hoặc sửa HSD.'; end if;
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
  if auth.uid() is null or not public.has_permission('warehouse.expiry.settings') then raise exception 'Bạn không có quyền cài đặt cảnh báo HSD.'; end if;
  if warning_days_input is null or warning_days_input not between 0 and 3650 then raise exception 'Mốc cảnh báo phải từ 0 đến 3650 ngày.'; end if;
  select * into result from public.stock_expiry_settings where id for update;
  if expected_updated_at_input is null or result.updated_at<>expected_updated_at_input then raise exception 'Cài đặt đã thay đổi. Hãy tải lại.'; end if;
  update public.stock_expiry_settings set warning_days=warning_days_input,updated_at=clock_timestamp() where id returning * into result;
  return result;
end $$;

-- Internal functions can only run through their triggers or permission-checked RPCs.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and (p.proname like '\_stock\_expiry\_%' escape '\' or p.proname in ('receive_stock_with_expiry','list_stock_expiry','assign_stock_expiry','save_stock_expiry_settings'))
  loop execute format('revoke all on function %s from public,anon,authenticated',f.signature); end loop;
end $$;
grant execute on function public.receive_stock_with_expiry(jsonb,uuid) to authenticated;
grant execute on function public.list_stock_expiry() to authenticated;
grant execute on function public.assign_stock_expiry(uuid,timestamptz,jsonb,uuid) to authenticated;
grant execute on function public.save_stock_expiry_settings(integer,timestamptz) to authenticated;
notify pgrst, 'reload schema';
commit;
