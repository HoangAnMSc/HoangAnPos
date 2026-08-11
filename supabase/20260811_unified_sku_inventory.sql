-- Use product_variants.stock_quantity as the single source of inventory truth.
-- Deprecated shelf columns are kept temporarily for backward compatibility and
-- mirrored automatically so older RPCs cannot restrict sales independently.
begin;

update public.product_variants set shelf_quantity = stock_quantity;
update public.product_batches set shelf_quantity = quantity;

create or replace function public.sync_deprecated_variant_shelf_quantity()
returns trigger language plpgsql as $$
begin
  new.shelf_quantity := new.stock_quantity;
  return new;
end;
$$;

drop trigger if exists product_variants_sync_deprecated_shelf on public.product_variants;
create trigger product_variants_sync_deprecated_shelf
before insert or update of stock_quantity, shelf_quantity on public.product_variants
for each row execute function public.sync_deprecated_variant_shelf_quantity();

create or replace function public.sync_deprecated_batch_shelf_quantity()
returns trigger language plpgsql as $$
begin
  new.shelf_quantity := new.quantity;
  return new;
end;
$$;

drop trigger if exists product_batches_sync_deprecated_shelf on public.product_batches;
create trigger product_batches_sync_deprecated_shelf
before insert or update of quantity, shelf_quantity on public.product_batches
for each row execute function public.sync_deprecated_batch_shelf_quantity();

create or replace function public.receive_variant_stock(
  variant_id_input uuid,
  quantity_input integer,
  import_date_input date default null,
  expiry_date_input date default null
) returns public.product_batches
language plpgsql security definer set search_path=public as $$
declare
  variant_record public.product_variants;
  batch_record public.product_batches;
begin
  if not public.has_permission('products.receive-stock') then
    raise exception 'Permission denied for stock receipt';
  end if;
  if quantity_input <= 0 then raise exception 'Quantity must be greater than zero'; end if;

  select * into variant_record
  from public.product_variants
  where id = variant_id_input and is_active
  for update;
  if variant_record.id is null then raise exception 'Product variant not found'; end if;

  update public.product_variants
  set stock_quantity = stock_quantity + quantity_input, updated_at = now()
  where id = variant_record.id;

  insert into public.product_batches(variant_id, quantity, import_date, expiry_date)
  values(variant_record.id, quantity_input, import_date_input, expiry_date_input)
  returning * into batch_record;

  insert into public.stock_movements(variant_id,movement_type,quantity,reason,actor_id,actor_name)
  values(variant_record.id,'in',quantity_input,'Nhập kho theo SKU',auth.uid(),coalesce((select full_name from public.profiles where id=auth.uid()),'Hệ thống'));
  return batch_record;
end;
$$;

create or replace function public.issue_variant_stock(
  variant_id_input uuid,
  quantity_input integer,
  reason_input text
) returns public.product_variants
language plpgsql security definer set search_path=public as $$
declare variant_record public.product_variants;
begin
  if not public.has_permission('warehouse.stock-out') then
    raise exception 'Permission denied for stock issue';
  end if;
  if quantity_input <= 0 then raise exception 'Quantity must be greater than zero'; end if;
  if nullif(trim(reason_input),'') is null then raise exception 'Stock issue reason is required'; end if;

  select * into variant_record
  from public.product_variants
  where id = variant_id_input and is_active
  for update;
  if variant_record.id is null then raise exception 'Product variant not found'; end if;
  if variant_record.stock_quantity < quantity_input then raise exception 'Insufficient stock'; end if;

  update public.product_variants
  set stock_quantity = stock_quantity - quantity_input, updated_at = now()
  where id = variant_record.id returning * into variant_record;

  insert into public.stock_movements(variant_id,movement_type,quantity,reason,actor_id,actor_name)
  values(variant_record.id,'out',-quantity_input,left(trim(reason_input),1000),auth.uid(),coalesce((select full_name from public.profiles where id=auth.uid()),'Hệ thống'));
  return variant_record;
end;
$$;

create or replace function public.submit_inventory_audit(staff_name_input text, lines_input jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare audit_id_value uuid; line jsonb; variant_record public.product_variants;
begin
  if not public.has_permission('inventory.submit') then raise exception 'Permission denied'; end if;
  insert into public.inventory_audits(created_by,staff_name)
  values(auth.uid(),left(trim(staff_name_input),160)) returning id into audit_id_value;
  for line in select value from jsonb_array_elements(lines_input) loop
    select * into variant_record from public.product_variants
    where id=(line->>'variant_id')::uuid and is_active;
    if variant_record.id is null then raise exception 'Product variant not found'; end if;
    insert into public.inventory_audit_lines(audit_id,variant_id,product_name,sku,counted)
    values(audit_id_value,variant_record.id,line->>'product_name',variant_record.sku,(line->>'counted')::integer);
  end loop;
  return audit_id_value;
end;
$$;

revoke all on function public.transfer_product_shelf(uuid,uuid,integer,text) from public, anon, authenticated;
grant execute on function public.receive_variant_stock(uuid,integer,date,date) to authenticated;
grant execute on function public.issue_variant_stock(uuid,integer,text) to authenticated;
grant execute on function public.submit_inventory_audit(text,jsonb) to authenticated;

commit;
