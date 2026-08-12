create extension if not exists pgcrypto;

-- FRESH INSTALL ONLY: this rebuilds the entire public schema and deletes all
-- existing application data. Authentication users in auth.users are preserved
-- and are backfilled into public.profiles below.
drop schema if exists public cascade;
create schema public;
grant all on schema public to postgres, service_role;
grant usage on schema public to anon, authenticated;

create table public.app_roles (
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
      'pos.quick-customer.create',
      'pos.payment-proof.upload',
      'orders',
      'orders.cancel',
      'revenue',
      'revenue.export',
      'cash-management',
      'cash-management.session.open',
      'cash-management.session.close',
      'cash-management.handover.override',
      'cash-management.history.view',
      'cash-management.view-all',
      'cash-management.balance.adjust',
      'cash-management.reconciliation.update',
      'cash-management.reconciliation.delete',
      'customers',
      'customers.create',
      'customers.update',
      'customers.delete',
      'products',
      'products.create',
      'products.update',
      'products.types.manage',
      'products.attributes.manage',
      'products.card.update',
      'products.delete',
      'products.toggle-active',
      'products.receive-stock',
      'products.categories.create',
      'products.ean13.print',
      'promotions',
      'promotions.create',
      'promotions.update',
      'promotions.delete',
      'cloudinary-images',
      'cloudinary-images.upload',
      'cloudinary-images.delete',
      'warehouse',
      'warehouse.audit.delete',
      'warehouse.stock-out',
      'inventory',
      'inventory.count',
      'inventory.submit',
      'attendance',
      'attendance.clock',
      'attendance.history.view',
      'attendance.history.view-all',
      'attendance.history.update',
      'attendance.history.delete',
      'attendance.export',
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
      'pos.quick-customer.create',
      'pos.payment-proof.upload',
      'orders',
      'cash-management',
      'cash-management.session.open',
      'cash-management.reconciliation.required',
      'cash-management.session.close',
      'customers',
      'customers.create',
      'customers.update',
      'products',
      'inventory',
      'inventory.count',
      'inventory.submit',
      'attendance',
      'attendance.clock',
      'attendance.history.view'
    ],
    true
  );

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text unique,
  role text not null default 'staff',
  role_id uuid references public.app_roles(id) on delete set null,
  is_active boolean not null default false,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_settings (
  id text primary key default 'default',
  enable_color boolean not null default false,
  enable_size boolean not null default false,
  custom_attributes jsonb not null default '[]'::jsonb,
  card_settings jsonb not null default '{"showImage":true,"showPrice":true,"showShelfStock":true,"showExpiry":true,"showCategory":false,"imageFit":"cover"}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.product_settings (id) values ('default');

create table public.products (
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
  shelf_stock integer not null default 0 check (shelf_stock >= 0 and shelf_stock <= stock),
  image_url text,
  is_reward boolean not null default false,
  reward_points_cost integer not null default 0 check (reward_points_cost >= 0),
  attributes jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  ean13 text not null,
  counted integer not null check (counted >= 0),
  created_at timestamptz not null default now(),
  unique (audit_id, product_id)
);

create index inventory_audits_created_at_idx
on public.inventory_audits (created_at desc);

create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index product_categories_name_lower_idx
on public.product_categories (lower(name));

create table public.cloudinary_images (
  id uuid primary key default gen_random_uuid(),
  url text not null unique,
  public_id text,
  folder text,
  delete_token text,
  delete_token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  address text,
  note text,
  points integer not null default 0 constraint customers_points_nonnegative_check check (points >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cash_drawer_sessions (
  id uuid primary key default gen_random_uuid(),
  cashier_id uuid not null references auth.users(id) on delete restrict,
  cashier_name text not null check (char_length(cashier_name) between 1 and 200),
  expected_opening_cash numeric(12, 2) not null default 0 check (expected_opening_cash >= 0),
  opening_cash numeric(12, 2) not null default 0 check (opening_cash >= 0),
  opening_variance numeric(12, 2) not null default 0,
  opening_evidence_urls text[] not null default '{}',
  cash_sales numeric(12, 2) not null default 0 check (cash_sales >= 0),
  transfer_sales numeric(12, 2) not null default 0 check (transfer_sales >= 0),
  expected_cash numeric(12, 2) not null default 0 check (expected_cash >= 0),
  counted_cash numeric(12, 2) check (counted_cash >= 0),
  variance numeric(12, 2),
  cash_adjustment numeric(12, 2) not null default 0,
  status text not null default 'open' check (status in ('open', 'closed')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null,
  close_evidence_urls text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cash_drawer_sessions_opening_variance_check check (
    opening_variance = opening_cash - expected_opening_cash
  ),
  constraint cash_drawer_sessions_close_state_check check (
    (status = 'open' and closed_at is null and counted_cash is null and variance is null)
    or
    (status = 'closed' and closed_at is not null and counted_cash is not null and variance is not null)
  )
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  customer_id uuid references public.customers(id) on delete set null,
  cash_session_id uuid references public.cash_drawer_sessions(id) on delete restrict,
  cashier_id uuid references auth.users(id) on delete set null,
  cashier_name text,
  subtotal numeric(12, 2) not null check (subtotal >= 0),
  discount numeric(12, 2) not null default 0 check (discount >= 0),
  total numeric(12, 2) not null check (total >= 0),
  payment_method text not null default 'cash' check (payment_method in ('cash', 'transfer')),
  cash_received numeric(12, 2) not null default 0 check (cash_received >= 0),
  change_amount numeric(12, 2) not null default 0 check (change_amount >= 0),
  payment_proof_url text,
  payment_proof_note text,
  print_count integer not null default 0 check (print_count >= 0),
  note text,
  status text not null default 'paid' check (status in ('paid', 'cancelled')),
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete set null,
  cancel_reason text,
  points_earned integer not null default 0,
  points_redeemed integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.order_audit_events (
  id bigint generated by default as identity primary key,
  order_id uuid not null,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('created', 'cancelled', 'printed', 'deleted')),
  reason text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.product_batches (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  quantity integer not null check (quantity >= 0),
  shelf_quantity integer not null default 0 check (shelf_quantity >= 0 and shelf_quantity <= quantity),
  import_date date,
  expiry_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  movement_type text not null check (movement_type in ('in', 'out', 'to_shelf', 'to_warehouse')),
  quantity integer not null check (quantity > 0),
  reason text,
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text not null,
  created_at timestamptz not null default now()
);

create index stock_movements_created_at_idx on public.stock_movements(created_at desc);
create index stock_movements_product_id_idx on public.stock_movements(product_id);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  batch_id uuid references public.product_batches(id) on delete set null,
  import_date date,
  expiry_date date,
  product_name text not null,
  variant_key text,
  variant_label text,
  variant_values jsonb,
  variant_source_values jsonb,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  line_total numeric(12, 2) not null check (line_total >= 0),
  reward_points_cost integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.payment_settings (
  id boolean primary key default true check (id),
  transfer_qr_url text,
  transfer_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  clock_in_at timestamptz not null default now(),
  clock_out_at timestamptz,
  work_date date not null default ((now() at time zone 'Asia/Ho_Chi_Minh')::date),
  clock_in_latitude numeric(10, 7),
  clock_in_longitude numeric(10, 7),
  clock_in_accuracy_m numeric(10, 2),
  clock_out_latitude numeric(10, 7),
  clock_out_longitude numeric(10, 7),
  clock_out_accuracy_m numeric(10, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_records_clock_order_check
    check (clock_out_at is null or clock_out_at >= clock_in_at)
);


create table public.cash_drawer_checks (
  id uuid primary key default gen_random_uuid(),
  attendance_record_id uuid not null unique references public.attendance_records(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  employee_name text not null check (char_length(employee_name) between 1 and 200),
  cash_session_id uuid references public.cash_drawer_sessions(id) on delete set null,
  expected_cash numeric(12, 2) not null default 0 check (expected_cash >= 0),
  actual_cash numeric(12, 2) check (actual_cash >= 0),
  is_match boolean,
  evidence_urls text[] not null default '{}',
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint cash_drawer_checks_result_check check (
    (
      checked_at is null
      and actual_cash is null
      and is_match is null
      and cardinality(evidence_urls) = 0
    )
    or
    (
      checked_at is not null
      and actual_cash is not null
      and is_match = (actual_cash = expected_cash)
      and (is_match or cardinality(evidence_urls) between 1 and 5)
    )
  )
);

create index products_name_idx on public.products using gin (to_tsvector('simple', name));
create index products_deleted_at_idx on public.products(deleted_at);
create index cloudinary_images_public_id_idx on public.cloudinary_images(public_id);
create index profiles_role_id_idx on public.profiles(role_id);
create index profiles_last_seen_at_idx on public.profiles(last_seen_at);
create index product_categories_name_idx on public.product_categories(name);
create index product_batches_product_id_idx on public.product_batches(product_id);
create index customers_name_idx on public.customers using gin (to_tsvector('simple', name));
create index orders_customer_id_idx on public.orders(customer_id);
create index orders_cashier_id_created_at_idx on public.orders(cashier_id, created_at desc);
create index orders_cash_session_id_idx on public.orders(cash_session_id);
create index order_items_order_id_idx on public.order_items(order_id);
create index cash_drawer_sessions_cashier_opened_idx
on public.cash_drawer_sessions(cashier_id, opened_at desc);
create unique index cash_drawer_sessions_one_open_global_idx
on public.cash_drawer_sessions((1))
where status = 'open';
create index order_audit_events_order_created_idx
on public.order_audit_events(order_id, created_at desc);

create index attendance_records_user_work_date_idx
on public.attendance_records(user_id, work_date desc);
create index cash_drawer_checks_created_idx
on public.cash_drawer_checks(created_at desc);
create unique index attendance_records_one_open_shift_idx
on public.attendance_records(user_id)
where clock_out_at is null;

create unique index attendance_records_user_work_date_unique_idx
on public.attendance_records(user_id, work_date);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger set_product_settings_updated_at
before update on public.product_settings
for each row execute function public.set_updated_at();

create trigger set_app_roles_updated_at
before update on public.app_roles
for each row execute function public.set_updated_at();

create trigger set_products_updated_at
before update on public.products
for each row execute function public.set_updated_at();

create trigger set_product_categories_updated_at
before update on public.product_categories
for each row execute function public.set_updated_at();

create trigger set_cloudinary_images_updated_at
before update on public.cloudinary_images
for each row execute function public.set_updated_at();

create trigger set_product_batches_updated_at
before update on public.product_batches
for each row execute function public.set_updated_at();

create trigger set_payment_settings_updated_at
before update on public.payment_settings
for each row execute function public.set_updated_at();

create trigger set_customers_updated_at
before update on public.customers
for each row execute function public.set_updated_at();

create trigger set_attendance_records_updated_at
before update on public.attendance_records
for each row execute function public.set_updated_at();

create trigger set_cash_drawer_sessions_updated_at
before update on public.cash_drawer_sessions
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, role, is_active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email, new.phone),
    new.phone,
    'staff',
    false
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

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Creating the public schema does not fire the auth.users insert trigger for
-- accounts that already exist. Backfill them so authentication and role checks
-- keep working after a public-schema rebuild.
insert into public.profiles (id, full_name, phone, role, is_active)
select
  u.id,
  coalesce(u.raw_user_meta_data ->> 'full_name', u.email, u.phone),
  u.phone,
  case when lower(coalesce(u.email, '')) = 'hoanganmsc@gmail.com' then 'admin' else 'staff' end,
  true
from auth.users u
on conflict (id) do nothing;

update public.profiles p
set
  role_id = r.id,
  role = r.code
from public.app_roles r
where r.code = p.role
  and p.role_id is null;

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
      and user_id = auth.uid()
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
      and user_id = auth.uid()
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

create or replace function public.requires_cash_reconciliation(
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
    join public.app_roles r on r.id = p.role_id
    where p.id = user_id
      and p.is_active = true
      and r.is_active = true
      and p.role <> 'admin'
      and r.code <> 'admin'
      and not (
        user_id = auth.uid()
        and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
      )
      and 'cash-management.reconciliation.required' = any(coalesce(r.permissions, '{}'))
  );
$$;

create or replace function public.submit_inventory_audit(
  staff_name_input text,
  lines_input jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  audit_id_value uuid;
  inserted_line_count integer;
  requested_line_count integer;
begin
  if not public.has_permission('inventory.submit') then
    raise exception 'Permission denied';
  end if;

  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if nullif(trim(staff_name_input), '') is null then
    raise exception 'Staff name is required';
  end if;

  if jsonb_typeof(lines_input) <> 'array' or jsonb_array_length(lines_input) = 0 then
    raise exception 'At least one inventory line is required';
  end if;

  requested_line_count := jsonb_array_length(lines_input);

  insert into public.inventory_audits (created_by, staff_name)
  values (auth.uid(), left(trim(staff_name_input), 160))
  returning id into audit_id_value;

  insert into public.inventory_audit_lines (
    audit_id,
    product_id,
    product_name,
    ean13,
    counted
  )
  select
    audit_id_value,
    line.product_id,
    left(trim(line.product_name), 300),
    left(trim(line.ean13), 32),
    line.counted
  from jsonb_to_recordset(lines_input) as line(
    product_id uuid,
    product_name text,
    ean13 text,
    counted integer
  )
  where line.product_id is not null
    and nullif(trim(line.product_name), '') is not null
    and nullif(trim(line.ean13), '') is not null
    and line.counted >= 0;

  get diagnostics inserted_line_count = row_count;

  if inserted_line_count <> requested_line_count then
    raise exception 'Invalid inventory lines';
  end if;

  return audit_id_value;
end;
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


create or replace function public.clock_in_attendance(
  latitude_input numeric,
  longitude_input numeric,
  accuracy_input numeric
)
returns public.attendance_records
language plpgsql
security definer
set search_path = public
as $$
declare
  attendance_record public.attendance_records;
  drawer_session public.cash_drawer_sessions;
  employee_name_value text;
  expected_cash_value numeric := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.has_permission('attendance.clock') then
    raise exception 'Permission denied';
  end if;

  if latitude_input is null or longitude_input is null then
    raise exception 'Location is required';
  end if;

  select *
  into attendance_record
  from public.attendance_records
  where user_id = auth.uid()
    and clock_out_at is null
  order by clock_in_at desc
  limit 1;

  if found then
    null;
  else
    select *
    into attendance_record
    from public.attendance_records
    where user_id = auth.uid()
      and work_date = ((now() at time zone 'Asia/Ho_Chi_Minh')::date)
    order by clock_in_at desc
    limit 1;

    if found then
      raise exception 'Attendance for today is already completed';
    end if;

    insert into public.attendance_records (
      user_id,
      clock_in_latitude,
      clock_in_longitude,
      clock_in_accuracy_m
    )
    values (
      auth.uid(),
      latitude_input,
      longitude_input,
      accuracy_input
    )
    returning * into attendance_record;
  end if;

  if public.requires_cash_reconciliation(auth.uid()) then
    select *
    into drawer_session
    from public.cash_drawer_sessions
    where status = 'open'
    order by opened_at desc, id desc
    limit 1;

    if found then
      -- Keep attendance reconciliation identical to the drawer balance shown
      -- in the Revenue header (opening cash + cash invoices + adjustments).
      expected_cash_value := public.current_cash_drawer_balance();
    else
      select *
      into drawer_session
      from public.cash_drawer_sessions
      where status = 'closed'
      order by closed_at desc, id desc
      limit 1;

      expected_cash_value := public.current_cash_drawer_balance();
    end if;

    select coalesce(nullif(btrim(profile.full_name), ''), 'Nhân viên ' || left(profile.id::text, 8))
    into employee_name_value
    from public.profiles profile
    where profile.id = auth.uid();

    insert into public.cash_drawer_checks (
      attendance_record_id,
      employee_id,
      employee_name,
      cash_session_id,
      expected_cash
    )
    values (
      attendance_record.id,
      auth.uid(),
      coalesce(employee_name_value, 'Nhân viên'),
      drawer_session.id,
      expected_cash_value
    )
    on conflict (attendance_record_id) do nothing;
  end if;

  return attendance_record;
end;
$$;

create or replace function public.get_attendance_cash_check(attendance_record_id_input uuid)
returns public.cash_drawer_checks
language plpgsql
security definer
set search_path = public
as $$
declare
  check_record public.cash_drawer_checks;
begin
  select cash_check.*
  into check_record
  from public.cash_drawer_checks cash_check
  join public.attendance_records attendance on attendance.id = cash_check.attendance_record_id
  where cash_check.attendance_record_id = attendance_record_id_input
    and (
      attendance.user_id = auth.uid()
      or public.has_permission('attendance.history.view-all')
      or public.has_permission('cash-management.view-all')
    )
  limit 1;

  if not found then
    return null;
  end if;

  -- Pending checks always show the same live drawer amount as the Revenue
  -- header. Completed historical checks remain immutable.
  if check_record.checked_at is null then
    update public.cash_drawer_checks
    set expected_cash = public.current_cash_drawer_balance(),
        cash_session_id = (
          select session.id
          from public.cash_drawer_sessions session
          where session.status = 'open'
          order by session.opened_at desc, session.id desc
          limit 1
        )
    where id = check_record.id
    returning * into check_record;
  end if;

  return check_record;
end;
$$;

create or replace function public.get_attendance_cash_session(attendance_record_id_input uuid)
returns public.cash_drawer_sessions
language sql
stable
security definer
set search_path = public
as $$
  select session.*
  from public.cash_drawer_checks cash_check
  join public.attendance_records attendance on attendance.id = cash_check.attendance_record_id
  join public.cash_drawer_sessions session on session.id = cash_check.cash_session_id
  where cash_check.attendance_record_id = attendance_record_id_input
    and (
      attendance.user_id = auth.uid()
      or public.has_permission('attendance.history.view-all')
      or public.has_permission('cash-management.view-all')
    )
  limit 1;
$$;

create or replace function public.submit_attendance_cash_check(
  attendance_record_id_input uuid,
  actual_cash_input numeric,
  evidence_urls_input text[] default '{}'
)
returns public.cash_drawer_checks
language plpgsql
security definer
set search_path = public
as $$
declare
  check_record public.cash_drawer_checks;
  opened_session public.cash_drawer_sessions;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.has_permission('attendance.clock') then
    raise exception 'Permission denied';
  end if;

  if actual_cash_input is null or actual_cash_input < 0 then
    raise exception 'Actual cash is required';
  end if;

  select *
  into check_record
  from public.cash_drawer_checks
  where attendance_record_id = attendance_record_id_input
    and employee_id = auth.uid()
  for update;

  if not found then
    raise exception 'Cash drawer check is not available';
  end if;

  if check_record.checked_at is not null then
    return check_record;
  end if;

  -- Recheck at submit time so an invoice created after opening the modal is
  -- included in both the displayed drawer and the reconciliation.
  check_record.expected_cash := public.current_cash_drawer_balance();

  if actual_cash_input <> check_record.expected_cash
    and cardinality(coalesce(evidence_urls_input, '{}')) not between 1 and 5 then
    raise exception 'Between 1 and 5 evidence images are required when cash does not match';
  end if;

  select *
  into opened_session
  from public.cash_drawer_sessions
  where status = 'open'
    and public.requires_cash_reconciliation(cashier_id)
  order by opened_at desc, id desc
  limit 1
  for update;

  if found then
    if opened_session.cashier_id <> auth.uid() then
      raise exception 'Previous cash drawer session must be closed before reconciliation';
    end if;
    -- Retrying the confirmation for the employee's own open drawer is safe;
    -- do not attempt to create a second session.
  else
    select *
    into opened_session
    from public.open_cash_drawer(actual_cash_input, evidence_urls_input);
  end if;

  update public.cash_drawer_checks
  set
    cash_session_id = opened_session.id,
    expected_cash = check_record.expected_cash,
    actual_cash = actual_cash_input,
    is_match = (actual_cash_input = check_record.expected_cash),
    evidence_urls = case when actual_cash_input = check_record.expected_cash then '{}' else coalesce(evidence_urls_input, '{}') end,
    checked_at = now()
  where id = check_record.id
  returning * into check_record;

  return check_record;
end;
$$;

create or replace function public.update_cash_reconciliation(
  check_id_input uuid,
  actual_cash_input numeric,
  evidence_urls_input text[] default '{}'
)
returns public.cash_drawer_checks
language plpgsql
security definer
set search_path = public
as $$
declare
  check_record public.cash_drawer_checks;
  session_record public.cash_drawer_sessions;
begin
  if auth.uid() is null or not public.has_permission('cash-management.reconciliation.update') then
    raise exception 'Permission denied';
  end if;

  if actual_cash_input is null or actual_cash_input < 0 then
    raise exception 'Actual cash is required';
  end if;

  select * into check_record
  from public.cash_drawer_checks
  where id = check_id_input
  for update;

  if not found then
    raise exception 'Cash reconciliation was not found';
  end if;

  if actual_cash_input <> check_record.expected_cash
    and cardinality(coalesce(evidence_urls_input, '{}')) not between 1 and 5 then
    raise exception 'Between 1 and 5 evidence images are required when cash does not match';
  end if;

  update public.cash_drawer_checks
  set actual_cash = actual_cash_input,
      is_match = (actual_cash_input = expected_cash),
      evidence_urls = case when actual_cash_input = expected_cash then '{}' else evidence_urls_input end,
      checked_at = coalesce(checked_at, now())
  where id = check_record.id
  returning * into check_record;

  if check_record.cash_session_id is not null then
    select * into session_record
    from public.cash_drawer_sessions
    where id = check_record.cash_session_id
    for update;

    if found then
      update public.cash_drawer_sessions
      set opening_cash = actual_cash_input,
          opening_variance = actual_cash_input - expected_opening_cash,
          opening_evidence_urls = case when actual_cash_input = expected_opening_cash then '{}' else evidence_urls_input end,
          expected_cash = case when status = 'closed' then actual_cash_input + cash_sales else expected_cash end,
          variance = case when status = 'closed' then counted_cash - (actual_cash_input + cash_sales) else variance end
      where id = session_record.id;
    end if;
  end if;

  return check_record;
end;
$$;

create or replace function public.delete_cash_reconciliation(check_id_input uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  check_record public.cash_drawer_checks;
begin
  if auth.uid() is null or not public.has_permission('cash-management.reconciliation.delete') then
    raise exception 'Permission denied';
  end if;

  select * into check_record
  from public.cash_drawer_checks
  where id = check_id_input
  for update;

  if not found then
    raise exception 'Cash reconciliation was not found';
  end if;

  delete from public.cash_drawer_checks where id = check_record.id;
end;
$$;


-- One source of truth for the physical cash currently in the drawer.
-- Cash orders created while no drawer session is open have no cash_session_id,
-- so they must be added after the latest closed handover.
create or replace function public.current_cash_drawer_balance()
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  with latest_open as (
    select session.*
    from public.cash_drawer_sessions session
    where session.status = 'open'
    order by session.opened_at desc, session.id desc
    limit 1
  ),
  latest_closed as (
    select session.*
    from public.cash_drawer_sessions session
    where session.status = 'closed'
    order by session.closed_at desc, session.id desc
    limit 1
  )
  select coalesce(
    (
      select opened.opening_cash
        + opened.cash_adjustment
        + coalesce((
          select sum(pos_order.total)
          from public.orders pos_order
          where pos_order.cash_session_id = opened.id
            and pos_order.status = 'paid'
            and pos_order.payment_method = 'cash'
        ), 0)
      from latest_open opened
    ),
    (
      select coalesce(closed.counted_cash, closed.expected_cash, 0)
        + closed.cash_adjustment
        + coalesce((
          select sum(pos_order.total)
          from public.orders pos_order
          where pos_order.cash_session_id is null
            and pos_order.status = 'paid'
            and pos_order.payment_method = 'cash'
            and pos_order.created_at > closed.closed_at
        ), 0)
      from latest_closed closed
    ),
    (
      select coalesce(sum(pos_order.total), 0)
      from public.orders pos_order
      where pos_order.cash_session_id is null
        and pos_order.status = 'paid'
        and pos_order.payment_method = 'cash'
    ),
    0
  )::numeric;
$$;

create or replace function public.adjust_cash_drawer_balance(cash_amount_input numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_session_id uuid;
  base_cash numeric := 0;
begin
  if auth.uid() is null or not (
    public.has_permission('cash-management.balance.adjust')
    or public.has_permission('cash-management.view-all')
    or public.is_admin(auth.uid())
  ) then
    raise exception 'Permission denied';
  end if;
  if cash_amount_input < 0 then
    raise exception 'Cash balance cannot be negative';
  end if;

  if exists (
    select 1 from public.cash_drawer_sessions
    where status = 'open' and public.requires_cash_reconciliation(cashier_id)
  ) then
    raise exception 'Close the open cash drawer before adjusting fund totals';
  end if;

  select id into target_session_id
  from public.cash_drawer_sessions
  where status = 'closed' or (status = 'open' and not public.requires_cash_reconciliation(cashier_id))
  order by (status = 'open') desc, closed_at desc, opened_at desc, id desc
  limit 1;

  if target_session_id is null then
    if cash_amount_input = 0 then
      return;
    end if;
    raise exception 'No cash drawer session is available to adjust';
  end if;

  update public.cash_drawer_sessions
  set cash_adjustment = 0
  where id is not null;

  -- Recalculate after clearing old adjustments. This keeps a manual amount
  -- stable while future cash invoices continue increasing the drawer.
  base_cash := public.current_cash_drawer_balance();

  update public.cash_drawer_sessions
  set cash_adjustment = cash_amount_input - base_cash
  where id = target_session_id;
end;
$$;

create or replace function public.list_attendance_history(
  month_start_input date
)
returns table (
  id uuid,
  user_id uuid,
  employee_name text,
  clock_in_at timestamptz,
  clock_out_at timestamptz,
  work_date date,
  clock_in_latitude numeric,
  clock_in_longitude numeric,
  clock_in_accuracy_m numeric,
  clock_out_latitude numeric,
  clock_out_longitude numeric,
  clock_out_accuracy_m numeric,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.has_permission('attendance.history.view-all') then
    raise exception 'Permission denied';
  end if;

  return query
  select
    attendance.id,
    attendance.user_id,
    coalesce(nullif(btrim(profile.full_name), ''), 'Nhân viên ' || left(profile.id::text, 8)),
    attendance.clock_in_at,
    attendance.clock_out_at,
    attendance.work_date,
    attendance.clock_in_latitude,
    attendance.clock_in_longitude,
    attendance.clock_in_accuracy_m,
    attendance.clock_out_latitude,
    attendance.clock_out_longitude,
    attendance.clock_out_accuracy_m,
    attendance.created_at,
    attendance.updated_at
  from public.attendance_records attendance
  join public.profiles profile on profile.id = attendance.user_id
  where attendance.work_date >= date_trunc('month', month_start_input)::date
    and attendance.work_date < (date_trunc('month', month_start_input) + interval '1 month')::date
  order by profile.full_name nulls last, attendance.work_date;
end;
$$;


create or replace function public.clock_out_attendance(
  record_id_input uuid,
  latitude_input numeric default null,
  longitude_input numeric default null,
  accuracy_input numeric default null
)
returns public.attendance_records
language plpgsql
security definer
set search_path = public
as $$
declare
  attendance_record public.attendance_records;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.has_permission('attendance.clock')
    and not exists (
      select 1
      from public.attendance_records attendance
      where attendance.id = record_id_input
        and attendance.user_id = auth.uid()
        and attendance.clock_out_at is null
    ) then
    raise exception 'Permission denied';
  end if;

  if public.requires_cash_reconciliation(auth.uid())
    and exists (
      select 1
      from public.cash_drawer_sessions session
      where session.cashier_id = auth.uid()
        and session.status = 'open'
    ) then
    raise exception 'Close cash drawer before clocking out';
  end if;

  update public.attendance_records
  set
    clock_out_at = now(),
    clock_out_latitude = latitude_input,
    clock_out_longitude = longitude_input,
    clock_out_accuracy_m = accuracy_input
  where id = record_id_input
    and user_id = auth.uid()
    and clock_out_at is null
  returning * into attendance_record;

  if not found then
    raise exception 'Attendance record is not available';
  end if;

  return attendance_record;
end;
$$;


create or replace function public.update_attendance_record(
  record_id_input uuid,
  clock_in_at_input timestamptz,
  clock_out_at_input timestamptz
)
returns public.attendance_records
language plpgsql
security definer
set search_path = public
as $$
declare
  attendance_record public.attendance_records;
  previous_record public.attendance_records;
  expected_cash_value numeric(12, 2) := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.has_permission('attendance.history.update') then
    raise exception 'Permission denied';
  end if;

  if clock_in_at_input is null then
    raise exception 'Clock in time is required';
  end if;

  if clock_out_at_input is not null and clock_out_at_input < clock_in_at_input then
    raise exception 'Clock out time must be after clock in time';
  end if;

  select *
  into previous_record
  from public.attendance_records
  where id = record_id_input
    and (
      user_id = auth.uid()
      or public.has_permission('attendance.history.view-all')
    )
  for update;

  if not found then
    raise exception 'Attendance record is not available';
  end if;

  if clock_out_at_input is null and exists (
    select 1
    from public.attendance_records other_record
    where other_record.user_id = previous_record.user_id
      and other_record.id <> previous_record.id
      and other_record.clock_out_at is null
  ) then
    raise exception 'Employee already has another active attendance';
  end if;

  update public.attendance_records
  set
    clock_in_at = clock_in_at_input,
    clock_out_at = clock_out_at_input,
    work_date = ((clock_in_at_input at time zone 'Asia/Ho_Chi_Minh')::date)
  where id = previous_record.id
  returning * into attendance_record;

  -- Reopening a completed attendance also restores the cash confirmation step.
  if previous_record.clock_out_at is not null
    and clock_out_at_input is null
    and public.requires_cash_reconciliation(previous_record.user_id) then
    select coalesce(closed_session.counted_cash, 0)
    into expected_cash_value
    from public.cash_drawer_sessions closed_session
    where closed_session.status = 'closed'
    order by closed_session.closed_at desc, closed_session.id desc
    limit 1;

    expected_cash_value := coalesce(expected_cash_value, 0);

    update public.cash_drawer_checks
    set
      cash_session_id = null,
      expected_cash = expected_cash_value,
      actual_cash = null,
      is_match = null,
      evidence_urls = '{}',
      checked_at = null
    where attendance_record_id = attendance_record.id;
  end if;

  return attendance_record;
end;
$$;


create or replace function public.delete_attendance_record(record_id_input uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.has_permission('attendance.history.delete') then
    raise exception 'Permission denied';
  end if;

  delete from public.attendance_records
  where id = record_id_input
    and (
      user_id = auth.uid()
      or public.has_permission('attendance.history.view-all')
    );

  if not found then
    raise exception 'Attendance record is not available';
  end if;
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

  insert into public.stock_movements (product_id, movement_type, quantity, reason, actor_id, actor_name)
  values (
    product_id_input,
    'in',
    quantity_input,
    'Nhập kho',
    auth.uid(),
    coalesce((select full_name from public.profiles where id = auth.uid()), auth.uid()::text, 'Nhân viên')
  );

  return batch_record;
end;
$$;

create or replace function public.issue_product_stock(
  product_id_input uuid,
  quantity_input integer,
  reason_input text
)
returns public.products
language plpgsql
security definer
set search_path = public
as $$
declare
  batch_record public.product_batches;
  product_record public.products;
  remaining integer := quantity_input;
  deducted integer;
  shelf_deducted integer;
begin
  if not public.has_permission('warehouse.stock-out') then
    raise exception 'Permission denied for stock out';
  end if;
  if quantity_input <= 0 then raise exception 'Quantity must be greater than zero'; end if;
  if nullif(trim(reason_input), '') is null then raise exception 'Stock out reason is required'; end if;

  select * into product_record from public.products where id = product_id_input for update;
  if not found then raise exception 'Product not found'; end if;
  if product_record.stock < quantity_input then raise exception 'Insufficient stock'; end if;

  for batch_record in
    select * from public.product_batches
    where product_id = product_id_input and quantity > 0
    order by expiry_date asc nulls last, import_date asc nulls last, created_at asc
    for update
  loop
    exit when remaining <= 0;
    deducted := least(batch_record.quantity, remaining);
    shelf_deducted := greatest(deducted - (batch_record.quantity - batch_record.shelf_quantity), 0);
    update public.product_batches
    set quantity = quantity - deducted,
        shelf_quantity = shelf_quantity - shelf_deducted
    where id = batch_record.id;
    product_record.shelf_stock := product_record.shelf_stock - shelf_deducted;
    remaining := remaining - deducted;
  end loop;

  update public.products
  set stock = stock - quantity_input,
      shelf_stock = product_record.shelf_stock
  where id = product_id_input returning * into product_record;
  insert into public.stock_movements (product_id, movement_type, quantity, reason, actor_id, actor_name)
  values (product_id_input, 'out', quantity_input, left(trim(reason_input), 1000), auth.uid(), coalesce((select full_name from public.profiles where id = auth.uid()), auth.uid()::text, 'Nhân viên'));
  return product_record;
end;
$$;

create or replace function public.transfer_product_shelf(
  product_id_input uuid,
  batch_id_input uuid,
  quantity_input integer,
  direction_input text
)
returns public.product_batches
language plpgsql
security definer
set search_path = public
as $$
declare
  batch_record public.product_batches;
begin
  if not (
    public.has_permission('warehouse')
    or public.has_permission('products.receive-stock')
  ) then
    raise exception 'Permission denied';
  end if;

  if quantity_input is null or quantity_input <= 0 then
    raise exception 'Quantity must be greater than zero';
  end if;

  select * into batch_record
  from public.product_batches
  where id = batch_id_input and product_id = product_id_input
  for update;

  if not found then raise exception 'Stock batch is not available'; end if;

  if direction_input = 'to_shelf' then
    if batch_record.quantity - batch_record.shelf_quantity < quantity_input then
      raise exception 'Insufficient warehouse stock';
    end if;
    update public.product_batches
    set shelf_quantity = shelf_quantity + quantity_input
    where id = batch_record.id returning * into batch_record;
    update public.products set shelf_stock = shelf_stock + quantity_input where id = product_id_input;
  elsif direction_input = 'to_warehouse' then
    if batch_record.shelf_quantity < quantity_input then
      raise exception 'Insufficient shelf stock';
    end if;
    update public.product_batches
    set shelf_quantity = shelf_quantity - quantity_input
    where id = batch_record.id returning * into batch_record;
    update public.products set shelf_stock = shelf_stock - quantity_input where id = product_id_input;
  else
    raise exception 'Invalid shelf transfer direction';
  end if;

  insert into public.stock_movements (product_id, movement_type, quantity, reason, actor_id, actor_name)
  values (
    product_id_input,
    direction_input,
    quantity_input,
    case when direction_input = 'to_shelf' then 'Chuyển lên kệ' else 'Chuyển về kho' end,
    auth.uid(),
    coalesce((select full_name from public.profiles where id = auth.uid()), auth.uid()::text, 'Nhân viên')
  );

  return batch_record;
end;
$$;


create or replace function public.list_cash_drawer_sessions(limit_input integer default 100)
returns table (
  id uuid,
  cashier_id uuid,
  cashier_name text,
  expected_opening_cash numeric,
  opening_cash numeric,
  opening_variance numeric,
  opening_evidence_urls text[],
  cash_sales numeric,
  transfer_sales numeric,
  expected_cash numeric,
  counted_cash numeric,
  variance numeric,
  status text,
  opened_at timestamptz,
  closed_at timestamptz,
  closed_by uuid,
  close_evidence_urls text[]
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.has_permission('cash-management') then
    raise exception 'Permission denied';
  end if;

  return query
  select
    session.id,
    session.cashier_id,
    session.cashier_name,
    session.expected_opening_cash,
    session.opening_cash,
    session.opening_variance,
    session.opening_evidence_urls,
    case when session.status = 'closed' then session.cash_sales else sales.cash_sales end,
    case when session.status = 'closed' then session.transfer_sales else sales.transfer_sales end,
    case
      when session.status = 'closed' then session.expected_cash + session.cash_adjustment
      else session.opening_cash + sales.cash_sales + session.cash_adjustment
    end,
    session.counted_cash,
    session.variance,
    session.status,
    session.opened_at,
    session.closed_at,
    session.closed_by,
    session.close_evidence_urls
  from public.cash_drawer_sessions session
  cross join lateral (
    select
      coalesce(sum(o.total) filter (where o.status = 'paid' and o.payment_method = 'cash'), 0)::numeric as cash_sales,
      coalesce(sum(o.total) filter (where o.status = 'paid' and o.payment_method = 'transfer'), 0)::numeric as transfer_sales
    from public.orders o
    where o.cash_session_id = session.id
  ) sales
  where (
      session.status = 'open'
      or public.has_permission('cash-management.history.view')
    )
    and (
      session.cashier_id = auth.uid()
      or public.has_permission('cash-management.view-all')
    )
  order by session.opened_at desc
  limit least(greatest(coalesce(limit_input, 100), 1), 500);
end;
$$;

create or replace function public.get_cash_drawer_handover()
returns table (
  expected_opening_cash numeric,
  has_open_session boolean,
  is_first_session boolean,
  open_cashier_name text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.has_permission('cash-management') then
    raise exception 'Permission denied';
  end if;

  return query
  select
    public.current_cash_drawer_balance()::numeric as expected_opening_cash,
    exists (
      select 1
      from public.cash_drawer_sessions open_session
      where open_session.status = 'open'
    ) as has_open_session,
    not exists (
      select 1
      from public.cash_drawer_sessions any_session
      where any_session.status = 'closed'
    ) as is_first_session,
    (
      select open_session.cashier_name
      from public.cash_drawer_sessions open_session
      where open_session.status = 'open'
      order by open_session.opened_at desc
      limit 1
    ) as open_cashier_name;
end;
$$;

create or replace function public.set_product_active(product_id_input uuid, is_active_input boolean)
returns public.products
language plpgsql
security definer
set search_path = public
as $$
declare
  product_record public.products;
begin
  if not public.has_permission('products.toggle-active') then
    raise exception 'Permission denied';
  end if;

  update public.products
  set is_active = is_active_input
  where id = product_id_input
    and deleted_at is null
  returning * into product_record;

  if not found then raise exception 'Product not found'; end if;
  return product_record;
end;
$$;

create or replace function public.soft_delete_product(product_id_input uuid)
returns public.products
language plpgsql
security definer
set search_path = public
as $$
declare
  product_record public.products;
begin
  if not public.has_permission('products.delete') then
    raise exception 'Permission denied';
  end if;

  update public.products
  set is_active = false, deleted_at = now()
  where id = product_id_input
  returning * into product_record;

  if not found then raise exception 'Product not found'; end if;
  return product_record;
end;
$$;

create or replace function public.clear_products_image_url(image_url_input text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count integer;
begin
  if not public.has_permission('cloudinary-images.delete') then
    raise exception 'Permission denied';
  end if;

  update public.products set image_url = null where image_url = image_url_input;
  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

create or replace function public.open_cash_drawer(
  opening_cash_input numeric,
  evidence_urls_input text[] default '{}'
)
returns public.cash_drawer_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  cashier_name_value text;
  expected_opening_cash_value numeric(12, 2);
  is_first_session_value boolean;
  opening_variance_value numeric(12, 2);
  session_record public.cash_drawer_sessions;
begin
  if auth.uid() is null or not public.has_permission('cash-management.session.open') then
    raise exception 'Permission denied';
  end if;

  if opening_cash_input is null or opening_cash_input < 0 then
    raise exception 'Opening cash cannot be negative';
  end if;

  -- Serialize the handover so two cashiers cannot open the same physical drawer concurrently.
  perform pg_advisory_xact_lock(417902113);

  if exists (
    select 1
    from public.cash_drawer_sessions
    where status = 'open'
      and public.requires_cash_reconciliation(cashier_id)
  ) then
    raise exception 'Cash drawer is already open';
  end if;

  -- Admin/supporting roles are not drawer owners. If one temporarily opened
  -- the drawer, close that session at its current balance before handing it
  -- to the reconciling staff member.
  update public.cash_drawer_sessions supporting_session
  set
    cash_sales = coalesce((
      select sum(pos_order.total)
      from public.orders pos_order
      where pos_order.cash_session_id = supporting_session.id
        and pos_order.status = 'paid'
        and pos_order.payment_method = 'cash'
    ), 0),
    transfer_sales = coalesce((
      select sum(pos_order.total)
      from public.orders pos_order
      where pos_order.cash_session_id = supporting_session.id
        and pos_order.status = 'paid'
        and pos_order.payment_method = 'transfer'
    ), 0),
    expected_cash = public.current_cash_drawer_balance(),
    counted_cash = public.current_cash_drawer_balance(),
    variance = 0,
    cash_adjustment = 0,
    status = 'closed',
    closed_at = now(),
    closed_by = auth.uid(),
    close_evidence_urls = '{}'
  where supporting_session.status = 'open'
    and not public.requires_cash_reconciliation(supporting_session.cashier_id);

  is_first_session_value := not exists (
    select 1 from public.cash_drawer_sessions
  );
  expected_opening_cash_value := public.current_cash_drawer_balance();

  if is_first_session_value then
    -- The first cashier may initialize the drawer when the counted amount
    -- matches the balance already calculated from paid cash orders. Manager
    -- permission is only required to accept an opening variance.
    opening_variance_value := opening_cash_input - expected_opening_cash_value;

    if opening_variance_value <> 0 then
      if not public.has_permission('cash-management.handover.override') then
        raise exception 'Opening cash does not match the system balance and requires manager approval';
      end if;

      if cardinality(coalesce(evidence_urls_input, '{}')) not between 1 and 5 then
        raise exception 'Between 1 and 5 evidence images are required when opening cash has a variance';
      end if;
    end if;
  else
    opening_variance_value := opening_cash_input - expected_opening_cash_value;

    if opening_variance_value <> 0 then
      if not public.has_permission('cash-management.handover.override') then
        raise exception 'Opening cash does not match the previous handover balance';
      end if;

      if cardinality(coalesce(evidence_urls_input, '{}')) not between 1 and 5 then
        raise exception 'Between 1 and 5 evidence images are required when opening cash has a variance';
      end if;
    end if;
  end if;

  select concat_ws(
    ' - ',
    coalesce(r.name, nullif(trim(p.role), ''), 'Nhân viên'),
    nullif(trim(p.full_name), '')
  )
  into cashier_name_value
  from public.profiles p
  left join public.app_roles r on r.id = p.role_id
  where p.id = auth.uid()
    and p.is_active = true;

  if not found then
    raise exception 'Active cashier profile is required';
  end if;

  insert into public.cash_drawer_sessions (
    cashier_id,
    cashier_name,
    expected_opening_cash,
    opening_cash,
    opening_variance,
    opening_evidence_urls
  )
  values (
    auth.uid(),
    coalesce(nullif(cashier_name_value, ''), 'Nhân viên'),
    expected_opening_cash_value,
    opening_cash_input,
    opening_variance_value,
    case when opening_variance_value = 0 then '{}' else coalesce(evidence_urls_input, '{}') end
  )
  returning * into session_record;

  return session_record;
exception
  when unique_violation then
    raise exception 'Cash drawer is already open';
end;
$$;

create or replace function public.close_cash_drawer(
  session_id_input uuid,
  counted_cash_input numeric,
  evidence_urls_input text[] default '{}'
)
returns public.cash_drawer_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  cash_sales_value numeric(12, 2);
  expected_cash_value numeric(12, 2);
  session_record public.cash_drawer_sessions;
  transfer_sales_value numeric(12, 2);
  variance_value numeric(12, 2);
begin
  if auth.uid() is null or not public.has_permission('cash-management.session.close') then
    raise exception 'Permission denied';
  end if;

  if counted_cash_input is null or counted_cash_input < 0 then
    raise exception 'Counted cash cannot be negative';
  end if;

  select *
  into session_record
  from public.cash_drawer_sessions
  where id = session_id_input
    and status = 'open'
    and (
      cashier_id = auth.uid()
      or public.has_permission('cash-management.view-all')
    )
  for update;

  if not found then
    raise exception 'Open cash drawer session was not found';
  end if;

  select
    coalesce(sum(total) filter (where status = 'paid' and payment_method = 'cash'), 0),
    coalesce(sum(total) filter (where status = 'paid' and payment_method = 'transfer'), 0)
  into cash_sales_value, transfer_sales_value
  from public.orders
  where cash_session_id = session_record.id;

  expected_cash_value := session_record.opening_cash + cash_sales_value;
  variance_value := counted_cash_input - (expected_cash_value + session_record.cash_adjustment);

  if variance_value <> 0 and cardinality(coalesce(evidence_urls_input, '{}')) not between 1 and 5 then
    raise exception 'Between 1 and 5 evidence images are required when cash has a variance';
  end if;

  update public.cash_drawer_sessions
  set
    cash_sales = cash_sales_value,
    transfer_sales = transfer_sales_value,
    expected_cash = expected_cash_value + session_record.cash_adjustment,
    cash_adjustment = 0,
    counted_cash = counted_cash_input,
    variance = variance_value,
    status = 'closed',
    closed_at = now(),
    closed_by = auth.uid(),
    close_evidence_urls = case when variance_value = 0 then '{}' else coalesce(evidence_urls_input, '{}') end
  where public.cash_drawer_sessions.id = session_record.id
  returning * into session_record;

  return session_record;
end;
$$;

create or replace function public.adjust_product_variant_stock(
  product_id_input uuid,
  variant_values_input jsonb,
  stock_delta_input integer,
  shelf_delta_input integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_shelf integer;
  current_stock integer;
  next_shelf integer;
  next_stock integer;
  product_attributes jsonb;
  variant_record jsonb;
begin
  if variant_values_input is null or jsonb_typeof(variant_values_input) <> 'object' then
    return;
  end if;

  select attributes
  into product_attributes
  from public.products
  where id = product_id_input
  for update;

  if not found then
    raise exception 'Product is not available';
  end if;

  select value
  into variant_record
  from jsonb_array_elements(coalesce(product_attributes -> '_variants', '[]'::jsonb))
  where value -> 'values' = variant_values_input
  limit 1;

  if variant_record is null then
    return;
  end if;

  current_stock := greatest(coalesce((variant_record ->> 'stock')::integer, 0), 0);
  current_shelf := greatest(coalesce((variant_record ->> 'shelf_stock')::integer, 0), 0);
  next_stock := current_stock + coalesce(stock_delta_input, 0);
  next_shelf := current_shelf + coalesce(shelf_delta_input, 0);

  if next_stock < 0 or next_shelf < 0 or next_shelf > next_stock then
    raise exception 'Insufficient shelf stock for selected product variant';
  end if;

  update public.products
  set attributes = jsonb_set(
    product_attributes,
    '{_variants}',
    (
      select coalesce(
        jsonb_agg(
          case
            when value -> 'values' = variant_values_input then
              jsonb_set(
                jsonb_set(value, '{stock}', to_jsonb(next_stock), true),
                '{shelf_stock}',
                to_jsonb(next_shelf),
                true
              )
            else value
          end
        ),
        '[]'::jsonb
      )
      from jsonb_array_elements(coalesce(product_attributes -> '_variants', '[]'::jsonb))
    ),
    true
  )
  where id = product_id_input;
end;
$$;

revoke all on function public.adjust_product_variant_stock(uuid, jsonb, integer, integer) from public, anon, authenticated;

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
  line_unit_price numeric(12, 2);
  order_record public.orders;
  product_record public.products;
  batch_record public.product_batches;
  variant_record jsonb;
  variant_source jsonb;
  subtotal_value numeric(12, 2) := 0;
  reward_subtotal_value numeric(12, 2) := 0;
  discount_value numeric(12, 2) := greatest(coalesce(discount_input, 0), 0);
  total_value numeric(12, 2);
  payment_method_value text := coalesce(nullif(payment_method_input, ''), 'cash');
  cash_received_value numeric(12, 2) := greatest(coalesce(cash_received_input, 0), 0);
  cash_session_id_value uuid;
  customer_record public.customers;
  points_redeemed_value integer := 0;
  points_earned_value integer := 0;
begin
  if auth.uid() is null or not public.has_permission('pos.checkout') then
    raise exception 'Only admins can create orders';
  end if;

  if cashier_id_input is not null and cashier_id_input <> auth.uid() then
    raise exception 'Cashier identity does not match the signed-in user';
  end if;

  if public.requires_cash_reconciliation(auth.uid()) then
    if not exists (
      select 1
      from public.attendance_records attendance
      where attendance.user_id = auth.uid()
        and attendance.clock_out_at is null
    ) then
      raise exception 'Active attendance is required before checkout';
    end if;

    select id
    into cash_session_id_value
    from public.cash_drawer_sessions
    where cashier_id = auth.uid()
      and status = 'open'
    for update;

    if not found then
      raise exception 'Open a cash drawer session before checkout';
    end if;
  else
    -- A supporting seller does not own the drawer, but their cash sale should
    -- still be included in the currently open drawer when one exists.
    select id
    into cash_session_id_value
    from public.cash_drawer_sessions
    where status = 'open'
    order by opened_at desc, id desc
    limit 1
    for update;
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

    if product_record.shelf_stock < line_quantity then
      raise exception 'Insufficient shelf stock for product %', product_record.name;
    end if;

    variant_record := null;
    if jsonb_typeof(product_record.attributes -> '_variantAttributeIds') = 'array'
      and jsonb_array_length(product_record.attributes -> '_variantAttributeIds') > 0 then
      if jsonb_typeof(item -> 'variant_values') <> 'object' then
        raise exception 'Product variant selection is required for product %', product_record.name;
      end if;
    end if;

    if jsonb_typeof(item -> 'variant_source_values') = 'array' then
      for variant_source in
        select value from jsonb_array_elements(item -> 'variant_source_values') as value
      loop
        if not exists (
          select 1
          from jsonb_array_elements(coalesce(product_record.attributes -> '_variants', '[]'::jsonb)) as saved(value)
          where saved.value -> 'values' = variant_source
        ) then
          raise exception 'Selected product variant is not available';
        end if;
      end loop;

      for variant_record in
        with candidates as (
          select
            saved.value as record,
            (select count(*) from jsonb_object_keys(source.value)) as specificity
          from jsonb_array_elements(item -> 'variant_source_values') with ordinality as source(value, position)
          join jsonb_array_elements(coalesce(product_record.attributes -> '_variants', '[]'::jsonb)) as saved(value)
            on saved.value -> 'values' = source.value
          where saved.value ? 'stock' and saved.value ? 'shelf_stock'
            and exists (
              select 1 from public.product_settings settings
              where settings.card_settings -> 'linkedAttributeIds' ? 'stock'
                and settings.card_settings -> 'linkedAttributeIds' ? 'shelf_stock'
            )
        )
        select record from candidates
        where specificity = (select max(specificity) from candidates)
      loop
        if greatest(coalesce((variant_record ->> 'shelf_stock')::integer, 0), 0) < line_quantity then
          raise exception 'Insufficient shelf stock for selected product variant';
        end if;
      end loop;
    end if;

    line_unit_price := product_record.price;
    if jsonb_typeof(item -> 'variant_source_values') = 'array' then
      select (saved.value #>> '{linked_values,price}')::numeric
      into line_unit_price
      from jsonb_array_elements(item -> 'variant_source_values') with ordinality as source(value, position)
      join jsonb_array_elements(coalesce(product_record.attributes -> '_variants', '[]'::jsonb)) as saved(value)
        on saved.value -> 'values' = source.value
      where saved.value #>> '{linked_values,price}' ~ '^[0-9]+([.][0-9]+)?$'
      order by source.position
      limit 1;
      line_unit_price := coalesce(line_unit_price, product_record.price);
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

      if batch_record.shelf_quantity < line_quantity then
        raise exception 'Insufficient shelf stock for selected date of product %', product_record.name;
      end if;
    end if;

    if product_record.is_reward then
      if product_record.reward_points_cost <= 0 then
        raise exception 'Reward product has invalid points cost';
      end if;
      points_redeemed_value := points_redeemed_value + (product_record.reward_points_cost * line_quantity);
      reward_subtotal_value := reward_subtotal_value + (line_unit_price * line_quantity);
    else
      subtotal_value := subtotal_value + (line_unit_price * line_quantity);
    end if;
  end loop;

  if discount_value > 0 then
    raise exception 'Order discounts are disabled';
  end if;
  discount_value := 0;
  if points_redeemed_value > 0 then
    if customer_id_input is not null then
      select * into customer_record from public.customers where id = customer_id_input for update;
      if not found then raise exception 'Customer not found'; end if;
    end if;
    if customer_id_input is null or customer_record.points < points_redeemed_value then
      points_redeemed_value := 0;
      subtotal_value := subtotal_value + reward_subtotal_value;
    end if;
  end if;
  total_value := subtotal_value;
  points_earned_value := floor(total_value / 100000)::integer;

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
    cash_session_id,
    cashier_id,
    cashier_name,
    subtotal,
    discount,
    total,
    payment_method,
    cash_received,
    change_amount,
    payment_proof_url,
    payment_proof_note,
    note,
    points_earned,
    points_redeemed,
    status
  )
  values (
    code_input,
    customer_id_input,
    cash_session_id_value,
    auth.uid(),
    coalesce(
      (
        select concat_ws(
          ' - ',
          coalesce(r.name, nullif(trim(p.role), ''), 'Nhân viên'),
          nullif(trim(p.full_name), '')
        )
        from public.profiles p
        left join public.app_roles r on r.id = p.role_id
        where p.id = auth.uid()
      ),
      'Nhân viên'
    ),
    subtotal_value,
    discount_value,
    total_value,
    payment_method_value,
    case when payment_method_value = 'cash' then cash_received_value else total_value end,
    case when payment_method_value = 'cash' then greatest(cash_received_value - total_value, 0) else 0 end,
    nullif(payment_proof_url_input, ''),
    nullif(payment_proof_note_input, ''),
    nullif(note_input, ''),
    points_earned_value,
    points_redeemed_value,
    'paid'
  )
  returning * into order_record;

  insert into public.order_audit_events (order_id, actor_id, event_type, details)
  values (
    order_record.id,
    auth.uid(),
    'created',
    jsonb_build_object(
      'cash_session_id', cash_session_id_value,
      'payment_method', payment_method_value,
      'total', total_value
    )
  );

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
      set quantity = quantity - line_quantity,
          shelf_quantity = shelf_quantity - line_quantity
      where id = batch_record.id;
    else
      batch_record := null;
    end if;

    update public.products
    set stock = stock - line_quantity,
        shelf_stock = shelf_stock - line_quantity
    where id = product_record.id;

    if jsonb_typeof(item -> 'variant_source_values') = 'array' then
      for variant_record in
        with candidates as (
          select
            saved.value as record,
            (select count(*) from jsonb_object_keys(source.value)) as specificity
          from jsonb_array_elements(item -> 'variant_source_values') with ordinality as source(value, position)
          join jsonb_array_elements(coalesce(product_record.attributes -> '_variants', '[]'::jsonb)) as saved(value)
            on saved.value -> 'values' = source.value
          where saved.value ? 'stock' and saved.value ? 'shelf_stock'
            and exists (
              select 1 from public.product_settings settings
              where settings.card_settings -> 'linkedAttributeIds' ? 'stock'
                and settings.card_settings -> 'linkedAttributeIds' ? 'shelf_stock'
            )
        )
        select record from candidates
        where specificity = (select max(specificity) from candidates)
      loop
        perform public.adjust_product_variant_stock(
          product_record.id,
          variant_record -> 'values',
          -line_quantity,
          -line_quantity
        );
      end loop;
    end if;

    line_unit_price := product_record.price;
    if jsonb_typeof(item -> 'variant_source_values') = 'array' then
      select (saved.value #>> '{linked_values,price}')::numeric
      into line_unit_price
      from jsonb_array_elements(item -> 'variant_source_values') with ordinality as source(value, position)
      join jsonb_array_elements(coalesce(product_record.attributes -> '_variants', '[]'::jsonb)) as saved(value)
        on saved.value -> 'values' = source.value
      where saved.value #>> '{linked_values,price}' ~ '^[0-9]+([.][0-9]+)?$'
      order by source.position
      limit 1;
      line_unit_price := coalesce(line_unit_price, product_record.price);
    end if;

    line_total := case when product_record.is_reward and points_redeemed_value > 0 then 0 else line_unit_price * line_quantity end;

    insert into public.order_items (
      order_id,
      product_id,
      batch_id,
      import_date,
      expiry_date,
      product_name,
      variant_key,
      variant_label,
      variant_values,
      variant_source_values,
      quantity,
      unit_price,
      line_total,
      reward_points_cost
    )
    values (
      order_record.id,
      product_record.id,
      case when nullif(item ->> 'batch_id', '') is not null then batch_record.id else null end,
      case when nullif(item ->> 'batch_id', '') is not null then batch_record.import_date else product_record.import_date end,
      case when nullif(item ->> 'batch_id', '') is not null then batch_record.expiry_date else product_record.expiry_date end,
      product_record.name,
      nullif(item ->> 'variant_key', ''),
      nullif(item ->> 'variant_label', ''),
      case when jsonb_typeof(item -> 'variant_values') = 'object' then item -> 'variant_values' else null end,
      case when jsonb_typeof(item -> 'variant_source_values') = 'array' then item -> 'variant_source_values' else null end,
      line_quantity,
      case when product_record.is_reward and points_redeemed_value > 0 then 0 else line_unit_price end,
      line_total,
      case when product_record.is_reward and points_redeemed_value > 0 then product_record.reward_points_cost else 0 end
    );
  end loop;

  if customer_id_input is not null then
    update public.customers
    set points = points - points_redeemed_value + points_earned_value
    where id = customer_id_input;
  end if;

  return order_record;
end;
$$;


create or replace function public.cancel_pos_order(order_id_input uuid, reason_input text)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  item_record public.order_items;
  order_record public.orders;
  variant_source jsonb;
begin
  if not public.has_permission('orders.cancel') then
    raise exception 'Permission denied';
  end if;

  if nullif(trim(reason_input), '') is null then
    raise exception 'Cancellation reason is required';
  end if;

  select *
  into order_record
  from public.orders
  where id = order_id_input
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if order_record.status = 'cancelled' then
    return order_record;
  end if;

  if order_record.cash_session_id is not null then
    perform 1
    from public.cash_drawer_sessions
    where id = order_record.cash_session_id
    for update;
  end if;

  for item_record in
    select *
    from public.order_items
    where order_id = order_record.id
    order by id
  loop
    update public.products
    set stock = stock + item_record.quantity,
        shelf_stock = shelf_stock + item_record.quantity
    where id = item_record.product_id;

    if jsonb_typeof(item_record.variant_source_values) = 'array' then
      for variant_source in
        with candidates as (
          select
            source.value as variant_values,
            (select count(*) from jsonb_object_keys(source.value)) as specificity
          from jsonb_array_elements(item_record.variant_source_values) with ordinality as source(value, position)
          join jsonb_array_elements(coalesce((select attributes -> '_variants' from public.products where id = item_record.product_id), '[]'::jsonb)) as saved(value)
            on saved.value -> 'values' = source.value
          where saved.value ? 'stock' and saved.value ? 'shelf_stock'
            and exists (
              select 1 from public.product_settings settings
              where settings.card_settings -> 'linkedAttributeIds' ? 'stock'
                and settings.card_settings -> 'linkedAttributeIds' ? 'shelf_stock'
            )
        )
        select variant_values from candidates
        where specificity = (select max(specificity) from candidates)
      loop
        perform public.adjust_product_variant_stock(
          item_record.product_id,
          variant_source,
          item_record.quantity,
          item_record.quantity
        );
      end loop;
    elsif item_record.variant_values is not null then
      perform public.adjust_product_variant_stock(
        item_record.product_id,
        item_record.variant_values,
        item_record.quantity,
        item_record.quantity
      );
    end if;

    if item_record.batch_id is not null then
      update public.product_batches
      set quantity = quantity + item_record.quantity,
          shelf_quantity = shelf_quantity + item_record.quantity
      where id = item_record.batch_id;
    end if;
  end loop;

  update public.orders
  set
    status = 'cancelled',
    cancelled_at = now(),
    cancelled_by = auth.uid(),
    cancel_reason = left(trim(reason_input), 1000)
  where id = order_record.id
  returning * into order_record;

  if order_record.customer_id is not null then
    update public.customers
    set points = greatest(points - order_record.points_earned + order_record.points_redeemed, 0)
    where id = order_record.customer_id;
  end if;

  insert into public.order_audit_events (order_id, actor_id, event_type, reason, details)
  values (
    order_record.id,
    auth.uid(),
    'cancelled',
    order_record.cancel_reason,
    jsonb_build_object(
      'code', order_record.code,
      'actor_name', coalesce((select p.full_name from public.profiles p where p.id = auth.uid()), auth.uid()::text),
      'cash_session_id', order_record.cash_session_id,
      'payment_method', order_record.payment_method,
      'total', order_record.total
    )
  );

  return order_record;
end;
$$;

create or replace function public.record_order_print(order_id_input uuid)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  order_record public.orders;
begin
  if not (
    public.has_permission('orders')
    or public.has_permission('pos.checkout')
  ) then
    raise exception 'Permission denied';
  end if;

  update public.orders
  set print_count = print_count + 1
  where id = order_id_input
    and (
      public.has_permission('orders')
      or cashier_id = auth.uid()
      or public.is_admin()
    )
  returning * into order_record;

  if not found then
    raise exception 'Order not found or permission denied';
  end if;

  insert into public.order_audit_events (order_id, actor_id, event_type, details)
  values (
    order_record.id,
    auth.uid(),
    'printed',
    jsonb_build_object('print_count', order_record.print_count)
  );

  return order_record;
end;
$$;


create or replace function public.delete_pos_orders(order_ids_input uuid[], reason_input text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer := 0;
  item_record public.order_items;
  order_record public.orders;
  variant_source jsonb;
begin
  if not public.has_permission('orders.delete') then
    raise exception 'Permission denied';
  end if;

  if nullif(trim(reason_input), '') is null then
    raise exception 'Deletion reason is required';
  end if;

  if order_ids_input is null or cardinality(order_ids_input) = 0 then
    return 0;
  end if;

  for order_record in
    select orders.*
    from public.orders
    where id = any(order_ids_input)
    order by id
    for update
  loop
    if order_record.cash_session_id is not null then
      perform 1
      from public.cash_drawer_sessions
      where id = order_record.cash_session_id
      for update;
    end if;

    insert into public.order_audit_events (order_id, actor_id, event_type, reason, details)
    values (
      order_record.id,
      auth.uid(),
      'deleted',
      left(trim(reason_input), 1000),
      jsonb_build_object(
        'code', order_record.code,
        'actor_name', coalesce((select p.full_name from public.profiles p where p.id = auth.uid()), auth.uid()::text),
        'status', order_record.status,
        'cashier_id', order_record.cashier_id,
        'cashier_name', order_record.cashier_name,
        'cash_session_id', order_record.cash_session_id,
        'payment_method', order_record.payment_method,
        'subtotal', order_record.subtotal,
        'discount', order_record.discount,
        'total', order_record.total,
        'created_at', order_record.created_at,
        'items', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'product_id', item.product_id,
            'product_name', item.product_name,
            'variant_label', item.variant_label,
            'variant_values', item.variant_values,
            'quantity', item.quantity,
            'unit_price', item.unit_price,
            'line_total', item.line_total
          ) order by item.created_at, item.id), '[]'::jsonb)
          from public.order_items item
          where item.order_id = order_record.id
        )
      )
    );

    if order_record.status = 'paid' then
      if order_record.customer_id is not null then
        update public.customers
        set points = greatest(points - order_record.points_earned + order_record.points_redeemed, 0)
        where id = order_record.customer_id;
      end if;

      for item_record in
        select *
        from public.order_items
        where order_id = order_record.id
        order by id
      loop
        update public.products
        set stock = stock + item_record.quantity,
            shelf_stock = shelf_stock + item_record.quantity
        where id = item_record.product_id;

        if jsonb_typeof(item_record.variant_source_values) = 'array' then
          for variant_source in
            with candidates as (
              select
                source.value as variant_values,
                (select count(*) from jsonb_object_keys(source.value)) as specificity
              from jsonb_array_elements(item_record.variant_source_values) with ordinality as source(value, position)
              join jsonb_array_elements(coalesce((select attributes -> '_variants' from public.products where id = item_record.product_id), '[]'::jsonb)) as saved(value)
                on saved.value -> 'values' = source.value
              where saved.value ? 'stock' and saved.value ? 'shelf_stock'
                and exists (
                  select 1 from public.product_settings settings
                  where settings.card_settings -> 'linkedAttributeIds' ? 'stock'
                    and settings.card_settings -> 'linkedAttributeIds' ? 'shelf_stock'
                )
            )
            select variant_values from candidates
            where specificity = (select max(specificity) from candidates)
          loop
            perform public.adjust_product_variant_stock(
              item_record.product_id,
              variant_source,
              item_record.quantity,
              item_record.quantity
            );
          end loop;
        elsif item_record.variant_values is not null then
          perform public.adjust_product_variant_stock(
            item_record.product_id,
            item_record.variant_values,
            item_record.quantity,
            item_record.quantity
          );
        end if;

        if item_record.batch_id is not null then
          update public.product_batches
          set quantity = quantity + item_record.quantity,
              shelf_quantity = shelf_quantity + item_record.quantity
          where id = item_record.batch_id;
        end if;
      end loop;
    end if;

    delete from public.orders where id = order_record.id;
    deleted_count := deleted_count + 1;
  end loop;

  return deleted_count;
end;
$$;

alter table public.profiles enable row level security;
alter table public.product_settings enable row level security;
alter table public.app_roles enable row level security;
alter table public.products enable row level security;
alter table public.inventory_audits enable row level security;
alter table public.inventory_audit_lines enable row level security;
alter table public.cloudinary_images enable row level security;
alter table public.product_categories enable row level security;
alter table public.product_batches enable row level security;
alter table public.stock_movements enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payment_settings enable row level security;
alter table public.attendance_records enable row level security;
alter table public.cash_drawer_sessions enable row level security;
alter table public.cash_drawer_checks enable row level security;
alter table public.order_audit_events enable row level security;

create policy "Product users can read settings"
on public.product_settings for select
using (public.has_permission('products'));

create policy "Product managers can save settings"
on public.product_settings for insert
with check (
  public.has_permission('products.update')
  or public.has_permission('products.card.update')
);

create policy "Product managers can update settings"
on public.product_settings for update
using (
  public.has_permission('products.update')
  or public.has_permission('products.card.update')
)
with check (
  public.has_permission('products.update')
  or public.has_permission('products.card.update')
);

create policy "Users can read own profile"
on public.profiles for select
using (auth.uid() = id);

create policy "Users page can read profiles"
on public.profiles for select
using (
  public.has_permission('users')
  or public.has_permission('attendance.export')
  or public.has_permission('attendance.history.view-all')
);


create policy "Users can read active roles"
on public.app_roles for select
using (
  is_active = true
  or public.has_permission('roles')
  or public.has_permission('users')
);

create policy "Role managers can create roles"
on public.app_roles for insert
with check (public.has_permission('roles.create'));

create policy "Role managers can update roles"
on public.app_roles for update
using (
  public.has_permission('roles.update')
  and (code <> 'admin' or public.is_admin())
)
with check (
  public.has_permission('roles.update')
  and (code <> 'admin' or public.is_admin())
);

create policy "Role managers can delete roles"
on public.app_roles for delete
using (
  public.has_permission('roles.delete')
  and code not in ('admin', 'staff')
);

create policy "Permitted users can read products"
on public.products for select
using (
  public.has_permission('products')
  or public.has_permission('pos')
  or public.has_permission('warehouse')
  or public.has_permission('inventory')
  or public.has_permission('cloudinary-images')
);

create policy "Warehouse users can read inventory audits"
on public.inventory_audits for select
using (public.has_permission('warehouse'));

create policy "Inventory users can create audits"
on public.inventory_audits for insert
with check (
  public.has_permission('inventory.submit')
  and created_by = auth.uid()
);

create policy "Warehouse users can delete inventory audits"
on public.inventory_audits for delete
using (public.has_permission('warehouse.audit.delete'));

create policy "Warehouse users can read inventory audit lines"
on public.inventory_audit_lines for select
using (public.has_permission('warehouse'));

create policy "Inventory users can create audit lines"
on public.inventory_audit_lines for insert
with check (
  public.has_permission('inventory.submit')
  and exists (
    select 1
    from public.inventory_audits audit
    where audit.id = audit_id
      and audit.created_by = auth.uid()
  )
);

create policy "Product creators can insert products"
on public.products for insert
with check (public.has_permission('products.create'));

create policy "Product editors can update products"
on public.products for update
using (public.has_permission('products.update'))
with check (public.has_permission('products.update'));

create policy "Product deleters can delete products"
on public.products for delete
using (public.has_permission('products.delete'));

create policy "Permitted users can read cloudinary images"
on public.cloudinary_images for select
using (
  public.has_permission('cloudinary-images')
  or public.has_permission('products.create')
  or public.has_permission('products.update')
);

create policy "Permitted users can save cloudinary images"
on public.cloudinary_images for insert
with check (
  public.has_permission('cloudinary-images.upload')
  or public.has_permission('products.create')
  or public.has_permission('products.update')
);

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

create policy "Cloudinary deleters can delete images"
on public.cloudinary_images for delete
using (public.has_permission('cloudinary-images.delete'));

create policy "Permitted users can read product categories"
on public.product_categories for select
using (public.has_permission('products') or public.has_permission('pos'));

create policy "Product category creators can insert categories"
on public.product_categories for insert
with check (public.has_permission('products.categories.create'));

create policy "Product category creators can update categories"
on public.product_categories for update
using (public.has_permission('products.categories.create'))
with check (public.has_permission('products.categories.create'));


create policy "Warehouse users can read stock movements"
on public.stock_movements for select
using (
  public.has_permission('warehouse')
  or public.has_permission('products.receive-stock')
  or public.has_permission('warehouse.stock-out')
);
create policy "Permitted users can read product batches"
on public.product_batches for select
using (
  public.has_permission('products')
  or public.has_permission('pos')
  or public.has_permission('inventory')
  or public.has_permission('warehouse')
);

create policy "Product stock managers can insert batches"
on public.product_batches for insert
with check (
  public.has_permission('products.create')
  or public.has_permission('products.receive-stock')
);


create policy "Permitted users can read payment settings"
on public.payment_settings for select
using (public.has_permission('payment-settings') or public.has_permission('pos'));

create policy "Payment settings editors can insert settings"
on public.payment_settings for insert
with check (public.has_permission('payment-settings.update'));

create policy "Payment settings editors can update settings"
on public.payment_settings for update
using (public.has_permission('payment-settings.update'))
with check (public.has_permission('payment-settings.update'));

create policy "Permitted users can read customers"
on public.customers for select
using (public.has_permission('customers') or public.has_permission('pos'));

create policy "Customer creators can insert customers"
on public.customers for insert
with check (
  public.has_permission('customers.create')
  or public.has_permission('pos.quick-customer.create')
);

create policy "Customer editors can update customers"
on public.customers for update
using (public.has_permission('customers.update'))
with check (public.has_permission('customers.update'));

create policy "Customer deleters can delete customers"
on public.customers for delete
using (public.has_permission('customers.delete'));

create policy "Order viewers can read orders"
on public.orders for select
using (
  public.has_permission('orders')
  or public.has_permission('revenue')
);


create policy "Order viewers can read order items"
on public.order_items for select
using (
  public.has_permission('orders')
  or public.has_permission('revenue')
);


create policy "Cashiers can read cash drawer sessions"
on public.cash_drawer_sessions for select
using (
  (
    status = 'open'
    or public.has_permission('cash-management.history.view')
  )
  and (
    cashier_id = auth.uid()
    or public.has_permission('cash-management.view-all')
  )
);

create policy "Managers can read order audit events"
on public.order_audit_events for select
using (
  public.has_permission('orders')
  or public.has_permission('cash-management.view-all')
);

create policy "Attendance users can read own records"
on public.attendance_records for select
using (
  public.has_permission('attendance.export')
  or public.has_permission('attendance.history.view-all')
  or (
    auth.uid() = user_id
    and (
      public.has_permission('attendance')
      or public.has_permission('attendance.clock')
      or public.has_permission('attendance.history.view')
    )
  )
);

create policy "Attendance users can update own records"
on public.attendance_records for update
using (
  (
    auth.uid() = user_id
    or public.has_permission('attendance.history.view-all')
  )
  and public.has_permission('attendance.history.update')
)
with check (
  (
    auth.uid() = user_id
    or public.has_permission('attendance.history.view-all')
  )
  and public.has_permission('attendance.history.update')
);

create policy "Attendance users can delete own records"
on public.attendance_records for delete
using (
  (
    auth.uid() = user_id
    or public.has_permission('attendance.history.view-all')
  )
  and public.has_permission('attendance.history.delete')
);

create policy "Attendance and cash managers can read drawer checks"
on public.cash_drawer_checks for select
using (
  (
    employee_id = auth.uid()
    and public.has_permission('attendance.clock')
    and exists (
      select 1
      from public.attendance_records attendance
      where attendance.id = cash_drawer_checks.attendance_record_id
        and attendance.clock_out_at is null
    )
  )
  or public.has_permission('attendance.history.view-all')
  or (
    public.has_permission('cash-management.history.view')
    and (
      employee_id = auth.uid()
      or public.has_permission('cash-management.view-all')
    )
  )
);

-- Security-definer RPCs are callable only by signed-in application users.
revoke all on function public.handle_new_user() from public, anon;
revoke all on function public.submit_inventory_audit(text, jsonb) from public, anon;
revoke all on function public.touch_last_seen() from public, anon;
revoke all on function public.set_app_role_active(uuid, boolean) from public, anon;
revoke all on function public.clock_in_attendance(numeric, numeric, numeric) from public, anon;
revoke all on function public.clock_out_attendance(uuid, numeric, numeric, numeric) from public, anon;
revoke all on function public.update_attendance_record(uuid, timestamptz, timestamptz) from public, anon;
revoke all on function public.delete_attendance_record(uuid) from public, anon;
revoke all on function public.current_cash_drawer_balance() from public, anon;
revoke all on function public.decrement_product_stock(uuid, integer) from public, anon;
revoke all on function public.is_admin(uuid) from public, anon;
revoke all on function public.has_permission(text, uuid) from public, anon;
revoke all on function public.requires_cash_reconciliation(uuid) from public, anon;
revoke all on function public.list_cash_drawer_sessions(integer) from public, anon;
revoke all on function public.get_cash_drawer_handover() from public, anon;
revoke all on function public.open_cash_drawer(numeric, text[]) from public, anon;
revoke all on function public.close_cash_drawer(uuid, numeric, text[]) from public, anon;
revoke all on function public.submit_attendance_cash_check(uuid, numeric, text[]) from public, anon;
revoke all on function public.get_attendance_cash_check(uuid) from public, anon;
revoke all on function public.get_attendance_cash_session(uuid) from public, anon;
revoke all on function public.update_cash_reconciliation(uuid, numeric, text[]) from public, anon;
revoke all on function public.delete_cash_reconciliation(uuid) from public, anon;
revoke all on function public.adjust_cash_drawer_balance(numeric) from public, anon;
revoke all on function public.list_attendance_history(date) from public, anon;
revoke all on function public.create_pos_order(uuid, numeric, text, uuid, numeric, jsonb, text, text, text, text) from public, anon;
revoke all on function public.cancel_pos_order(uuid, text) from public, anon;
revoke all on function public.record_order_print(uuid) from public, anon;
revoke all on function public.delete_pos_orders(uuid[], text) from public, anon;
revoke all on function public.set_product_active(uuid, boolean) from public, anon;
revoke all on function public.soft_delete_product(uuid) from public, anon;
revoke all on function public.clear_products_image_url(text) from public, anon;
revoke all on function public.receive_product_stock(uuid, integer, date, date) from public, anon;
revoke all on function public.issue_product_stock(uuid, integer, text) from public, anon;
revoke all on function public.transfer_product_shelf(uuid, uuid, integer, text) from public, anon;

grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.submit_inventory_audit(text, jsonb) to authenticated;
grant execute on function public.touch_last_seen() to authenticated;
grant execute on function public.set_app_role_active(uuid, boolean) to authenticated;
grant execute on function public.clock_in_attendance(numeric, numeric, numeric) to authenticated;
grant execute on function public.clock_out_attendance(uuid, numeric, numeric, numeric) to authenticated;
grant execute on function public.update_attendance_record(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.delete_attendance_record(uuid) to authenticated;
grant execute on function public.has_permission(text, uuid) to authenticated;
grant execute on function public.requires_cash_reconciliation(uuid) to authenticated;
grant execute on function public.list_cash_drawer_sessions(integer) to authenticated;
grant execute on function public.get_cash_drawer_handover() to authenticated;
grant execute on function public.open_cash_drawer(numeric, text[]) to authenticated;
grant execute on function public.close_cash_drawer(uuid, numeric, text[]) to authenticated;
grant execute on function public.submit_attendance_cash_check(uuid, numeric, text[]) to authenticated;
grant execute on function public.get_attendance_cash_check(uuid) to authenticated;
grant execute on function public.get_attendance_cash_session(uuid) to authenticated;
grant execute on function public.update_cash_reconciliation(uuid, numeric, text[]) to authenticated;
grant execute on function public.delete_cash_reconciliation(uuid) to authenticated;
grant execute on function public.adjust_cash_drawer_balance(numeric) to authenticated;
grant execute on function public.list_attendance_history(date) to authenticated;
grant execute on function public.create_pos_order(uuid, numeric, text, uuid, numeric, jsonb, text, text, text, text) to authenticated;
grant execute on function public.cancel_pos_order(uuid, text) to authenticated;
grant execute on function public.record_order_print(uuid) to authenticated;
grant execute on function public.delete_pos_orders(uuid[], text) to authenticated;
grant execute on function public.set_product_active(uuid, boolean) to authenticated;
grant execute on function public.soft_delete_product(uuid) to authenticated;
grant execute on function public.clear_products_image_url(text) to authenticated;
grant execute on function public.receive_product_stock(uuid, integer, date, date) to authenticated;
grant execute on function public.issue_product_stock(uuid, integer, text) to authenticated;
grant execute on function public.transfer_product_shelf(uuid, uuid, integer, text) to authenticated;

-- Recreating the public schema also removes Supabase's table grants. Server-side
-- APIs use the service-role client and must retain direct access to public data.
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Browser clients use the authenticated database role. Table grants allow the
-- request to reach PostgreSQL; the RLS policies above still decide which rows
-- and operations each signed-in user may access.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

alter default privileges in schema public
grant all privileges on tables to service_role;
alter default privileges in schema public
grant all privileges on sequences to service_role;
alter default privileges in schema public
grant execute on functions to service_role;
alter default privileges in schema public
grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
grant usage, select on sequences to authenticated;

notify pgrst, 'reload schema';
