-- Hoang An POS - normalized e-commerce product engine
-- Clean-cut migration for development/test databases.
-- Run after supabase/schema.sql. Product/order test data is intentionally removed.

begin;

drop function if exists public.adjust_product_variant_stock(uuid, jsonb, integer, integer);
drop function if exists public.decrement_product_stock(uuid, integer);
drop function if exists public.receive_product_stock(uuid, integer, date, date);
drop function if exists public.issue_product_stock(uuid, integer, text);
drop function if exists public.transfer_product_shelf(uuid, uuid, integer, text);
drop function if exists public.create_pos_order(text, uuid, uuid, jsonb, numeric, text, numeric, text, text, text);
drop function if exists public.cancel_pos_order(uuid, text);
drop function if exists public.delete_pos_orders(uuid[], text);
drop function if exists public.set_product_active(uuid, boolean);
drop function if exists public.soft_delete_product(uuid);
drop function if exists public.clear_products_image_url(text);

drop table if exists public.order_items cascade;
truncate table public.orders, public.order_audit_events restart identity cascade;
drop table if exists public.stock_movements cascade;
drop table if exists public.product_batches cascade;
drop table if exists public.inventory_audit_lines cascade;
drop table if exists public.inventory_audits cascade;
drop table if exists public.products cascade;
drop table if exists public.product_categories cascade;
drop table if exists public.product_settings cascade;

create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (slug)
);
create unique index product_categories_name_lower_idx on public.product_categories (lower(name));

create table public.product_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (code)
);
create unique index product_types_name_lower_idx on public.product_types (lower(name));

create table public.product_attributes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null,
  data_type text not null check (data_type in ('text','number','boolean','date','option','json')),
  input_type text not null check (input_type in ('text','textarea','number','select','multi_select','radio','checkbox','switch','date','color','image','image_text')),
  unit text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (code)
);

create table public.product_type_attributes (
  product_type_id uuid not null references public.product_types(id) on delete cascade,
  attribute_id uuid not null references public.product_attributes(id) on delete cascade,
  role text not null default 'specification' check (role in ('specification','variant')),
  is_required boolean not null default false,
  display_type text check (display_type is null or display_type in ('color_circle','text_button','image','image_text','dropdown')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (product_type_id, attribute_id)
);

-- Starter catalog configuration. Admin can edit or extend all records later.
insert into public.product_categories(name, slug) values
  ('Thời trang', 'thoi-trang'),
  ('Điện tử', 'dien-tu'),
  ('Gia dụng', 'gia-dung'),
  ('Nội thất', 'noi-that'),
  ('Máy móc', 'may-moc'),
  ('Khác', 'khac')
on conflict (slug) do update set name = excluded.name, is_active = true;

insert into public.product_types(name, code, description) values
  ('Sản phẩm đơn giản', 'general', 'Sản phẩm chỉ có một SKU, phù hợp để nhập nhanh.'),
  ('Thời trang', 'clothing', 'Quần áo, phụ kiện với màu sắc và kích thước.'),
  ('Laptop', 'laptop', 'Máy tính xách tay với RAM, dung lượng và màu sắc.'),
  ('Điện thoại', 'smartphone', 'Điện thoại với dung lượng và màu sắc.'),
  ('Nội thất', 'furniture', 'Bàn, ghế, tủ và đồ dùng nội thất.'),
  ('Máy móc', 'machine', 'Thiết bị công nghiệp với điện áp và cấu hình kỹ thuật.')
on conflict (code) do update set name = excluded.name, description = excluded.description, is_active = true;

insert into public.product_attributes(name, code, data_type, input_type, unit) values
  ('Thương hiệu', 'brand', 'text', 'text', null),
  ('Xuất xứ', 'origin', 'text', 'text', null),
  ('Bảo hành', 'warranty', 'number', 'number', 'tháng'),
  ('Trọng lượng', 'weight', 'number', 'number', 'kg'),
  ('Màu sắc', 'color', 'option', 'color', null),
  ('Kích thước', 'size', 'option', 'select', null),
  ('Chất liệu', 'material', 'option', 'select', null),
  ('CPU', 'cpu', 'text', 'text', null),
  ('RAM', 'ram', 'option', 'select', 'GB'),
  ('Dung lượng', 'storage', 'option', 'select', 'GB'),
  ('Kích thước màn hình', 'screen_size', 'number', 'number', 'inch'),
  ('Điện áp', 'voltage', 'option', 'select', 'V'),
  ('Loại cao su', 'rubber_type', 'option', 'select', null),
  ('WLL', 'wll', 'number', 'number', 'kg'),
  ('Kích thước D×R×C', 'dimensions', 'text', 'text', 'cm')
on conflict (code) do update set name = excluded.name, data_type = excluded.data_type, input_type = excluded.input_type, unit = excluded.unit, is_active = true;

insert into public.product_type_attributes(product_type_id, attribute_id, role, is_required, display_type, sort_order)
select pt.id, pa.id, mapping.role, mapping.is_required, mapping.display_type, mapping.sort_order
from (values
  ('general', 'brand', 'specification', false, null::text, 1),
  ('general', 'origin', 'specification', false, null::text, 2),
  ('clothing', 'brand', 'specification', false, null::text, 1),
  ('clothing', 'material', 'specification', false, null::text, 2),
  ('clothing', 'color', 'variant', true, 'color_circle', 3),
  ('clothing', 'size', 'variant', true, 'text_button', 4),
  ('laptop', 'brand', 'specification', true, null::text, 1),
  ('laptop', 'cpu', 'specification', true, null::text, 2),
  ('laptop', 'screen_size', 'specification', false, null::text, 3),
  ('laptop', 'weight', 'specification', false, null::text, 4),
  ('laptop', 'ram', 'variant', true, 'text_button', 5),
  ('laptop', 'storage', 'variant', true, 'image_text', 6),
  ('laptop', 'color', 'variant', false, 'color_circle', 7),
  ('smartphone', 'brand', 'specification', true, null::text, 1),
  ('smartphone', 'screen_size', 'specification', false, null::text, 2),
  ('smartphone', 'weight', 'specification', false, null::text, 3),
  ('smartphone', 'storage', 'variant', true, 'text_button', 4),
  ('smartphone', 'color', 'variant', true, 'color_circle', 5),
  ('furniture', 'dimensions', 'specification', false, null::text, 1),
  ('furniture', 'weight', 'specification', false, null::text, 2),
  ('furniture', 'material', 'variant', false, 'text_button', 3),
  ('furniture', 'color', 'variant', false, 'color_circle', 4),
  ('machine', 'wll', 'specification', true, null::text, 1),
  ('machine', 'dimensions', 'specification', false, null::text, 2),
  ('machine', 'weight', 'specification', false, null::text, 3),
  ('machine', 'voltage', 'variant', true, 'dropdown', 4),
  ('machine', 'rubber_type', 'variant', false, 'text_button', 5)
) as mapping(type_code, attribute_code, role, is_required, display_type, sort_order)
join public.product_types pt on pt.code = mapping.type_code
join public.product_attributes pa on pa.code = mapping.attribute_code
on conflict (product_type_id, attribute_id) do update set
  role = excluded.role,
  is_required = excluded.is_required,
  display_type = excluded.display_type,
  sort_order = excluded.sort_order;

create table public.products (
  id uuid primary key default gen_random_uuid(),
  product_type_id uuid references public.product_types(id) on delete set null,
  category_id uuid references public.product_categories(id) on delete set null,
  name text not null,
  slug text not null,
  description text,
  status text not null default 'draft' check (status in ('draft','active','inactive')),
  is_reward boolean not null default false,
  reward_points_cost integer not null default 0 check (reward_points_cost >= 0),
  seo_title text,
  seo_description text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (slug)
);

create table public.product_specifications (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  attribute_id uuid references public.product_attributes(id) on delete set null,
  name text not null,
  code text not null,
  data_type text not null check (data_type in ('text','number','boolean','date','option','json')),
  input_type text not null check (input_type in ('text','textarea','number','select','multi_select','radio','checkbox','switch','date','color','image','image_text')),
  unit text,
  value jsonb not null default 'null'::jsonb,
  is_required boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, code)
);

create table public.product_variant_attributes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  source_attribute_id uuid references public.product_attributes(id) on delete set null,
  name text not null,
  code text not null,
  data_type text not null default 'option' check (data_type in ('text','number','boolean','date','option','json')),
  display_type text not null default 'text_button' check (display_type in ('color_circle','text_button','image','image_text','dropdown')),
  is_required boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, code),
  unique (id, product_id)
);

create table public.product_variant_values (
  id uuid primary key default gen_random_uuid(),
  variant_attribute_id uuid not null references public.product_variant_attributes(id) on delete cascade,
  label text not null,
  value text not null,
  metadata jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (variant_attribute_id, value),
  unique (id, variant_attribute_id)
);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  sku text not null,
  barcode text unique check (barcode is null or barcode ~ '^[0-9]{13}$'),
  base_price numeric(12,2) not null default 0 check (base_price >= 0),
  compare_at_price numeric(12,2) check (compare_at_price is null or compare_at_price >= base_price),
  cost_price numeric(12,2) not null default 0 check (cost_price >= 0),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  shelf_quantity integer not null default 0 check (shelf_quantity >= 0 and shelf_quantity <= stock_quantity),
  weight numeric(12,3) check (weight is null or weight >= 0),
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sku),
  unique (id, product_id)
);
create unique index product_variants_one_default_idx on public.product_variants(product_id) where is_default;
create index product_variants_product_idx on public.product_variants(product_id, is_active);

create table public.variant_value_links (
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  variant_value_id uuid not null references public.product_variant_values(id) on delete cascade,
  variant_attribute_id uuid not null references public.product_variant_attributes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (variant_id, variant_value_id),
  unique (variant_id, variant_attribute_id),
  foreign key (variant_value_id, variant_attribute_id)
    references public.product_variant_values(id, variant_attribute_id) on delete cascade
);

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid,
  variant_value_id uuid references public.product_variant_values(id) on delete cascade,
  image_url text not null,
  cloudinary_public_id text,
  alt_text text,
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (variant_id, product_id) references public.product_variants(id, product_id) on delete cascade,
  check (not (variant_id is not null and variant_value_id is not null))
);
create index product_images_owner_idx on public.product_images(product_id, variant_id, variant_value_id, sort_order);

create table public.product_batches (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  quantity integer not null check (quantity >= 0),
  shelf_quantity integer not null default 0 check (shelf_quantity >= 0 and shelf_quantity <= quantity),
  import_date date,
  expiry_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  movement_type text not null check (movement_type in ('in','out','sale','return','to_shelf','to_warehouse','adjustment')),
  quantity integer not null check (quantity <> 0),
  reason text,
  reference_type text,
  reference_id uuid,
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text not null,
  created_at timestamptz not null default now()
);
create index stock_movements_variant_created_idx on public.stock_movements(variant_id, created_at desc);

create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  trigger_type text not null check (trigger_type in ('automatic','coupon')),
  discount_type text not null check (discount_type in ('percentage','fixed_amount','free_shipping')),
  discount_value numeric(12,2) not null default 0 check (discount_value >= 0),
  max_discount_amount numeric(12,2) check (max_discount_amount is null or max_discount_amount >= 0),
  start_at timestamptz,
  end_at timestamptz,
  total_usage_limit integer check (total_usage_limit is null or total_usage_limit > 0),
  usage_per_customer integer check (usage_per_customer is null or usage_per_customer > 0),
  priority integer not null default 0,
  is_stackable boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((trigger_type = 'coupon' and nullif(trim(code),'') is not null) or trigger_type = 'automatic'),
  check (end_at is null or start_at is null or end_at > start_at),
  check (discount_type <> 'percentage' or discount_value <= 100)
);
create unique index promotions_code_upper_idx on public.promotions(upper(code)) where code is not null;

create table public.promotion_condition_groups (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  combinator text not null default 'and' check (combinator in ('and','or')),
  sort_order integer not null default 0
);
create table public.promotion_conditions (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  group_id uuid references public.promotion_condition_groups(id) on delete cascade,
  condition_type text not null,
  operator text not null check (operator in ('eq','neq','gt','gte','lt','lte','in','not_in')),
  value jsonb not null,
  created_at timestamptz not null default now()
);
create table public.promotion_scopes (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  scope_type text not null check (scope_type in ('all','category','product','variant')),
  scope_id uuid,
  created_at timestamptz not null default now(),
  check ((scope_type = 'all' and scope_id is null) or (scope_type <> 'all' and scope_id is not null))
);
create table public.promotion_redemptions (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions(id) on delete restrict,
  user_id uuid references public.customers(id) on delete set null,
  order_id uuid not null references public.orders(id) on delete restrict,
  discount_amount numeric(12,2) not null check (discount_amount >= 0),
  redeemed_at timestamptz not null default now(),
  unique (promotion_id, order_id)
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  variant_id uuid references public.product_variants(id) on delete set null,
  batch_id uuid references public.product_batches(id) on delete set null,
  product_name text not null,
  variant_name text,
  selected_values jsonb not null default '{}'::jsonb,
  sku text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0),
  final_price numeric(12,2) not null check (final_price >= 0),
  line_total numeric(12,2) not null check (line_total >= 0),
  reward_points_cost integer not null default 0,
  import_date date,
  expiry_date date,
  created_at timestamptz not null default now()
);

create table public.inventory_audits (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete restrict,
  staff_name text not null check (char_length(staff_name) between 1 and 160),
  created_at timestamptz not null default now()
);
create table public.inventory_audit_lines (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.inventory_audits(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete set null,
  product_name text not null,
  sku text not null,
  counted integer not null check (counted >= 0),
  created_at timestamptz not null default now(),
  unique (audit_id, variant_id)
);

create or replace function public.submit_inventory_audit(staff_name_input text,lines_input jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare audit_id_value uuid; line jsonb; variant_record public.product_variants;
begin
  if not public.has_permission('inventory.submit') then raise exception 'Permission denied'; end if;
  insert into public.inventory_audits(created_by,staff_name) values(auth.uid(),left(trim(staff_name_input),160)) returning id into audit_id_value;
  for line in select value from jsonb_array_elements(lines_input) loop
    select * into variant_record from public.product_variants where product_id=(line->>'product_id')::uuid and is_active order by is_default desc limit 1;
    if (select count(*) from public.product_variants where product_id=(line->>'product_id')::uuid and is_active)>1 then raise exception 'Inventory count must select a SKU for multi-variant products'; end if;
    insert into public.inventory_audit_lines(audit_id,variant_id,product_name,sku,counted)
    values(audit_id_value,variant_record.id,line->>'product_name',variant_record.sku,(line->>'counted')::integer);
  end loop;
  return audit_id_value;
end;
$$;

create or replace function public.ensure_default_product_variant()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.product_variants(product_id, sku, is_default)
  values (new.id, 'DEFAULT-' || upper(substr(replace(new.id::text, '-', ''), 1, 12)), true);
  return new;
end;
$$;
create trigger products_create_default_variant
after insert on public.products for each row execute function public.ensure_default_product_variant();

create or replace function public.reserve_variant_stock(
  variant_id_input uuid, quantity_input integer, batch_id_input uuid default null
) returns public.product_variants
language plpgsql security definer set search_path = public as $$
declare v public.product_variants; b public.product_batches;
begin
  if quantity_input <= 0 then raise exception 'Quantity must be positive'; end if;
  select * into v from public.product_variants where id = variant_id_input and is_active for update;
  if v.id is null then raise exception 'Product variant is not available'; end if;
  if v.stock_quantity < quantity_input or v.shelf_quantity < quantity_input then
    raise exception 'Insufficient stock for selected product variant';
  end if;
  if batch_id_input is not null then
    select * into b from public.product_batches where id = batch_id_input and variant_id = v.id for update;
    if b.id is null or b.quantity < quantity_input or b.shelf_quantity < quantity_input then
      raise exception 'Insufficient stock for selected batch';
    end if;
    update public.product_batches set quantity=quantity-quantity_input, shelf_quantity=shelf_quantity-quantity_input where id=b.id;
  end if;
  update public.product_variants set stock_quantity=stock_quantity-quantity_input,
    shelf_quantity=shelf_quantity-quantity_input, updated_at=now() where id=v.id returning * into v;
  return v;
end;
$$;

create or replace function public.adjust_variant_stock(
  variant_id_input uuid, quantity_delta_input integer, shelf_delta_input integer, reason_input text default null
) returns public.product_variants
language plpgsql security definer set search_path = public as $$
declare v public.product_variants; actor_name_value text;
begin
  if not (public.has_permission('products.receive-stock') or public.has_permission('warehouse.stock-out')) then
    raise exception 'Permission denied for stock adjustment';
  end if;
  select * into v from public.product_variants where id=variant_id_input for update;
  if v.id is null then raise exception 'Product variant not found'; end if;
  if v.stock_quantity + quantity_delta_input < 0 or v.shelf_quantity + shelf_delta_input < 0
     or v.shelf_quantity + shelf_delta_input > v.stock_quantity + quantity_delta_input then
    raise exception 'Invalid stock balance';
  end if;
  update public.product_variants set stock_quantity=stock_quantity+quantity_delta_input,
    shelf_quantity=shelf_quantity+shelf_delta_input, updated_at=now() where id=v.id returning * into v;
  select coalesce(full_name, auth.uid()::text) into actor_name_value from public.profiles where id=auth.uid();
  insert into public.stock_movements(variant_id,movement_type,quantity,reason,actor_id,actor_name)
  values(v.id,'adjustment',quantity_delta_input,reason_input,auth.uid(),coalesce(actor_name_value,'System'));
  return v;
end;
$$;

create or replace function public.receive_product_stock(product_id_input uuid,quantity_input integer,import_date_input date,expiry_date_input date)
returns public.product_batches language plpgsql security definer set search_path=public as $$
declare variant_record public.product_variants; batch_record public.product_batches;
begin
  if not public.has_permission('products.receive-stock') then raise exception 'Only admins can receive stock'; end if;
  select * into variant_record from public.product_variants where product_id=product_id_input and is_active;
  if not found then raise exception 'Product variant not found'; end if;
  if (select count(*) from public.product_variants where product_id=product_id_input and is_active)<>1 then raise exception 'Choose a SKU in Product editor for multi-variant stock'; end if;
  if quantity_input<=0 then raise exception 'Quantity must be greater than zero'; end if;
  update public.product_variants set stock_quantity=stock_quantity+quantity_input,updated_at=now() where id=variant_record.id;
  insert into public.product_batches(variant_id,quantity,import_date,expiry_date) values(variant_record.id,quantity_input,import_date_input,expiry_date_input) returning * into batch_record;
  insert into public.stock_movements(variant_id,movement_type,quantity,reason,actor_id,actor_name) values(variant_record.id,'in',quantity_input,'Receive stock',auth.uid(),coalesce((select full_name from public.profiles where id=auth.uid()),'System'));
  return batch_record;
end;
$$;

create or replace function public.issue_product_stock(product_id_input uuid,quantity_input integer,reason_input text)
returns public.products language plpgsql security definer set search_path=public as $$
declare variant_record public.product_variants; product_record public.products;
begin
  if not public.has_permission('warehouse.stock-out') then raise exception 'Permission denied for stock out'; end if;
  select * into variant_record from public.product_variants where product_id=product_id_input and is_active for update;
  if (select count(*) from public.product_variants where product_id=product_id_input and is_active)<>1 then raise exception 'Choose a SKU in Product editor for multi-variant stock'; end if;
  if variant_record.stock_quantity<quantity_input then raise exception 'Insufficient stock'; end if;
  update public.product_variants set stock_quantity=stock_quantity-quantity_input,shelf_quantity=greatest(shelf_quantity-quantity_input,0),updated_at=now() where id=variant_record.id;
  insert into public.stock_movements(variant_id,movement_type,quantity,reason,actor_id,actor_name) values(variant_record.id,'out',-quantity_input,reason_input,auth.uid(),coalesce((select full_name from public.profiles where id=auth.uid()),'System'));
  select * into product_record from public.products where id=product_id_input; return product_record;
end;
$$;

create or replace function public.transfer_product_shelf(product_id_input uuid,batch_id_input uuid,quantity_input integer,direction_input text)
returns public.product_batches language plpgsql security definer set search_path=public as $$
declare batch_record public.product_batches; variant_record public.product_variants;
begin
  if not (public.has_permission('warehouse') or public.has_permission('products.receive-stock')) then raise exception 'Permission denied'; end if;
  select b.* into batch_record from public.product_batches b join public.product_variants v on v.id=b.variant_id where b.id=batch_id_input and v.product_id=product_id_input for update;
  if batch_record.id is null then raise exception 'Stock batch is not available'; end if;
  select * into variant_record from public.product_variants where id=batch_record.variant_id for update;
  if direction_input='to_shelf' then
    if batch_record.quantity-batch_record.shelf_quantity<quantity_input then raise exception 'Insufficient warehouse stock'; end if;
    update public.product_batches set shelf_quantity=shelf_quantity+quantity_input where id=batch_record.id returning * into batch_record;
    update public.product_variants set shelf_quantity=shelf_quantity+quantity_input where id=variant_record.id;
  elsif direction_input='to_warehouse' then
    if batch_record.shelf_quantity<quantity_input then raise exception 'Insufficient shelf stock'; end if;
    update public.product_batches set shelf_quantity=shelf_quantity-quantity_input where id=batch_record.id returning * into batch_record;
    update public.product_variants set shelf_quantity=shelf_quantity-quantity_input where id=variant_record.id;
  else raise exception 'Invalid shelf transfer direction'; end if;
  insert into public.stock_movements(variant_id,movement_type,quantity,reason,actor_id,actor_name) values(variant_record.id,direction_input,quantity_input,'Shelf transfer',auth.uid(),coalesce((select full_name from public.profiles where id=auth.uid()),'System'));
  return batch_record;
end;
$$;

create or replace function public.set_product_active(product_id_input uuid,is_active_input boolean)
returns public.products language sql security invoker set search_path=public as $$
  update public.products set status=case when is_active_input then 'active' else 'inactive' end,updated_at=now()
  where id=product_id_input returning *;
$$;
create or replace function public.soft_delete_product(product_id_input uuid)
returns public.products language sql security invoker set search_path=public as $$
  update public.products set status='inactive',deleted_at=now(),updated_at=now() where id=product_id_input returning *;
$$;
create or replace function public.clear_products_image_url(image_url_input text)
returns integer language plpgsql security invoker set search_path=public as $$
declare affected integer:=0; current_count integer;
begin
  delete from public.product_images where image_url=image_url_input; get diagnostics affected=row_count;
  update public.product_variant_values set metadata=metadata-'image_url'-'cloudinary_public_id',updated_at=now() where metadata->>'image_url'=image_url_input;
  get diagnostics current_count=row_count; return affected+current_count;
end;
$$;

create or replace function public.evaluate_promotions(
  items_input jsonb, customer_id_input uuid default null, coupon_code_input text default null
) returns table(promotion_id uuid, name text, discount_amount numeric, free_shipping boolean)
language plpgsql security definer set search_path = public stable as $$
declare p public.promotions; subtotal_value numeric; scoped_value numeric; amount_value numeric;
begin
  select coalesce(sum((i->>'unit_price')::numeric * (i->>'quantity')::integer),0)
  into subtotal_value from jsonb_array_elements(items_input) i;
  for p in select * from public.promotions x where x.is_active
    and (x.start_at is null or x.start_at <= now()) and (x.end_at is null or x.end_at > now())
    and ((x.trigger_type='automatic' and coupon_code_input is null) or
         (x.trigger_type='coupon' and upper(x.code)=upper(trim(coupon_code_input))))
    order by x.priority desc, x.created_at
  loop
    if p.total_usage_limit is not null and (select count(*) from public.promotion_redemptions r where r.promotion_id=p.id) >= p.total_usage_limit then continue; end if;
    if customer_id_input is not null and p.usage_per_customer is not null and
       (select count(*) from public.promotion_redemptions r where r.promotion_id=p.id and r.user_id=customer_id_input) >= p.usage_per_customer then continue; end if;
    if exists (select 1 from public.promotion_conditions c where c.promotion_id=p.id and c.condition_type='order_total'
      and not case c.operator when 'gte' then subtotal_value >= (c.value#>>'{}')::numeric when 'gt' then subtotal_value > (c.value#>>'{}')::numeric
      when 'lte' then subtotal_value <= (c.value#>>'{}')::numeric when 'lt' then subtotal_value < (c.value#>>'{}')::numeric
      when 'eq' then subtotal_value = (c.value#>>'{}')::numeric else false end) then continue; end if;
    if exists (select 1 from public.promotion_conditions c where c.promotion_id=p.id and c.condition_type='quantity'
      and not case c.operator
        when 'gte' then (select coalesce(sum((i->>'quantity')::integer),0) from jsonb_array_elements(items_input) i) >= (c.value#>>'{}')::integer
        when 'gt' then (select coalesce(sum((i->>'quantity')::integer),0) from jsonb_array_elements(items_input) i) > (c.value#>>'{}')::integer
        when 'lte' then (select coalesce(sum((i->>'quantity')::integer),0) from jsonb_array_elements(items_input) i) <= (c.value#>>'{}')::integer
        when 'lt' then (select coalesce(sum((i->>'quantity')::integer),0) from jsonb_array_elements(items_input) i) < (c.value#>>'{}')::integer
        when 'eq' then (select coalesce(sum((i->>'quantity')::integer),0) from jsonb_array_elements(items_input) i) = (c.value#>>'{}')::integer else false end) then continue; end if;
    if customer_id_input is null and exists(select 1 from public.promotion_conditions c where c.promotion_id=p.id and c.condition_type='customer_order_count') then continue; end if;
    if exists (select 1 from public.promotion_conditions c where c.promotion_id=p.id and c.condition_type='customer_order_count'
      and not case c.operator
        when 'eq' then (select count(*) from public.orders o where o.customer_id=customer_id_input and o.status='paid') = (c.value#>>'{}')::integer
        when 'gte' then (select count(*) from public.orders o where o.customer_id=customer_id_input and o.status='paid') >= (c.value#>>'{}')::integer
        when 'lte' then (select count(*) from public.orders o where o.customer_id=customer_id_input and o.status='paid') <= (c.value#>>'{}')::integer else false end) then continue; end if;
    if exists (select 1 from public.promotion_conditions c where c.promotion_id=p.id and c.condition_type not in ('order_total','quantity','customer_order_count')) then continue; end if;
    select coalesce(sum((i->>'unit_price')::numeric*(i->>'quantity')::integer),0) into scoped_value
    from jsonb_array_elements(items_input) i where
      exists(select 1 from public.promotion_scopes s where s.promotion_id=p.id and s.scope_type='all') or
      exists(select 1 from public.promotion_scopes s where s.promotion_id=p.id and s.scope_type='variant' and s.scope_id=(i->>'variant_id')::uuid) or
      exists(select 1 from public.promotion_scopes s where s.promotion_id=p.id and s.scope_type='product' and s.scope_id=(i->>'product_id')::uuid) or
      exists(select 1 from public.promotion_scopes s join public.products pr on pr.category_id=s.scope_id where s.promotion_id=p.id and s.scope_type='category' and pr.id=(i->>'product_id')::uuid);
    amount_value := case p.discount_type when 'percentage' then scoped_value*p.discount_value/100 when 'fixed_amount' then least(scoped_value,p.discount_value) else 0 end;
    if p.max_discount_amount is not null then amount_value:=least(amount_value,p.max_discount_amount); end if;
    promotion_id:=p.id; name:=p.name; discount_amount:=round(amount_value,2); free_shipping:=p.discount_type='free_shipping'; return next;
    if not p.is_stackable then return; end if;
  end loop;
end;
$$;

create or replace function public.save_product_engine(payload jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare product_id_value uuid; attribute jsonb; value_row jsonb; variant jsonb; image_row jsonb; specification jsonb;
begin
  if not (public.has_permission('products.create') or public.has_permission('products.update')) then raise exception 'Permission denied for product save'; end if;
  product_id_value := coalesce(nullif(payload->>'id','')::uuid, gen_random_uuid());
  insert into public.products(id,product_type_id,category_id,name,slug,description,status,is_reward,reward_points_cost,seo_title,seo_description)
  values(product_id_value,nullif(payload->>'product_type_id','')::uuid,nullif(payload->>'category_id','')::uuid,
    trim(payload->>'name'),trim(payload->>'slug'),nullif(payload->>'description',''),coalesce(payload->>'status','draft'),
    coalesce((payload->>'is_reward')::boolean,false),coalesce((payload->>'reward_points_cost')::integer,0),nullif(payload->>'seo_title',''),nullif(payload->>'seo_description',''))
  on conflict(id) do update set product_type_id=excluded.product_type_id,category_id=excluded.category_id,name=excluded.name,
    slug=excluded.slug,description=excluded.description,status=excluded.status,is_reward=excluded.is_reward,
    reward_points_cost=excluded.reward_points_cost,seo_title=excluded.seo_title,seo_description=excluded.seo_description,updated_at=now();

  delete from public.product_specifications where product_id=product_id_value;
  for specification in select value from jsonb_array_elements(coalesce(payload->'specifications','[]')) loop
    insert into public.product_specifications(id,product_id,attribute_id,name,code,data_type,input_type,unit,value,is_required,sort_order)
    values(coalesce(nullif(specification->>'id','')::uuid,gen_random_uuid()),product_id_value,nullif(specification->>'attribute_id','')::uuid,
      specification->>'name',specification->>'code',specification->>'data_type',specification->>'input_type',nullif(specification->>'unit',''),
      coalesce(specification->'value','null'::jsonb),coalesce((specification->>'is_required')::boolean,false),coalesce((specification->>'sort_order')::integer,0));
  end loop;

  delete from public.product_images where product_id=product_id_value;
  for attribute in select value from jsonb_array_elements(coalesce(payload->'variant_attributes','[]')) loop
    insert into public.product_variant_attributes(id,product_id,source_attribute_id,name,code,data_type,display_type,is_required,sort_order)
    values((attribute->>'id')::uuid,product_id_value,nullif(attribute->>'source_attribute_id','')::uuid,attribute->>'name',attribute->>'code',
      coalesce(attribute->>'data_type','option'),coalesce(attribute->>'display_type','text_button'),coalesce((attribute->>'is_required')::boolean,true),coalesce((attribute->>'sort_order')::integer,0))
    on conflict(id) do update set source_attribute_id=excluded.source_attribute_id,name=excluded.name,code=excluded.code,data_type=excluded.data_type,display_type=excluded.display_type,is_required=excluded.is_required,sort_order=excluded.sort_order,updated_at=now();
    for value_row in select value from jsonb_array_elements(coalesce(attribute->'values','[]')) loop
      insert into public.product_variant_values(id,variant_attribute_id,label,value,metadata,sort_order,is_active)
      values((value_row->>'id')::uuid,(attribute->>'id')::uuid,value_row->>'label',value_row->>'value',coalesce(value_row->'metadata','{}'),
        coalesce((value_row->>'sort_order')::integer,0),coalesce((value_row->>'is_active')::boolean,true))
      on conflict(id) do update set label=excluded.label,value=excluded.value,metadata=excluded.metadata,sort_order=excluded.sort_order,is_active=excluded.is_active,updated_at=now();
    end loop;
  end loop;
  delete from public.product_variants pv where pv.product_id=product_id_value and not exists(
    select 1 from jsonb_array_elements(coalesce(payload->'variants','[]')) item where nullif(item->>'id','')::uuid=pv.id
  );
  update public.product_variants set is_default=false where product_id=product_id_value;
  for variant in select value from jsonb_array_elements(coalesce(payload->'variants','[]')) loop
    delete from public.variant_value_links where variant_id=(variant->>'id')::uuid;
    insert into public.product_variants(id,product_id,sku,barcode,base_price,compare_at_price,cost_price,stock_quantity,shelf_quantity,weight,is_default,is_active)
    values((variant->>'id')::uuid,product_id_value,variant->>'sku',nullif(variant->>'barcode',''),
      coalesce((variant->>'base_price')::numeric,0),nullif(variant->>'compare_at_price','')::numeric,coalesce((variant->>'cost_price')::numeric,0),
      coalesce((variant->>'stock_quantity')::integer,0),coalesce((variant->>'shelf_quantity')::integer,0),nullif(variant->>'weight','')::numeric,
      coalesce((variant->>'is_default')::boolean,false),coalesce((variant->>'is_active')::boolean,true))
    on conflict(id) do update set sku=excluded.sku,barcode=excluded.barcode,base_price=excluded.base_price,compare_at_price=excluded.compare_at_price,cost_price=excluded.cost_price,stock_quantity=excluded.stock_quantity,shelf_quantity=excluded.shelf_quantity,weight=excluded.weight,is_default=excluded.is_default,is_active=excluded.is_active,updated_at=now();
    insert into public.variant_value_links(variant_id,variant_value_id,variant_attribute_id)
    select (variant->>'id')::uuid,
      vv.id,vv.variant_attribute_id from jsonb_array_elements_text(coalesce(variant->'value_ids','[]')) ids(id)
      join public.product_variant_values vv on vv.id=ids.id::uuid;
    if nullif(variant->>'image_url','') is not null then
      insert into public.product_images(product_id,variant_id,image_url,cloudinary_public_id,is_primary)
      select product_id_value,pv.id,variant->>'image_url',nullif(variant->>'cloudinary_public_id',''),true
      from public.product_variants pv where pv.product_id=product_id_value and pv.sku=variant->>'sku';
    end if;
  end loop;
  delete from public.product_variants pv where pv.product_id=product_id_value and not exists(
    select 1 from jsonb_array_elements(coalesce(payload->'variants','[]')) item where nullif(item->>'id','')::uuid=pv.id
  );
  delete from public.product_variant_values vv using public.product_variant_attributes va where vv.variant_attribute_id=va.id and va.product_id=product_id_value and not exists(
    select 1 from jsonb_array_elements(coalesce(payload->'variant_attributes','[]')) a,
      jsonb_array_elements(coalesce(a->'values','[]')) v where nullif(v->>'id','')::uuid=vv.id
  );
  delete from public.product_variant_attributes va where va.product_id=product_id_value and not exists(
    select 1 from jsonb_array_elements(coalesce(payload->'variant_attributes','[]')) a where nullif(a->>'id','')::uuid=va.id
  );
  for image_row in select value from jsonb_array_elements(coalesce(payload->'images','[]')) loop
    if nullif(image_row->>'variant_id','') is null and nullif(image_row->>'variant_value_id','') is null then
      insert into public.product_images(id,product_id,image_url,cloudinary_public_id,alt_text,sort_order,is_primary)
      values(coalesce(nullif(image_row->>'id','')::uuid,gen_random_uuid()),product_id_value,image_row->>'image_url',nullif(image_row->>'cloudinary_public_id',''),
        nullif(image_row->>'alt_text',''),coalesce((image_row->>'sort_order')::integer,0),coalesce((image_row->>'is_primary')::boolean,false));
    end if;
  end loop;
  if not exists(select 1 from public.product_variants where product_id=product_id_value) then
    insert into public.product_variants(product_id,sku,is_default) values(product_id_value,'DEFAULT-'||upper(substr(replace(product_id_value::text,'-',''),1,12)),true);
  end if;
  return product_id_value;
end;
$$;

create or replace function public.create_pos_order(
  cashier_id_input uuid, cash_received_input numeric, code_input text, customer_id_input uuid,
  discount_input numeric, items_input jsonb, note_input text, payment_method_input text,
  payment_proof_url_input text, payment_proof_note_input text
) returns public.orders language plpgsql security definer set search_path=public as $$
declare item jsonb; variant_record public.product_variants; product_record public.products; batch_record public.product_batches;
  order_record public.orders; subtotal_value numeric:=0; total_value numeric:=0; quantity_value integer; line_total_value numeric;
  cash_session_id_value uuid; selected_values_value jsonb; variant_name_value text; discount_value numeric:=0;
  line_discount_value numeric:=0; evaluation_items jsonb:='[]'::jsonb; promotion_match record;
begin
  if not public.has_permission('pos.checkout') then raise exception 'Only admins can create orders'; end if;
  if jsonb_typeof(items_input)<>'array' or jsonb_array_length(items_input)=0 then raise exception 'Order items are required'; end if;
  if payment_method_input not in ('cash','transfer') then raise exception 'Invalid payment method'; end if;
  select id into cash_session_id_value from public.cash_drawer_sessions where status='open' order by opened_at desc limit 1;
  for item in select value from jsonb_array_elements(items_input) loop
    quantity_value:=coalesce((item->>'quantity')::integer,0); if quantity_value<=0 then raise exception 'Invalid item quantity'; end if;
    select * into variant_record from public.product_variants where id=nullif(item->>'variant_id','')::uuid and is_active for update;
    if variant_record.id is null then raise exception 'Product variant is not available'; end if;
    select * into product_record from public.products where id=variant_record.product_id and status='active' and deleted_at is null;
    if product_record.id is null then raise exception 'Product is not available'; end if;
    if variant_record.stock_quantity<quantity_value or variant_record.shelf_quantity<quantity_value then raise exception 'Insufficient stock for selected product variant'; end if;
    subtotal_value:=subtotal_value+variant_record.base_price*quantity_value;
    evaluation_items:=evaluation_items||jsonb_build_array(jsonb_build_object('product_id',product_record.id,'variant_id',variant_record.id,'unit_price',variant_record.base_price,'quantity',quantity_value));
  end loop;
  if coalesce(discount_input,0)<>0 then raise exception 'Order discounts are disabled'; end if;
  perform pg_advisory_xact_lock(hashtext('promotion-redemption'));
  for promotion_match in select * from public.evaluate_promotions(evaluation_items,customer_id_input,nullif(items_input->0->>'coupon_code','')) loop discount_value:=discount_value+promotion_match.discount_amount; end loop;
  discount_value:=least(discount_value,subtotal_value); total_value:=subtotal_value-discount_value;
  if payment_method_input='cash' and cash_received_input<total_value then raise exception 'Cash received is lower than total'; end if;
  insert into public.orders(code,customer_id,cash_session_id,cashier_id,cashier_name,subtotal,discount,total,payment_method,cash_received,change_amount,payment_proof_url,payment_proof_note,note,status)
  values(code_input,customer_id_input,cash_session_id_value,cashier_id_input,(select full_name from public.profiles where id=cashier_id_input),subtotal_value,discount_value,total_value,
    payment_method_input,case when payment_method_input='cash' then cash_received_input else 0 end,case when payment_method_input='cash' then cash_received_input-total_value else 0 end,
    payment_proof_url_input,payment_proof_note_input,note_input,'paid') returning * into order_record;
  for item in select value from jsonb_array_elements(items_input) loop
    quantity_value:=(item->>'quantity')::integer;
    batch_record:=null;
    select * into variant_record from public.product_variants where id=(item->>'variant_id')::uuid for update;
    select * into product_record from public.products where id=variant_record.product_id;
    if nullif(item->>'batch_id','') is not null then select * into batch_record from public.product_batches where id=(item->>'batch_id')::uuid and variant_id=variant_record.id for update; end if;
    perform public.reserve_variant_stock(variant_record.id,quantity_value,nullif(item->>'batch_id','')::uuid);
    select coalesce(jsonb_object_agg(a.name,v.label),'{}'::jsonb), string_agg(v.label,' / ' order by a.sort_order)
      into selected_values_value,variant_name_value from public.variant_value_links l join public.product_variant_values v on v.id=l.variant_value_id
      join public.product_variant_attributes a on a.id=l.variant_attribute_id where l.variant_id=variant_record.id;
    line_discount_value:=case when subtotal_value>0 then round(discount_value*(variant_record.base_price*quantity_value/subtotal_value),2) else 0 end;
    line_total_value:=variant_record.base_price*quantity_value-line_discount_value;
    insert into public.order_items(order_id,product_id,variant_id,batch_id,product_name,variant_name,selected_values,sku,quantity,unit_price,discount_amount,final_price,line_total,reward_points_cost,import_date,expiry_date)
    values(order_record.id,product_record.id,variant_record.id,nullif(item->>'batch_id','')::uuid,product_record.name,variant_name_value,selected_values_value,variant_record.sku,
      quantity_value,variant_record.base_price,line_discount_value,greatest(variant_record.base_price-(line_discount_value/quantity_value),0),line_total_value,product_record.reward_points_cost,batch_record.import_date,batch_record.expiry_date);
    insert into public.stock_movements(variant_id,movement_type,quantity,reason,reference_type,reference_id,actor_id,actor_name)
    values(variant_record.id,'sale',-quantity_value,'POS sale','order',order_record.id,auth.uid(),coalesce((select full_name from public.profiles where id=auth.uid()),'System'));
  end loop;
  for promotion_match in select * from public.evaluate_promotions(evaluation_items,customer_id_input,nullif(items_input->0->>'coupon_code','')) loop
    insert into public.promotion_redemptions(promotion_id,user_id,order_id,discount_amount) values(promotion_match.promotion_id,customer_id_input,order_record.id,promotion_match.discount_amount);
  end loop;
  insert into public.order_audit_events(order_id,actor_id,event_type,details) values(order_record.id,auth.uid(),'created',jsonb_build_object('code',order_record.code,'total',order_record.total));
  return order_record;
end;
$$;

create or replace function public.cancel_pos_order(order_id_input uuid, reason_input text)
returns public.orders language plpgsql security definer set search_path=public as $$
declare order_record public.orders; line public.order_items;
begin
  if not public.has_permission('orders.cancel') then raise exception 'Permission denied'; end if;
  select * into order_record from public.orders where id=order_id_input for update;
  if order_record.id is null then raise exception 'Order not found'; end if; if order_record.status='cancelled' then return order_record; end if;
  for line in select * from public.order_items where order_id=order_id_input loop
    if line.variant_id is not null then
      update public.product_variants set stock_quantity=stock_quantity+line.quantity,shelf_quantity=shelf_quantity+line.quantity,updated_at=now() where id=line.variant_id;
      if line.batch_id is not null then update public.product_batches set quantity=quantity+line.quantity,shelf_quantity=shelf_quantity+line.quantity where id=line.batch_id; end if;
      insert into public.stock_movements(variant_id,movement_type,quantity,reason,reference_type,reference_id,actor_id,actor_name)
      values(line.variant_id,'return',line.quantity,'Cancel order','order',order_id_input,auth.uid(),coalesce((select full_name from public.profiles where id=auth.uid()),'System'));
    end if;
  end loop;
  update public.orders set status='cancelled',cancelled_at=now(),cancelled_by=auth.uid(),cancel_reason=left(trim(reason_input),1000) where id=order_id_input returning * into order_record;
  insert into public.order_audit_events(order_id,actor_id,event_type,reason) values(order_id_input,auth.uid(),'cancelled',reason_input);
  return order_record;
end;
$$;

create or replace function public.delete_pos_orders(order_ids_input uuid[], reason_input text)
returns integer language plpgsql security definer set search_path=public as $$
declare order_id_value uuid; order_record public.orders; deleted_count integer:=0;
begin
  if not public.has_permission('orders.delete') then raise exception 'Permission denied'; end if;
  foreach order_id_value in array order_ids_input loop
    select * into order_record from public.orders where id=order_id_value;
    if order_record.id is null then continue; end if;
    if order_record.status='paid' then perform public.cancel_pos_order(order_id_value,coalesce(nullif(trim(reason_input),''),'Delete order')); end if;
    delete from public.orders where id=order_id_value; deleted_count:=deleted_count+1;
  end loop;
  return deleted_count;
end;
$$;

-- Generic updated_at triggers.
do $$ declare table_name text; begin
  foreach table_name in array array['product_categories','product_types','product_attributes','products','product_specifications','product_variant_attributes','product_variant_values','product_variants','product_batches','promotions'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', table_name||'_updated_at', table_name);
  end loop;
end $$;

-- Admin-only application: authenticated users can read; existing permission checks protect writes in UI/RPC.
do $$ declare table_name text; begin
  foreach table_name in array array['product_categories','product_types','product_attributes','product_type_attributes','products','product_specifications','product_variant_attributes','product_variant_values','variant_value_links','product_variants','product_images','product_batches','stock_movements','promotions','promotion_condition_groups','promotion_conditions','promotion_scopes','promotion_redemptions','order_items','inventory_audits','inventory_audit_lines'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_admin())', table_name||'_read', table_name);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', table_name||'_write', table_name);
  end loop;
end $$;

revoke all on function public.reserve_variant_stock(uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.adjust_variant_stock(uuid,integer,integer,text) to authenticated;
grant execute on function public.receive_product_stock(uuid,integer,date,date) to authenticated;
grant execute on function public.issue_product_stock(uuid,integer,text) to authenticated;
grant execute on function public.transfer_product_shelf(uuid,uuid,integer,text) to authenticated;
grant execute on function public.submit_inventory_audit(text,jsonb) to authenticated;
grant execute on function public.set_product_active(uuid,boolean) to authenticated;
grant execute on function public.soft_delete_product(uuid) to authenticated;
grant execute on function public.clear_products_image_url(text) to authenticated;
grant execute on function public.evaluate_promotions(jsonb,uuid,text) to authenticated;
grant execute on function public.save_product_engine(jsonb) to authenticated;
grant execute on function public.create_pos_order(uuid,numeric,text,uuid,numeric,jsonb,text,text,text,text) to authenticated;
grant execute on function public.cancel_pos_order(uuid,text) to authenticated;
grant execute on function public.delete_pos_orders(uuid[],text) to authenticated;

commit;
