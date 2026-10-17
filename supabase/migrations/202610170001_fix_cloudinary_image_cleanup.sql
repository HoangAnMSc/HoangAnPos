-- Upgrade existing databases without resetting any tables or data.
begin;

create or replace function public.clear_products_image_url(image_url_input text)
returns integer
language plpgsql security definer
set search_path to 'public'
as $$
declare affected integer := 0; current_count integer := 0;
begin
  if auth.uid() is null or not public.has_permission('cloudinary-images.delete') then
    raise exception 'Permission denied';
  end if;
  if nullif(trim(coalesce(image_url_input, '')), '') is null then return 0; end if;

  delete from public.product_images where image_url = image_url_input;
  get diagnostics affected = row_count;

  -- Product Engine stores images in product_images, not products.image_url.
  update public.product_variant_values
  set metadata = metadata - 'image_url' - 'cloudinary_public_id', updated_at = now()
  where metadata->>'image_url' = image_url_input;
  get diagnostics current_count = row_count;
  return affected + current_count;
end;
$$;

grant execute on function public.clear_products_image_url(text) to authenticated, service_role;
notify pgrst, 'reload schema';
commit;
