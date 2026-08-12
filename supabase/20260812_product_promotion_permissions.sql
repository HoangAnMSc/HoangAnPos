begin;

-- Enforce product action permissions inside the database as well as the UI.
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
  elsif tg_table_name in ('product_types', 'product_attributes', 'product_type_attributes', 'product_categories') then
    if not public.has_permission('products.update') then
      raise exception 'Permission denied for product configuration';
    end if;
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

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'product_categories', 'product_types', 'product_attributes',
    'product_type_attributes', 'products', 'product_specifications',
    'product_variant_attributes', 'product_variant_values',
    'variant_value_links', 'product_variants', 'product_images'
  ] loop
    execute format('drop trigger if exists guard_product_engine_write on public.%I', table_name);
    execute format(
      'create trigger guard_product_engine_write before insert or update or delete on public.%I for each row execute function public.guard_product_engine_write()',
      table_name
    );
    execute format('drop policy if exists %I on public.%I', table_name || '_write', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_insert', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_update', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_delete', table_name);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.has_permission(''products.create'') or public.has_permission(''products.update''))',
      table_name || '_insert', table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.has_permission(''products.update'') or public.has_permission(''products.delete'')) with check (public.has_permission(''products.update'') or public.has_permission(''products.delete''))',
      table_name || '_update', table_name
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.has_permission(''products.update'') or public.has_permission(''products.delete''))',
      table_name || '_delete', table_name
    );
  end loop;
end $$;

-- Product readers include POS, warehouse and Marketing scope configuration.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'product_categories', 'product_types', 'product_attributes',
    'product_type_attributes', 'products', 'product_specifications',
    'product_variant_attributes', 'product_variant_values',
    'variant_value_links', 'product_variants', 'product_images'
  ] loop
    execute format('drop policy if exists %I on public.%I', table_name || '_read', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_admin() or public.has_permission(''products'') or public.has_permission(''pos'') or public.has_permission(''orders'') or public.has_permission(''warehouse'') or public.has_permission(''inventory'') or public.has_permission(''promotions''))',
      table_name || '_read', table_name
    );
  end loop;
end $$;

drop policy if exists promotions_write on public.promotions;
drop policy if exists promotions_insert on public.promotions;
drop policy if exists promotions_update on public.promotions;
drop policy if exists promotions_delete on public.promotions;
create policy promotions_insert on public.promotions for insert to authenticated
with check (public.has_permission('promotions.create'));
create policy promotions_update on public.promotions for update to authenticated
using (public.has_permission('promotions.update'))
with check (public.has_permission('promotions.update'));
create policy promotions_delete on public.promotions for delete to authenticated
using (public.has_permission('promotions.delete'));

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'promotion_condition_groups', 'promotion_conditions', 'promotion_scopes'
  ] loop
    execute format('drop policy if exists %I on public.%I', table_name || '_write', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_insert', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_update', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_delete', table_name);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.has_permission(''promotions.create'') or public.has_permission(''promotions.update''))',
      table_name || '_insert', table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.has_permission(''promotions.update'')) with check (public.has_permission(''promotions.update''))',
      table_name || '_update', table_name
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.has_permission(''promotions.update'') or public.has_permission(''promotions.delete''))',
      table_name || '_delete', table_name
    );
  end loop;
end $$;

create or replace function public.soft_delete_product(product_id_input uuid)
returns public.products
language plpgsql
security definer
set search_path = public
as $$
declare result public.products;
begin
  if not public.has_permission('products.delete') then
    raise exception 'Permission denied for product delete';
  end if;
  update public.products
  set status = 'inactive', deleted_at = now(), updated_at = now()
  where id = product_id_input
  returning * into result;
  return result;
end;
$$;

grant execute on function public.soft_delete_product(uuid) to authenticated;

commit;
