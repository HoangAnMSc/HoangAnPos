-- Fix Product editor saves when a variant value or dimension is removed.
-- Links are ownership rows and must disappear with their value/attribute.
begin;

alter table public.variant_value_links
  drop constraint if exists variant_value_links_variant_value_id_fkey,
  drop constraint if exists variant_value_links_variant_attribute_id_fkey,
  drop constraint if exists variant_value_links_variant_value_id_variant_attribute_id_fkey;

alter table public.variant_value_links
  add constraint variant_value_links_variant_value_id_fkey
    foreign key (variant_value_id)
    references public.product_variant_values(id)
    on delete cascade,
  add constraint variant_value_links_variant_attribute_id_fkey
    foreign key (variant_attribute_id)
    references public.product_variant_attributes(id)
    on delete cascade,
  add constraint variant_value_links_variant_value_id_variant_attribute_id_fkey
    foreign key (variant_value_id, variant_attribute_id)
    references public.product_variant_values(id, variant_attribute_id)
    on delete cascade;

commit;
