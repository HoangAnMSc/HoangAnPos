-- Previous deployed functions. Used only by the upgrade regression test.
CREATE OR REPLACE FUNCTION public.guard_product_engine_write() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if tg_table_name = 'products'
    and tg_op = 'UPDATE'
    and public.has_permission('products.toggle-active')
    and (
      to_jsonb(new) - array['status', 'updated_at']
      = to_jsonb(old) - array['status', 'updated_at']
    ) then
    return new;
  elsif tg_table_name = 'products'
    and tg_op = 'UPDATE'
    and public.has_permission('cloudinary-images.delete')
    and (
      to_jsonb(new) - array['image_url', 'updated_at']
      = to_jsonb(old) - array['image_url', 'updated_at']
    ) then
    return new;
  elsif tg_table_name = 'product_variant_values'
    and tg_op = 'UPDATE'
    and public.has_permission('cloudinary-images.delete')
    and (
      to_jsonb(new) - array['metadata', 'updated_at']
      = to_jsonb(old) - array['metadata', 'updated_at']
    ) then
    return new;
  elsif tg_table_name = 'product_images'
    and tg_op = 'DELETE'
    and public.has_permission('cloudinary-images.delete') then
    return old;
  elsif tg_table_name = 'products' then
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
  elsif tg_table_name = 'product_categories' then
    if not (
      public.has_permission('products.update')
      or public.has_permission('products.types.manage')
      or (tg_op in ('INSERT','UPDATE') and public.has_permission('products.categories.create'))
    ) then
      raise exception 'Permission denied for product category';
    end if;
  elsif tg_table_name in ('product_types', 'product_type_attributes') then
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

CREATE OR REPLACE FUNCTION public.soft_delete_product(product_id_input uuid) RETURNS public.products
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  result public.products;
  remaining_stock integer;
  stocked_skus integer;
begin
  if not public.has_permission('products.delete') then
    raise exception 'Permission denied for product delete';
  end if;
  perform 1 from public.products where id=product_id_input and deleted_at is null for update;
  if not found then raise exception 'Product not found'; end if;
  perform 1 from public.product_variants where product_id=product_id_input for update;
  select
    coalesce(sum(greatest(stock_quantity, shelf_quantity)),0)::integer,
    count(*) filter (where stock_quantity > 0 or shelf_quantity > 0)::integer
  into remaining_stock, stocked_skus
  from public.product_variants
  where product_id=product_id_input;
  if remaining_stock > 0 then
    raise exception 'PRODUCT_HAS_STOCK: Sản phẩm còn % đơn vị trong % SKU. Hãy xuất hoặc điều chỉnh tồn về 0 trước khi xóa.', remaining_stock, stocked_skus;
  end if;
  update public.product_variants
  set is_active=false,is_default=false,updated_at=now()
  where product_id=product_id_input;
  update public.products
  set status = 'inactive', deleted_at = now(), updated_at = now()
  where id = product_id_input and deleted_at is null
  returning * into result;
  return result;
end;
$$;

CREATE OR REPLACE FUNCTION public.save_product_engine(payload jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  product_id_value uuid;
  attribute jsonb;
  value_row jsonb;
  variant jsonb;
  image_row jsonb;
  specification jsonb;
  variant_id_value uuid;
  previous_stock integer;
  next_stock integer;
  variant_existed boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if nullif(payload->>'id','') is null then
    if not public.has_permission('products.create') then raise exception 'Permission denied for product create'; end if;
  elsif exists(select 1 from public.products where id=(payload->>'id')::uuid) then
    if not public.has_permission('products.update') then raise exception 'Permission denied for product update'; end if;
  elsif not public.has_permission('products.create') then
    raise exception 'Permission denied for product create';
  end if;
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
  if exists(
    select 1
    from public.product_variants pv
    where pv.product_id=product_id_value
      and not exists(
        select 1 from jsonb_array_elements(coalesce(payload->'variants','[]')) item
        where nullif(item->>'id','')::uuid=pv.id
      )
      and (pv.stock_quantity > 0 or pv.shelf_quantity > 0)
  ) then
    raise exception 'VARIANT_HAS_STOCK: Không thể bỏ tổ hợp vẫn còn tồn kho. Hãy xuất hoặc điều chỉnh tồn về 0 trước.';
  end if;
  update public.product_variants pv
  set is_active=false,is_default=false,updated_at=now()
  where pv.product_id=product_id_value and not exists(
    select 1 from jsonb_array_elements(coalesce(payload->'variants','[]')) item where nullif(item->>'id','')::uuid=pv.id
  );
  update public.product_variants set is_default=false where product_id=product_id_value;
  for variant in select value from jsonb_array_elements(coalesce(payload->'variants','[]')) loop
    variant_id_value := (variant->>'id')::uuid;
    select pv.stock_quantity into previous_stock
    from public.product_variants pv where pv.id=variant_id_value for update;
    variant_existed := found;
    next_stock := coalesce((variant->>'stock_quantity')::integer,0);
    delete from public.variant_value_links where variant_id=variant_id_value;
    insert into public.product_variants(id,product_id,sku,barcode,base_price,compare_at_price,cost_price,stock_quantity,shelf_quantity,weight,is_default,is_active)
    values(variant_id_value,product_id_value,variant->>'sku',nullif(variant->>'barcode',''),
      coalesce((variant->>'base_price')::numeric,0),nullif(variant->>'compare_at_price','')::numeric,coalesce((variant->>'cost_price')::numeric,0),
      next_stock,coalesce((variant->>'shelf_quantity')::integer,0),nullif(variant->>'weight','')::numeric,
      coalesce((variant->>'is_default')::boolean,false),coalesce((variant->>'is_active')::boolean,true))
    on conflict(id) do update set sku=excluded.sku,barcode=excluded.barcode,base_price=excluded.base_price,compare_at_price=excluded.compare_at_price,cost_price=excluded.cost_price,stock_quantity=excluded.stock_quantity,shelf_quantity=excluded.shelf_quantity,weight=excluded.weight,is_default=excluded.is_default,is_active=excluded.is_active,updated_at=now();
    if next_stock <> coalesce(previous_stock,0) then
      if next_stock > coalesce(previous_stock,0) and not public.has_permission('products.receive-stock') then
        raise exception 'STOCK_PERMISSION_DENIED: Tài khoản không có quyền tăng tồn kho.';
      end if;
      if next_stock < coalesce(previous_stock,0) and not public.has_permission('warehouse.stock-out') then
        raise exception 'STOCK_PERMISSION_DENIED: Tài khoản không có quyền giảm tồn kho.';
      end if;
      insert into public.stock_movements(variant_id,movement_type,quantity,reason,reference_type,reference_id,actor_id,actor_name)
      values(
        variant_id_value,
        'adjustment',
        next_stock-coalesce(previous_stock,0),
        case when variant_existed then 'Điều chỉnh tồn khi cập nhật sản phẩm' else 'Tồn đầu kỳ khi tạo SKU' end,
        'product',
        product_id_value,
        auth.uid(),
        coalesce((select full_name from public.profiles where id=auth.uid()),'Hệ thống')
      );
    end if;
    insert into public.variant_value_links(variant_id,variant_value_id,variant_attribute_id)
    select variant_id_value,
      vv.id,vv.variant_attribute_id from jsonb_array_elements_text(coalesce(variant->'value_ids','[]')) ids(id)
      join public.product_variant_values vv on vv.id=ids.id::uuid;
    if nullif(variant->>'image_url','') is not null then
      insert into public.product_images(product_id,variant_id,image_url,cloudinary_public_id,is_primary)
      select product_id_value,pv.id,variant->>'image_url',nullif(variant->>'cloudinary_public_id',''),true
      from public.product_variants pv where pv.product_id=product_id_value and pv.sku=variant->>'sku';
    end if;
  end loop;
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
