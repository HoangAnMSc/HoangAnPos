create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'staff',
  role_id uuid,
  is_active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
drop constraint if exists profiles_role_check;

create table if not exists public.app_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  description text,
  permissions text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.app_roles (name, code, description, permissions, is_active)
values
  (
    'Admin',
    'admin',
    'Toan quyen quan tri he thong.',
    array[
      'pos',
      'pos.checkout',
      'pos.discount',
      'pos.quick-customer.create',
      'pos.payment-proof.upload',
      'orders',
      'customers',
      'customers.create',
      'customers.update',
      'customers.delete',
      'products',
      'products.create',
      'products.update',
      'products.delete',
      'products.toggle-active',
      'products.receive-stock',
      'products.categories.create',
      'products.ean13.print',
      'cloudinary-images',
      'cloudinary-images.upload',
      'cloudinary-images.delete',
      'inventory',
      'inventory.count',
      'inventory.report.create',
      'inventory.history.delete',
      'payment-settings',
      'payment-settings.update',
      'roles',
      'roles.create',
      'roles.update',
      'roles.toggle-active',
      'roles.delete',
      'users',
      'users.create',
      'users.update',
      'users.toggle-active',
      'users.delete'
    ],
    true
  ),
  (
    'Staff',
    'staff',
    'Nhan vien ban hang mac dinh.',
    array[
      'pos',
      'pos.checkout',
      'pos.discount',
      'pos.quick-customer.create',
      'pos.payment-proof.upload',
      'orders',
      'customers',
      'customers.create',
      'customers.update',
      'products',
      'inventory',
      'inventory.count',
      'inventory.report.create'
    ],
    true
  )
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  permissions = case
    when public.app_roles.code = 'admin' then excluded.permissions
    when public.app_roles.code = 'staff' then (
      select array(
        select distinct permission
        from unnest(public.app_roles.permissions || excluded.permissions) as permission_key(permission)
      )
    )
    else public.app_roles.permissions
  end,
  is_active = true;

alter table public.profiles
add column if not exists role_id uuid references public.app_roles(id) on delete set null;

alter table public.profiles
add column if not exists is_active boolean not null default true;

alter table public.profiles
add column if not exists last_seen_at timestamptz;

update public.profiles p
set role_id = r.id
from public.app_roles r
where p.role_id is null
  and r.code = p.role;

update public.profiles p
set role_id = r.id
from public.app_roles r
where p.role_id is null
  and r.code = 'staff';

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sku text unique,
  category text,
  description text,
  price numeric(12, 2) not null check (price >= 0),
  cost_price numeric(12, 2) not null default 0 check (cost_price >= 0),
  import_date date,
  expiry_date date,
  stock integer not null default 0 check (stock >= 0),
  image_url text,
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists product_categories_name_lower_idx
on public.product_categories (lower(name));

alter table public.products
add column if not exists description text;

alter table public.products
add column if not exists import_date date;

alter table public.products
add column if not exists expiry_date date;

alter table public.products
add column if not exists deleted_at timestamptz;

create table if not exists public.cloudinary_images (
  id uuid primary key default gen_random_uuid(),
  url text not null unique,
  public_id text,
  folder text,
  delete_token text,
  delete_token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cloudinary_images
add column if not exists delete_token text;

alter table public.cloudinary_images
add column if not exists delete_token_expires_at timestamptz;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  address text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  customer_id uuid references public.customers(id) on delete set null,
  cashier_id uuid references auth.users(id) on delete set null,
  subtotal numeric(12, 2) not null check (subtotal >= 0),
  discount numeric(12, 2) not null default 0 check (discount >= 0),
  total numeric(12, 2) not null check (total >= 0),
  payment_method text not null default 'cash' check (payment_method in ('cash', 'transfer')),
  cash_received numeric(12, 2) not null default 0 check (cash_received >= 0),
  change_amount numeric(12, 2) not null default 0 check (change_amount >= 0),
  payment_proof_url text,
  payment_proof_note text,
  note text,
  status text not null default 'paid' check (status in ('paid', 'cancelled')),
  created_at timestamptz not null default now()
);

alter table public.orders
add column if not exists payment_method text not null default 'cash';

alter table public.orders
add column if not exists cash_received numeric(12, 2) not null default 0;

alter table public.orders
add column if not exists change_amount numeric(12, 2) not null default 0;

alter table public.orders
add column if not exists payment_proof_url text;

alter table public.orders
add column if not exists payment_proof_note text;

alter table public.orders
add column if not exists note text;

create table if not exists public.product_batches (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  quantity integer not null check (quantity >= 0),
  import_date date,
  expiry_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  batch_id uuid references public.product_batches(id) on delete set null,
  import_date date,
  expiry_date date,
  product_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  line_total numeric(12, 2) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);

alter table public.order_items
add column if not exists batch_id uuid references public.product_batches(id) on delete set null;

alter table public.order_items
add column if not exists import_date date;

alter table public.order_items
add column if not exists expiry_date date;

create table if not exists public.payment_settings (
  id boolean primary key default true check (id),
  transfer_qr_url text,
  transfer_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.product_batches (product_id, quantity, import_date, expiry_date)
select p.id, p.stock, p.import_date, p.expiry_date
from public.products p
where p.stock > 0
  and not exists (
    select 1
    from public.product_batches b
    where b.product_id = p.id
  );

create index if not exists products_name_idx on public.products using gin (to_tsvector('simple', name));
create index if not exists products_deleted_at_idx on public.products(deleted_at);
create index if not exists cloudinary_images_public_id_idx on public.cloudinary_images(public_id);
create index if not exists app_roles_code_idx on public.app_roles(code);
create index if not exists profiles_role_id_idx on public.profiles(role_id);
create index if not exists profiles_last_seen_at_idx on public.profiles(last_seen_at);
create index if not exists product_categories_name_idx on public.product_categories(name);
create index if not exists product_batches_product_id_idx on public.product_batches(product_id);
create index if not exists customers_name_idx on public.customers using gin (to_tsvector('simple', name));
create index if not exists orders_customer_id_idx on public.orders(customer_id);
create index if not exists order_items_order_id_idx on public.order_items(order_id);

insert into public.product_categories (name)
select distinct trim(category)
from public.products
where category is not null
  and trim(category) <> ''
on conflict do nothing;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_app_roles_updated_at on public.app_roles;
create trigger set_app_roles_updated_at
before update on public.app_roles
for each row execute function public.set_updated_at();

drop trigger if exists set_products_updated_at on public.products;
create trigger set_products_updated_at
before update on public.products
for each row execute function public.set_updated_at();

drop trigger if exists set_product_categories_updated_at on public.product_categories;
create trigger set_product_categories_updated_at
before update on public.product_categories
for each row execute function public.set_updated_at();

drop trigger if exists set_cloudinary_images_updated_at on public.cloudinary_images;
create trigger set_cloudinary_images_updated_at
before update on public.cloudinary_images
for each row execute function public.set_updated_at();

drop trigger if exists set_product_batches_updated_at on public.product_batches;
create trigger set_product_batches_updated_at
before update on public.product_batches
for each row execute function public.set_updated_at();

drop trigger if exists set_payment_settings_updated_at on public.payment_settings;
create trigger set_payment_settings_updated_at
before update on public.payment_settings
for each row execute function public.set_updated_at();

drop trigger if exists set_customers_updated_at on public.customers;
create trigger set_customers_updated_at
before update on public.customers
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    'staff'
  )
  on conflict (id) do nothing;

  update public.profiles p
  set role_id = r.id
  from public.app_roles r
  where p.id = new.id
    and p.role_id is null
    and r.code = p.role;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_admin(user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    left join public.app_roles r on r.id = p.role_id
    where p.id = user_id
      and p.is_active = true
      and (
        p.role = 'admin'
        or r.code = 'admin'
        or (
          user_id = auth.uid()
          and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
        )
      )
      and coalesce(r.is_active, true) = true
  );
$$;

create or replace function public.has_permission(
  permission_key text,
  user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    left join public.app_roles r on r.id = p.role_id
    where p.id = user_id
      and p.is_active = true
      and (
        public.is_admin(user_id)
        or (
          r.is_active = true
          and permission_key = any(coalesce(r.permissions, '{}'))
        )
      )
  );
$$;

create or replace function public.touch_last_seen()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
  set last_seen_at = now()
  where id = auth.uid()
    and is_active = true;
$$;

create or replace function public.set_app_role_active(
  role_id_input uuid,
  is_active_input boolean
)
returns public.app_roles
language plpgsql
security definer
set search_path = public
as $$
declare
  role_record public.app_roles;
begin
  if not public.has_permission('roles.toggle-active') then
    raise exception 'Permission denied';
  end if;

  update public.app_roles
  set is_active = is_active_input
  where id = role_id_input
    and code <> 'admin'
  returning * into role_record;

  if not found then
    raise exception 'Role is not available';
  end if;

  return role_record;
end;
$$;

create or replace function public.decrement_product_stock(
  product_id_input uuid,
  quantity_input integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('products.update') then
    raise exception 'Only admins can update stock';
  end if;

  update public.products
  set stock = stock - quantity_input
  where id = product_id_input
    and stock >= quantity_input;

  if not found then
    raise exception 'Insufficient stock for product %', product_id_input;
  end if;
end;
$$;

create or replace function public.receive_product_stock(
  product_id_input uuid,
  quantity_input integer,
  import_date_input date,
  expiry_date_input date
)
returns public.product_batches
language plpgsql
security definer
set search_path = public
as $$
declare
  batch_record public.product_batches;
begin
  if not public.has_permission('products.receive-stock') then
    raise exception 'Only admins can receive stock';
  end if;

  if quantity_input <= 0 then
    raise exception 'Quantity must be greater than zero';
  end if;

  if import_date_input is not null
    and expiry_date_input is not null
    and expiry_date_input < import_date_input then
    raise exception 'Expiry date must be after import date';
  end if;

  update public.products
  set
    stock = stock + quantity_input,
    import_date = coalesce(import_date_input, import_date),
    expiry_date = coalesce(expiry_date_input, expiry_date)
  where id = product_id_input;

  if not found then
    raise exception 'Product % is not available', product_id_input;
  end if;

  insert into public.product_batches (
    product_id,
    quantity,
    import_date,
    expiry_date
  )
  values (
    product_id_input,
    quantity_input,
    import_date_input,
    expiry_date_input
  )
  returning * into batch_record;

  return batch_record;
end;
$$;

drop function if exists public.create_pos_order(uuid, text, uuid, numeric, jsonb);
drop function if exists public.create_pos_order(uuid, numeric, text, uuid, numeric, jsonb, text, text, text);

create or replace function public.create_pos_order(
  cashier_id_input uuid,
  cash_received_input numeric,
  code_input text,
  customer_id_input uuid,
  discount_input numeric,
  items_input jsonb,
  note_input text,
  payment_method_input text,
  payment_proof_url_input text,
  payment_proof_note_input text
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  line_quantity integer;
  line_total numeric(12, 2);
  order_record public.orders;
  product_record public.products;
  batch_record public.product_batches;
  subtotal_value numeric(12, 2) := 0;
  discount_value numeric(12, 2) := greatest(coalesce(discount_input, 0), 0);
  total_value numeric(12, 2);
  payment_method_value text := coalesce(nullif(payment_method_input, ''), 'cash');
  cash_received_value numeric(12, 2) := greatest(coalesce(cash_received_input, 0), 0);
begin
  if not public.has_permission('pos.checkout') then
    raise exception 'Only admins can create orders';
  end if;

  if items_input is null
    or jsonb_typeof(items_input) <> 'array'
    or jsonb_array_length(items_input) = 0 then
    raise exception 'Order items are required';
  end if;

  for item in select value from jsonb_array_elements(items_input) as value loop
    line_quantity := coalesce((item ->> 'quantity')::integer, 0);

    if line_quantity <= 0 then
      raise exception 'Quantity must be greater than zero';
    end if;

    select *
    into product_record
    from public.products
    where id = (item ->> 'product_id')::uuid
      and is_active = true
    for update;

    if not found then
      raise exception 'Product % is not available', item ->> 'product_id';
    end if;

    if product_record.stock < line_quantity then
      raise exception 'Insufficient stock for product %', product_record.name;
    end if;

    if nullif(item ->> 'batch_id', '') is not null then
      select *
      into batch_record
      from public.product_batches
      where id = (item ->> 'batch_id')::uuid
        and product_id = product_record.id
      for update;

      if not found then
        raise exception 'Selected stock batch is not available';
      end if;

      if batch_record.quantity < line_quantity then
        raise exception 'Insufficient stock for selected date of product %', product_record.name;
      end if;
    end if;

    subtotal_value := subtotal_value + (product_record.price * line_quantity);
  end loop;

  discount_value := least(discount_value, subtotal_value);
  total_value := subtotal_value - discount_value;

  if payment_method_value not in ('cash', 'transfer') then
    raise exception 'Invalid payment method';
  end if;

  if payment_method_value = 'cash' and cash_received_value < total_value then
    raise exception 'Cash received is lower than total';
  end if;

  if payment_method_value = 'transfer'
    and nullif(payment_proof_url_input, '') is null
    and nullif(payment_proof_note_input, '') is null then
    raise exception 'Payment proof is required for transfer orders';
  end if;

  insert into public.orders (
    code,
    customer_id,
    cashier_id,
    subtotal,
    discount,
    total,
    payment_method,
    cash_received,
    change_amount,
    payment_proof_url,
    payment_proof_note,
    note,
    status
  )
  values (
    code_input,
    customer_id_input,
    coalesce(cashier_id_input, auth.uid()),
    subtotal_value,
    discount_value,
    total_value,
    payment_method_value,
    case when payment_method_value = 'cash' then cash_received_value else total_value end,
    case when payment_method_value = 'cash' then greatest(cash_received_value - total_value, 0) else 0 end,
    nullif(payment_proof_url_input, ''),
    nullif(payment_proof_note_input, ''),
    nullif(note_input, ''),
    'paid'
  )
  returning * into order_record;

  for item in select value from jsonb_array_elements(items_input) as value loop
    line_quantity := (item ->> 'quantity')::integer;

    select *
    into product_record
    from public.products
    where id = (item ->> 'product_id')::uuid
    for update;

    if nullif(item ->> 'batch_id', '') is not null then
      select *
      into batch_record
      from public.product_batches
      where id = (item ->> 'batch_id')::uuid
        and product_id = product_record.id
      for update;

      update public.product_batches
      set quantity = quantity - line_quantity
      where id = batch_record.id;
    else
      batch_record := null;
    end if;

    update public.products
    set stock = stock - line_quantity
    where id = product_record.id;

    line_total := product_record.price * line_quantity;

    insert into public.order_items (
      order_id,
      product_id,
      batch_id,
      import_date,
      expiry_date,
      product_name,
      quantity,
      unit_price,
      line_total
    )
    values (
      order_record.id,
      product_record.id,
      case when nullif(item ->> 'batch_id', '') is not null then batch_record.id else null end,
      case when nullif(item ->> 'batch_id', '') is not null then batch_record.import_date else product_record.import_date end,
      case when nullif(item ->> 'batch_id', '') is not null then batch_record.expiry_date else product_record.expiry_date end,
      product_record.name,
      line_quantity,
      product_record.price,
      line_total
    );
  end loop;

  return order_record;
end;
$$;

alter table public.profiles enable row level security;
alter table public.app_roles enable row level security;
alter table public.products enable row level security;
alter table public.cloudinary_images enable row level security;
alter table public.product_categories enable row level security;
alter table public.product_batches enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payment_settings enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
on public.profiles for select
using (auth.uid() = id);

drop policy if exists "Admins can read profiles" on public.profiles;
drop policy if exists "Users page can read profiles" on public.profiles;
create policy "Users page can read profiles"
on public.profiles for select
using (public.has_permission('users'));

drop policy if exists "Admins can update profiles" on public.profiles;
drop policy if exists "Users page can update profiles" on public.profiles;
create policy "Users page can update profiles"
on public.profiles for update
using (public.has_permission('users.update'))
with check (public.has_permission('users.update'));

drop policy if exists "Admins manage app roles" on public.app_roles;
drop policy if exists "Users can read active roles" on public.app_roles;
create policy "Users can read active roles"
on public.app_roles for select
using (
  is_active = true
  or public.has_permission('roles')
  or public.has_permission('users')
);

drop policy if exists "Role managers can create roles" on public.app_roles;
create policy "Role managers can create roles"
on public.app_roles for insert
with check (public.has_permission('roles.create'));

drop policy if exists "Role managers can update roles" on public.app_roles;
create policy "Role managers can update roles"
on public.app_roles for update
using (public.has_permission('roles.update'))
with check (public.has_permission('roles.update'));

drop policy if exists "Role managers can delete roles" on public.app_roles;
create policy "Role managers can delete roles"
on public.app_roles for delete
using (public.has_permission('roles.delete'));

drop policy if exists "Admins manage products" on public.products;
drop policy if exists "Permitted users can read products" on public.products;
create policy "Permitted users can read products"
on public.products for select
using (
  public.has_permission('products')
  or public.has_permission('pos')
  or public.has_permission('inventory')
  or public.has_permission('cloudinary-images')
);

drop policy if exists "Product creators can insert products" on public.products;
create policy "Product creators can insert products"
on public.products for insert
with check (public.has_permission('products.create'));

drop policy if exists "Product editors can update products" on public.products;
create policy "Product editors can update products"
on public.products for update
using (
  public.has_permission('products.update')
  or public.has_permission('products.toggle-active')
  or public.has_permission('products.receive-stock')
  or public.has_permission('cloudinary-images.delete')
)
with check (
  public.has_permission('products.update')
  or public.has_permission('products.toggle-active')
  or public.has_permission('products.receive-stock')
  or public.has_permission('cloudinary-images.delete')
);

drop policy if exists "Product deleters can delete products" on public.products;
create policy "Product deleters can delete products"
on public.products for delete
using (public.has_permission('products.delete'));

drop policy if exists "Admins manage cloudinary images" on public.cloudinary_images;
drop policy if exists "Permitted users can read cloudinary images" on public.cloudinary_images;
create policy "Permitted users can read cloudinary images"
on public.cloudinary_images for select
using (
  public.has_permission('cloudinary-images')
  or public.has_permission('products.create')
  or public.has_permission('products.update')
);

drop policy if exists "Permitted users can save cloudinary images" on public.cloudinary_images;
create policy "Permitted users can save cloudinary images"
on public.cloudinary_images for insert
with check (
  public.has_permission('cloudinary-images.upload')
  or public.has_permission('products.create')
  or public.has_permission('products.update')
);

drop policy if exists "Permitted users can update cloudinary images" on public.cloudinary_images;
create policy "Permitted users can update cloudinary images"
on public.cloudinary_images for update
using (
  public.has_permission('cloudinary-images.upload')
  or public.has_permission('products.create')
  or public.has_permission('products.update')
)
with check (
  public.has_permission('cloudinary-images.upload')
  or public.has_permission('products.create')
  or public.has_permission('products.update')
);

drop policy if exists "Cloudinary deleters can delete images" on public.cloudinary_images;
create policy "Cloudinary deleters can delete images"
on public.cloudinary_images for delete
using (public.has_permission('cloudinary-images.delete'));

drop policy if exists "Admins manage product categories" on public.product_categories;
drop policy if exists "Permitted users can read product categories" on public.product_categories;
create policy "Permitted users can read product categories"
on public.product_categories for select
using (public.has_permission('products') or public.has_permission('pos'));

drop policy if exists "Product category creators can insert categories" on public.product_categories;
create policy "Product category creators can insert categories"
on public.product_categories for insert
with check (public.has_permission('products.categories.create'));

drop policy if exists "Product category creators can update categories" on public.product_categories;
create policy "Product category creators can update categories"
on public.product_categories for update
using (public.has_permission('products.categories.create'))
with check (public.has_permission('products.categories.create'));

drop policy if exists "Admins manage product batches" on public.product_batches;
drop policy if exists "Permitted users can read product batches" on public.product_batches;
create policy "Permitted users can read product batches"
on public.product_batches for select
using (
  public.has_permission('products')
  or public.has_permission('pos')
  or public.has_permission('inventory')
);

drop policy if exists "Product stock managers can insert batches" on public.product_batches;
create policy "Product stock managers can insert batches"
on public.product_batches for insert
with check (
  public.has_permission('products.create')
  or public.has_permission('products.receive-stock')
);

drop policy if exists "Product stock managers can update batches" on public.product_batches;
create policy "Product stock managers can update batches"
on public.product_batches for update
using (
  public.has_permission('products.receive-stock')
  or public.has_permission('pos.checkout')
)
with check (
  public.has_permission('products.receive-stock')
  or public.has_permission('pos.checkout')
);

drop policy if exists "Admins manage payment settings" on public.payment_settings;
drop policy if exists "Permitted users can read payment settings" on public.payment_settings;
create policy "Permitted users can read payment settings"
on public.payment_settings for select
using (public.has_permission('payment-settings') or public.has_permission('pos'));

drop policy if exists "Payment settings editors can insert settings" on public.payment_settings;
create policy "Payment settings editors can insert settings"
on public.payment_settings for insert
with check (public.has_permission('payment-settings.update'));

drop policy if exists "Payment settings editors can update settings" on public.payment_settings;
create policy "Payment settings editors can update settings"
on public.payment_settings for update
using (public.has_permission('payment-settings.update'))
with check (public.has_permission('payment-settings.update'));

drop policy if exists "Admins manage customers" on public.customers;
drop policy if exists "Permitted users can read customers" on public.customers;
create policy "Permitted users can read customers"
on public.customers for select
using (public.has_permission('customers') or public.has_permission('pos'));

drop policy if exists "Customer creators can insert customers" on public.customers;
create policy "Customer creators can insert customers"
on public.customers for insert
with check (
  public.has_permission('customers.create')
  or public.has_permission('pos.quick-customer.create')
);

drop policy if exists "Customer editors can update customers" on public.customers;
create policy "Customer editors can update customers"
on public.customers for update
using (public.has_permission('customers.update'))
with check (public.has_permission('customers.update'));

drop policy if exists "Customer deleters can delete customers" on public.customers;
create policy "Customer deleters can delete customers"
on public.customers for delete
using (public.has_permission('customers.delete'));

drop policy if exists "Admins manage orders" on public.orders;
drop policy if exists "Order viewers can read orders" on public.orders;
create policy "Order viewers can read orders"
on public.orders for select
using (public.has_permission('orders'));

drop policy if exists "POS can insert orders" on public.orders;
create policy "POS can insert orders"
on public.orders for insert
with check (public.has_permission('pos.checkout'));

drop policy if exists "Admins manage order items" on public.order_items;
drop policy if exists "Order viewers can read order items" on public.order_items;
create policy "Order viewers can read order items"
on public.order_items for select
using (public.has_permission('orders'));

drop policy if exists "POS can insert order items" on public.order_items;
create policy "POS can insert order items"
on public.order_items for insert
with check (public.has_permission('pos.checkout'));
