-- Shared card presentation settings for Product administration and POS.
begin;

create table if not exists public.product_settings (
  id text primary key default 'default',
  enable_color boolean not null default false,
  enable_size boolean not null default false,
  custom_attributes jsonb not null default '[]'::jsonb,
  card_settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.product_settings(id, card_settings)
values (
  'default',
  jsonb_build_object(
    'visibleFields', jsonb_build_array('image','name','category','price','compare_price','stock','variant_count'),
    'imageFit', 'cover',
    'posCard', jsonb_build_object(
      'visibleFields', jsonb_build_array('image','name','price','compare_price','stock','variant_count'),
      'imageFit', 'contain'
    )
  )
)
on conflict(id) do nothing;

alter table public.product_settings enable row level security;
drop policy if exists product_settings_read on public.product_settings;
drop policy if exists product_settings_write on public.product_settings;
create policy product_settings_read on public.product_settings
for select to authenticated using (public.is_admin());
create policy product_settings_write on public.product_settings
for all to authenticated using (public.is_admin()) with check (public.is_admin());

commit;
