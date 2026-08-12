begin;

-- The admin-facing "Danh mục sản phẩm" is backed by product_types. Keep the
-- legacy category_id match for existing scope rows while making new scopes
-- correctly match products.product_type_id.
create or replace function public.evaluate_promotions(
  items_input jsonb, customer_id_input uuid default null, coupon_code_input text default null
) returns table(promotion_id uuid, name text, discount_amount numeric, free_shipping boolean)
language plpgsql security definer set search_path = public stable as $$
declare p public.promotions; subtotal_value numeric; scoped_value numeric; amount_value numeric;
begin
  select coalesce(sum((i->>'unit_price')::numeric * (i->>'quantity')::integer),0)
  into subtotal_value from jsonb_array_elements(items_input) i;
  for p in select * from public.promotions x where x.is_active
    and (x.start_at is null or x.start_at <= now()) and (x.end_at is null or x.end_at > now())
    and ((x.trigger_type='automatic' and coupon_code_input is null) or
         (x.trigger_type='coupon' and upper(x.code)=upper(trim(coupon_code_input))))
    order by x.priority desc, x.created_at
  loop
    if p.total_usage_limit is not null and (select count(*) from public.promotion_redemptions r where r.promotion_id=p.id) >= p.total_usage_limit then continue; end if;
    if customer_id_input is not null and p.usage_per_customer is not null and
       (select count(*) from public.promotion_redemptions r where r.promotion_id=p.id and r.user_id=customer_id_input) >= p.usage_per_customer then continue; end if;
    if exists (select 1 from public.promotion_conditions c where c.promotion_id=p.id and c.condition_type='order_total'
      and not case c.operator when 'gte' then subtotal_value >= (c.value#>>'{}')::numeric when 'gt' then subtotal_value > (c.value#>>'{}')::numeric
      when 'lte' then subtotal_value <= (c.value#>>'{}')::numeric when 'lt' then subtotal_value < (c.value#>>'{}')::numeric
      when 'eq' then subtotal_value = (c.value#>>'{}')::numeric when 'neq' then subtotal_value <> (c.value#>>'{}')::numeric else false end) then continue; end if;
    if exists (select 1 from public.promotion_conditions c where c.promotion_id=p.id and c.condition_type='quantity'
      and not case c.operator
        when 'gte' then (select coalesce(sum((i->>'quantity')::integer),0) from jsonb_array_elements(items_input) i) >= (c.value#>>'{}')::integer
        when 'gt' then (select coalesce(sum((i->>'quantity')::integer),0) from jsonb_array_elements(items_input) i) > (c.value#>>'{}')::integer
        when 'lte' then (select coalesce(sum((i->>'quantity')::integer),0) from jsonb_array_elements(items_input) i) <= (c.value#>>'{}')::integer
        when 'lt' then (select coalesce(sum((i->>'quantity')::integer),0) from jsonb_array_elements(items_input) i) < (c.value#>>'{}')::integer
        when 'eq' then (select coalesce(sum((i->>'quantity')::integer),0) from jsonb_array_elements(items_input) i) = (c.value#>>'{}')::integer
        when 'neq' then (select coalesce(sum((i->>'quantity')::integer),0) from jsonb_array_elements(items_input) i) <> (c.value#>>'{}')::integer else false end) then continue; end if;
    if customer_id_input is null and exists(select 1 from public.promotion_conditions c where c.promotion_id=p.id and c.condition_type in ('customer_order_count','customer_points')) then continue; end if;
    if exists (select 1 from public.promotion_conditions c where c.promotion_id=p.id and c.condition_type='customer_order_count'
      and not case c.operator
        when 'eq' then (select count(*) from public.orders o where o.customer_id=customer_id_input and o.status='paid') = (c.value#>>'{}')::integer
        when 'neq' then (select count(*) from public.orders o where o.customer_id=customer_id_input and o.status='paid') <> (c.value#>>'{}')::integer
        when 'gt' then (select count(*) from public.orders o where o.customer_id=customer_id_input and o.status='paid') > (c.value#>>'{}')::integer
        when 'gte' then (select count(*) from public.orders o where o.customer_id=customer_id_input and o.status='paid') >= (c.value#>>'{}')::integer
        when 'lt' then (select count(*) from public.orders o where o.customer_id=customer_id_input and o.status='paid') < (c.value#>>'{}')::integer
        when 'lte' then (select count(*) from public.orders o where o.customer_id=customer_id_input and o.status='paid') <= (c.value#>>'{}')::integer else false end) then continue; end if;
    if exists (select 1 from public.promotion_conditions c where c.promotion_id=p.id and c.condition_type='customer_points'
      and not case c.operator
        when 'eq' then (select points from public.customers where id=customer_id_input) = (c.value#>>'{}')::integer
        when 'neq' then (select points from public.customers where id=customer_id_input) <> (c.value#>>'{}')::integer
        when 'gt' then (select points from public.customers where id=customer_id_input) > (c.value#>>'{}')::integer
        when 'gte' then (select points from public.customers where id=customer_id_input) >= (c.value#>>'{}')::integer
        when 'lt' then (select points from public.customers where id=customer_id_input) < (c.value#>>'{}')::integer
        when 'lte' then (select points from public.customers where id=customer_id_input) <= (c.value#>>'{}')::integer else false end) then continue; end if;
    if exists (select 1 from public.promotion_conditions c where c.promotion_id=p.id and c.condition_type not in ('order_total','quantity','customer_order_count','customer_points')) then continue; end if;
    select coalesce(sum((i->>'unit_price')::numeric*(i->>'quantity')::integer),0) into scoped_value
    from jsonb_array_elements(items_input) i where
      exists(select 1 from public.promotion_scopes s where s.promotion_id=p.id and s.scope_type='all') or
      exists(select 1 from public.promotion_scopes s where s.promotion_id=p.id and s.scope_type='variant' and s.scope_id=(i->>'variant_id')::uuid) or
      exists(select 1 from public.promotion_scopes s where s.promotion_id=p.id and s.scope_type='product' and s.scope_id=(i->>'product_id')::uuid) or
      exists(select 1 from public.promotion_scopes s join public.products pr on pr.id=(i->>'product_id')::uuid
        where s.promotion_id=p.id and s.scope_type='category'
          and (pr.product_type_id=s.scope_id or pr.category_id=s.scope_id));
    amount_value := case p.discount_type when 'percentage' then scoped_value*p.discount_value/100 when 'fixed_amount' then least(scoped_value,p.discount_value) else 0 end;
    if p.max_discount_amount is not null then amount_value:=least(amount_value,p.max_discount_amount); end if;
    promotion_id:=p.id; name:=p.name; discount_amount:=round(amount_value,2); free_shipping:=p.discount_type='free_shipping'; return next;
    if not p.is_stackable then return; end if;
  end loop;
end;
$$;

grant execute on function public.evaluate_promotions(jsonb,uuid,text) to authenticated;

-- Marketing users need read-only product data to configure product/SKU scopes.
-- Write policies remain unchanged.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'product_categories', 'product_types', 'products', 'product_specifications',
    'product_variant_attributes', 'product_variant_values', 'variant_value_links',
    'product_variants', 'product_images'
  ] loop
    execute format('drop policy if exists %I on public.%I', table_name || '_read', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_admin() or public.has_permission(''products'') or public.has_permission(''promotions''))',
      table_name || '_read', table_name
    );
  end loop;
end $$;

commit;
