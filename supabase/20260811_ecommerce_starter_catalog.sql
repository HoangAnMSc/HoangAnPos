-- Safe, idempotent starter catalog for an existing Product Engine database.
begin;

insert into public.product_categories(name, slug) values
  ('Thời trang', 'thoi-trang'), ('Điện tử', 'dien-tu'),
  ('Gia dụng', 'gia-dung'), ('Nội thất', 'noi-that'),
  ('Máy móc', 'may-moc'), ('Khác', 'khac')
on conflict (slug) do update set name = excluded.name, is_active = true;

insert into public.product_types(name, code, description) values
  ('Sản phẩm đơn giản', 'general', 'Sản phẩm chỉ có một SKU, phù hợp để nhập nhanh.'),
  ('Thời trang', 'clothing', 'Quần áo, phụ kiện với màu sắc và kích thước.'),
  ('Laptop', 'laptop', 'Máy tính xách tay với RAM, dung lượng và màu sắc.'),
  ('Điện thoại', 'smartphone', 'Điện thoại với dung lượng và màu sắc.'),
  ('Nội thất', 'furniture', 'Bàn, ghế, tủ và đồ dùng nội thất.'),
  ('Máy móc', 'machine', 'Thiết bị công nghiệp với điện áp và cấu hình kỹ thuật.')
on conflict (code) do update set name = excluded.name, description = excluded.description, is_active = true;

insert into public.product_attributes(name, code, data_type, input_type, unit) values
  ('Thương hiệu', 'brand', 'text', 'text', null),
  ('Xuất xứ', 'origin', 'text', 'text', null),
  ('Bảo hành', 'warranty', 'number', 'number', 'tháng'),
  ('Trọng lượng', 'weight', 'number', 'number', 'kg'),
  ('Màu sắc', 'color', 'option', 'color', null),
  ('Kích thước', 'size', 'option', 'select', null),
  ('Chất liệu', 'material', 'option', 'select', null),
  ('CPU', 'cpu', 'text', 'text', null),
  ('RAM', 'ram', 'option', 'select', 'GB'),
  ('Dung lượng', 'storage', 'option', 'select', 'GB'),
  ('Kích thước màn hình', 'screen_size', 'number', 'number', 'inch'),
  ('Điện áp', 'voltage', 'option', 'select', 'V'),
  ('Loại cao su', 'rubber_type', 'option', 'select', null),
  ('WLL', 'wll', 'number', 'number', 'kg'),
  ('Kích thước D×R×C', 'dimensions', 'text', 'text', 'cm')
on conflict (code) do update set name = excluded.name, data_type = excluded.data_type, input_type = excluded.input_type, unit = excluded.unit, is_active = true;

insert into public.product_type_attributes(product_type_id, attribute_id, role, is_required, display_type, sort_order)
select pt.id, pa.id, seed.role, seed.is_required, seed.display_type, seed.sort_order
from (values
  ('general', 'brand', 'specification', false, null::text, 1),
  ('general', 'origin', 'specification', false, null::text, 2),
  ('clothing', 'brand', 'specification', false, null::text, 1),
  ('clothing', 'material', 'specification', false, null::text, 2),
  ('clothing', 'color', 'variant', true, 'color_circle', 3),
  ('clothing', 'size', 'variant', true, 'text_button', 4),
  ('laptop', 'brand', 'specification', true, null::text, 1),
  ('laptop', 'cpu', 'specification', true, null::text, 2),
  ('laptop', 'screen_size', 'specification', false, null::text, 3),
  ('laptop', 'weight', 'specification', false, null::text, 4),
  ('laptop', 'ram', 'variant', true, 'text_button', 5),
  ('laptop', 'storage', 'variant', true, 'image_text', 6),
  ('laptop', 'color', 'variant', false, 'color_circle', 7),
  ('smartphone', 'brand', 'specification', true, null::text, 1),
  ('smartphone', 'screen_size', 'specification', false, null::text, 2),
  ('smartphone', 'weight', 'specification', false, null::text, 3),
  ('smartphone', 'storage', 'variant', true, 'text_button', 4),
  ('smartphone', 'color', 'variant', true, 'color_circle', 5),
  ('furniture', 'dimensions', 'specification', false, null::text, 1),
  ('furniture', 'weight', 'specification', false, null::text, 2),
  ('furniture', 'material', 'variant', false, 'text_button', 3),
  ('furniture', 'color', 'variant', false, 'color_circle', 4),
  ('machine', 'wll', 'specification', true, null::text, 1),
  ('machine', 'dimensions', 'specification', false, null::text, 2),
  ('machine', 'weight', 'specification', false, null::text, 3),
  ('machine', 'voltage', 'variant', true, 'dropdown', 4),
  ('machine', 'rubber_type', 'variant', false, 'text_button', 5)
) as seed(type_code, attribute_code, role, is_required, display_type, sort_order)
join public.product_types pt on pt.code = seed.type_code
join public.product_attributes pa on pa.code = seed.attribute_code
on conflict (product_type_id, attribute_id) do update set
  role = excluded.role, is_required = excluded.is_required,
  display_type = excluded.display_type, sort_order = excluded.sort_order;

commit;
