create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'staff' check (role in ('admin', 'staff')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
  status text not null default 'paid' check (status in ('paid', 'cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  product_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  line_total numeric(12, 2) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);

create index if not exists products_name_idx on public.products using gin (to_tsvector('simple', name));
create index if not exists product_categories_name_idx on public.product_categories(name);
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

drop trigger if exists set_products_updated_at on public.products;
create trigger set_products_updated_at
before update on public.products
for each row execute function public.set_updated_at();

drop trigger if exists set_product_categories_updated_at on public.product_categories;
create trigger set_product_categories_updated_at
before update on public.product_categories
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
    from public.profiles
    where id = user_id
      and role = 'admin'
  );
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
  if not public.is_admin(auth.uid()) then
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

create or replace function public.create_pos_order(
  cashier_id_input uuid,
  code_input text,
  customer_id_input uuid,
  discount_input numeric,
  items_input jsonb
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
  subtotal_value numeric(12, 2) := 0;
  discount_value numeric(12, 2) := greatest(coalesce(discount_input, 0), 0);
begin
  if not public.is_admin(auth.uid()) then
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

    subtotal_value := subtotal_value + (product_record.price * line_quantity);
  end loop;

  discount_value := least(discount_value, subtotal_value);

  insert into public.orders (
    code,
    customer_id,
    cashier_id,
    subtotal,
    discount,
    total,
    status
  )
  values (
    code_input,
    customer_id_input,
    coalesce(cashier_id_input, auth.uid()),
    subtotal_value,
    discount_value,
    subtotal_value - discount_value,
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

    update public.products
    set stock = stock - line_quantity
    where id = product_record.id;

    line_total := product_record.price * line_quantity;

    insert into public.order_items (
      order_id,
      product_id,
      product_name,
      quantity,
      unit_price,
      line_total
    )
    values (
      order_record.id,
      product_record.id,
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
alter table public.products enable row level security;
alter table public.product_categories enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
on public.profiles for select
using (auth.uid() = id);

drop policy if exists "Admins can read profiles" on public.profiles;
create policy "Admins can read profiles"
on public.profiles for select
using (public.is_admin());

drop policy if exists "Admins can update profiles" on public.profiles;
create policy "Admins can update profiles"
on public.profiles for update
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins manage products" on public.products;
create policy "Admins manage products"
on public.products for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins manage product categories" on public.product_categories;
create policy "Admins manage product categories"
on public.product_categories for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins manage customers" on public.customers;
create policy "Admins manage customers"
on public.customers for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins manage orders" on public.orders;
create policy "Admins manage orders"
on public.orders for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins manage order items" on public.order_items;
create policy "Admins manage order items"
on public.order_items for all
using (public.is_admin())
with check (public.is_admin());
