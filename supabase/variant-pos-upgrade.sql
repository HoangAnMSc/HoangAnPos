-- Nâng cấp an toàn cho database đang có dữ liệu: lưu và quản lý tồn theo biến thể tại POS.
-- Chạy file này trong Supabase SQL Editor; không chạy lại schema.sql vì schema.sql sẽ reset public schema.

begin;

alter table public.order_items
  add column if not exists variant_key text,
  add column if not exists variant_label text,
  add column if not exists variant_values jsonb,
  add column if not exists variant_source_values jsonb;


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


commit;
