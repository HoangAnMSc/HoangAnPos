-- Upgrade an existing stock-conversion installation. No stock or history is reset.
begin;

create or replace function public.save_stock_conversion(
  product_id_input uuid, variant_a_id_input uuid, quantity_a_input integer,
  variant_b_id_input uuid, quantity_b_input integer,
  conversion_id_input uuid default null, expected_updated_at_input timestamptz default null
) returns public.stock_conversions
language plpgsql security definer set search_path = public as $$
declare saved public.stock_conversions; existing public.stock_conversions;
begin
  if auth.uid() is null or not public.has_permission('warehouse.conversion.configure') then
    raise exception 'Bạn không có quyền thiết lập quy đổi.';
  end if;
  if quantity_a_input is null or quantity_a_input <= 0 or quantity_b_input is null or quantity_b_input <= 0 then
    raise exception 'Số lượng hai phía phải là số nguyên lớn hơn 0.';
  end if;
  if variant_a_id_input is null or variant_b_id_input is null or variant_a_id_input = variant_b_id_input then
    raise exception 'Hãy chọn hai biến thể khác nhau của cùng một sản phẩm.';
  end if;
  if conversion_id_input is not null then
    select * into existing from public.stock_conversions where id=conversion_id_input for update;
    if not found then raise exception 'Thiết lập quy đổi không còn tồn tại.'; end if;
    if expected_updated_at_input is null or existing.updated_at <> expected_updated_at_input then
      raise exception 'Thiết lập đã thay đổi. Hãy mở lại trước khi lưu.';
    end if;
  end if;
  perform 1 from public.products where id=product_id_input and deleted_at is null and status='active' for update;
  if not found then raise exception 'Sản phẩm không còn hoạt động.'; end if;
  perform 1 from public.product_variants where id in (variant_a_id_input,variant_b_id_input) order by id for update;
  if (select count(*) from public.product_variants where id in (variant_a_id_input,variant_b_id_input)
    and product_id=product_id_input and is_active) <> 2 then
    raise exception 'Hai biến thể phải đang hoạt động và thuộc cùng sản phẩm đã chọn.';
  end if;
  if conversion_id_input is null then
    insert into public.stock_conversions(product_id,variant_a_id,quantity_a,variant_b_id,quantity_b,created_by)
    values(product_id_input,variant_a_id_input,quantity_a_input,variant_b_id_input,quantity_b_input,auth.uid()) returning * into saved;
  else
    -- Change the configuration only. Prior events keep their product/SKU snapshots.
    update public.stock_conversions set product_id=product_id_input,
      variant_a_id=variant_a_id_input, quantity_a=quantity_a_input,
      variant_b_id=variant_b_id_input, quantity_b=quantity_b_input, updated_at=clock_timestamp()
    where id=conversion_id_input returning * into saved;
  end if;
  return saved;
exception when unique_violation then
  raise exception 'Cặp biến thể này đã có thiết lập quy đổi. Hãy mở card sản phẩm để chỉnh sửa.';
end;
$$;

create or replace function public.delete_stock_conversion(
  conversion_id_input uuid, expected_updated_at_input timestamptz
) returns uuid
language plpgsql security definer set search_path = public as $$
declare existing public.stock_conversions;
begin
  if auth.uid() is null or not public.has_permission('warehouse.conversion.configure') then
    raise exception 'Bạn không có quyền xóa thiết lập quy đổi.';
  end if;
  if conversion_id_input is null then raise exception 'Hãy chọn thiết lập cần xóa.'; end if;
  select * into existing from public.stock_conversions where id=conversion_id_input for update;
  -- Retrying a deletion is harmless, including when its first response was lost.
  if not found then return conversion_id_input; end if;
  if expected_updated_at_input is null or existing.updated_at <> expected_updated_at_input then
    raise exception 'Thiết lập đã thay đổi. Hãy mở lại trước khi xóa.';
  end if;
  -- The event foreign key uses ON DELETE SET NULL; snapshots and movements remain.
  delete from public.stock_conversions where id=conversion_id_input;
  return conversion_id_input;
end;
$$;

revoke all on function public.save_stock_conversion(uuid,uuid,integer,uuid,integer,uuid,timestamptz) from public,anon;
revoke all on function public.delete_stock_conversion(uuid,timestamptz) from public,anon;
grant execute on function public.save_stock_conversion(uuid,uuid,integer,uuid,integer,uuid,timestamptz) to authenticated;
grant execute on function public.delete_stock_conversion(uuid,timestamptz) to authenticated;
notify pgrst, 'reload schema';
commit;
