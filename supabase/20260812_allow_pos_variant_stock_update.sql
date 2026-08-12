-- Allow authorized transaction RPCs to change SKU inventory without granting
-- cashiers permission to edit product content or pricing.
create or replace function public.guard_product_engine_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'products' then
    if tg_op = 'INSERT' and not public.has_permission('products.create') then
      raise exception 'Permission denied for product create';
    elsif tg_op = 'UPDATE' then
      if new.deleted_at is not null and old.deleted_at is null then
        if not public.has_permission('products.delete') then
          raise exception 'Permission denied for product delete';
        end if;
      elsif not public.has_permission('products.update') then
        raise exception 'Permission denied for product update';
      end if;
    elsif tg_op = 'DELETE' and not public.has_permission('products.delete') then
      raise exception 'Permission denied for product delete';
    end if;
  elsif tg_table_name in ('product_types', 'product_type_attributes', 'product_categories') then
    if not (public.has_permission('products.update') or public.has_permission('products.types.manage')) then
      raise exception 'Permission denied for product configuration';
    end if;
  elsif tg_table_name = 'product_attributes' then
    if not (public.has_permission('products.update') or public.has_permission('products.attributes.manage')) then
      raise exception 'Permission denied for product attributes';
    end if;
  elsif tg_table_name = 'product_variants'
    and tg_op = 'UPDATE'
    and (
      public.has_permission('pos.checkout')
      or public.has_permission('orders.cancel')
      or public.has_permission('products.receive-stock')
      or public.has_permission('warehouse.stock-out')
      or public.has_permission('inventory.submit')
    )
    and (
      to_jsonb(new) - array['stock_quantity', 'shelf_quantity', 'updated_at']
      = to_jsonb(old) - array['stock_quantity', 'shelf_quantity', 'updated_at']
    ) then
    return new;
  elsif tg_op = 'INSERT' then
    if not (public.has_permission('products.create') or public.has_permission('products.update')) then
      raise exception 'Permission denied for product data create';
    end if;
  elsif not public.has_permission('products.update') then
    raise exception 'Permission denied for product data update';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
