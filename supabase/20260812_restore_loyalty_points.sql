begin;

-- Product Engine previously replaced the POS RPC without carrying over loyalty
-- bookkeeping. Keep earning/redemption and stock changes in the same transaction.
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
      exists(select 1 from public.promotion_scopes s join public.products pr on pr.category_id=s.scope_id where s.promotion_id=p.id and s.scope_type='category' and pr.id=(i->>'product_id')::uuid);
    amount_value := case p.discount_type when 'percentage' then scoped_value*p.discount_value/100 when 'fixed_amount' then least(scoped_value,p.discount_value) else 0 end;
    if p.max_discount_amount is not null then amount_value:=least(amount_value,p.max_discount_amount); end if;
    promotion_id:=p.id; name:=p.name; discount_amount:=round(amount_value,2); free_shipping:=p.discount_type='free_shipping'; return next;
    if not p.is_stackable then return; end if;
  end loop;
end;
$$;

create or replace function public.create_pos_order(
  cashier_id_input uuid, cash_received_input numeric, code_input text, customer_id_input uuid,
  discount_input numeric, items_input jsonb, note_input text, payment_method_input text,
  payment_proof_url_input text, payment_proof_note_input text
) returns public.orders language plpgsql security definer set search_path=public as $$
declare
  item jsonb; variant_record public.product_variants; product_record public.products; batch_record public.product_batches;
  customer_record public.customers; order_record public.orders; quantity_value integer; line_total_value numeric;
  subtotal_value numeric:=0; regular_subtotal_value numeric:=0; reward_subtotal_value numeric:=0; total_value numeric:=0;
  cash_session_id_value uuid; selected_values_value jsonb; variant_name_value text; discount_value numeric:=0;
  line_discount_value numeric:=0; evaluation_items jsonb:='[]'::jsonb; promotion_match record;
  points_redeemed_value integer:=0; points_earned_value integer:=0;
begin
  if not public.has_permission('pos.checkout') then raise exception 'Only admins can create orders'; end if;
  if jsonb_typeof(items_input)<>'array' or jsonb_array_length(items_input)=0 then raise exception 'Order items are required'; end if;
  if payment_method_input not in ('cash','transfer') then raise exception 'Invalid payment method'; end if;
  if customer_id_input is not null then
    select * into customer_record from public.customers where id=customer_id_input for update;
    if customer_record.id is null then raise exception 'Customer not found'; end if;
  end if;
  select id into cash_session_id_value from public.cash_drawer_sessions where status='open' order by opened_at desc limit 1;
  for item in select value from jsonb_array_elements(items_input) loop
    quantity_value:=coalesce((item->>'quantity')::integer,0); if quantity_value<=0 then raise exception 'Invalid item quantity'; end if;
    select * into variant_record from public.product_variants where id=nullif(item->>'variant_id','')::uuid and is_active for update;
    if variant_record.id is null then raise exception 'Product variant is not available'; end if;
    select * into product_record from public.products where id=variant_record.product_id and status='active' and deleted_at is null;
    if product_record.id is null then raise exception 'Product is not available'; end if;
    if variant_record.stock_quantity<quantity_value or variant_record.shelf_quantity<quantity_value then raise exception 'Insufficient stock for selected product variant'; end if;
    if product_record.is_reward then
      if product_record.reward_points_cost<=0 then raise exception 'Reward product has invalid points cost'; end if;
      points_redeemed_value:=points_redeemed_value+(product_record.reward_points_cost*quantity_value);
      reward_subtotal_value:=reward_subtotal_value+(variant_record.base_price*quantity_value);
    else
      regular_subtotal_value:=regular_subtotal_value+(variant_record.base_price*quantity_value);
      evaluation_items:=evaluation_items||jsonb_build_array(jsonb_build_object('product_id',product_record.id,'variant_id',variant_record.id,'unit_price',variant_record.base_price,'quantity',quantity_value));
    end if;
  end loop;
  if points_redeemed_value>0 and (customer_id_input is null or customer_record.points<points_redeemed_value) then points_redeemed_value:=0; end if;
  subtotal_value:=regular_subtotal_value+case when points_redeemed_value>0 then 0 else reward_subtotal_value end;
  if coalesce(discount_input,0)<>0 then raise exception 'Order discounts are disabled'; end if;
  perform pg_advisory_xact_lock(hashtext('promotion-redemption'));
  for promotion_match in select * from public.evaluate_promotions(evaluation_items,customer_id_input,nullif(items_input->0->>'coupon_code','')) loop discount_value:=discount_value+promotion_match.discount_amount; end loop;
  discount_value:=least(discount_value,subtotal_value); total_value:=subtotal_value-discount_value;
  points_earned_value:=case when customer_id_input is null then 0 else floor(total_value/100000)::integer end;
  if payment_method_input='cash' and cash_received_input<total_value then raise exception 'Cash received is lower than total'; end if;
  insert into public.orders(code,customer_id,cash_session_id,cashier_id,cashier_name,subtotal,discount,total,payment_method,cash_received,change_amount,payment_proof_url,payment_proof_note,note,status,points_earned,points_redeemed)
  values(code_input,customer_id_input,cash_session_id_value,cashier_id_input,(select full_name from public.profiles where id=cashier_id_input),subtotal_value,discount_value,total_value,
    payment_method_input,case when payment_method_input='cash' then cash_received_input else 0 end,case when payment_method_input='cash' then cash_received_input-total_value else 0 end,
    payment_proof_url_input,payment_proof_note_input,note_input,'paid',points_earned_value,points_redeemed_value) returning * into order_record;
  for item in select value from jsonb_array_elements(items_input) loop
    quantity_value:=(item->>'quantity')::integer; batch_record:=null;
    select * into variant_record from public.product_variants where id=(item->>'variant_id')::uuid for update;
    select * into product_record from public.products where id=variant_record.product_id;
    if nullif(item->>'batch_id','') is not null then select * into batch_record from public.product_batches where id=(item->>'batch_id')::uuid and variant_id=variant_record.id for update; end if;
    perform public.reserve_variant_stock(variant_record.id,quantity_value,nullif(item->>'batch_id','')::uuid);
    select coalesce(jsonb_object_agg(a.name,v.label),'{}'::jsonb), string_agg(v.label,' / ' order by a.sort_order)
      into selected_values_value,variant_name_value from public.variant_value_links l join public.product_variant_values v on v.id=l.variant_value_id
      join public.product_variant_attributes a on a.id=l.variant_attribute_id where l.variant_id=variant_record.id;
    line_discount_value:=case when product_record.is_reward or regular_subtotal_value<=0 then 0 else round(discount_value*(variant_record.base_price*quantity_value/regular_subtotal_value),2) end;
    line_total_value:=case when product_record.is_reward and points_redeemed_value>0 then 0 else variant_record.base_price*quantity_value-line_discount_value end;
    insert into public.order_items(order_id,product_id,variant_id,batch_id,product_name,variant_name,selected_values,sku,quantity,unit_price,discount_amount,final_price,line_total,reward_points_cost,import_date,expiry_date)
    values(order_record.id,product_record.id,variant_record.id,nullif(item->>'batch_id','')::uuid,product_record.name,variant_name_value,selected_values_value,variant_record.sku,
      quantity_value,case when product_record.is_reward and points_redeemed_value>0 then 0 else variant_record.base_price end,line_discount_value,
      case when product_record.is_reward and points_redeemed_value>0 then 0 else greatest(variant_record.base_price-(line_discount_value/quantity_value),0) end,
      line_total_value,case when product_record.is_reward and points_redeemed_value>0 then product_record.reward_points_cost else 0 end,batch_record.import_date,batch_record.expiry_date);
    insert into public.stock_movements(variant_id,movement_type,quantity,reason,reference_type,reference_id,actor_id,actor_name)
    values(variant_record.id,'sale',-quantity_value,'POS sale','order',order_record.id,auth.uid(),coalesce((select full_name from public.profiles where id=auth.uid()),'System'));
  end loop;
  for promotion_match in select * from public.evaluate_promotions(evaluation_items,customer_id_input,nullif(items_input->0->>'coupon_code','')) loop
    insert into public.promotion_redemptions(promotion_id,user_id,order_id,discount_amount) values(promotion_match.promotion_id,customer_id_input,order_record.id,promotion_match.discount_amount);
  end loop;
  if customer_id_input is not null then update public.customers set points=points-points_redeemed_value+points_earned_value where id=customer_id_input; end if;
  insert into public.order_audit_events(order_id,actor_id,event_type,details) values(order_record.id,auth.uid(),'created',jsonb_build_object('code',order_record.code,'total',order_record.total,'points_earned',points_earned_value,'points_redeemed',points_redeemed_value));
  return order_record;
end;
$$;

create or replace function public.cancel_pos_order(order_id_input uuid, reason_input text)
returns public.orders language plpgsql security definer set search_path=public as $$
declare order_record public.orders; line public.order_items;
begin
  if not public.has_permission('orders.cancel') then raise exception 'Permission denied'; end if;
  select * into order_record from public.orders where id=order_id_input for update;
  if order_record.id is null then raise exception 'Order not found'; end if;
  if order_record.status='cancelled' then return order_record; end if;
  for line in select * from public.order_items where order_id=order_id_input loop
    if line.variant_id is not null then
      update public.product_variants set stock_quantity=stock_quantity+line.quantity,shelf_quantity=shelf_quantity+line.quantity,updated_at=now() where id=line.variant_id;
      if line.batch_id is not null then update public.product_batches set quantity=quantity+line.quantity,shelf_quantity=shelf_quantity+line.quantity where id=line.batch_id; end if;
      insert into public.stock_movements(variant_id,movement_type,quantity,reason,reference_type,reference_id,actor_id,actor_name)
      values(line.variant_id,'return',line.quantity,'Cancel order','order',order_id_input,auth.uid(),coalesce((select full_name from public.profiles where id=auth.uid()),'System'));
    end if;
  end loop;
  if order_record.customer_id is not null then
    update public.customers set points=greatest(points-order_record.points_earned+order_record.points_redeemed,0) where id=order_record.customer_id;
  end if;
  update public.orders set status='cancelled',cancelled_at=now(),cancelled_by=auth.uid(),cancel_reason=left(trim(reason_input),1000) where id=order_id_input returning * into order_record;
  insert into public.order_audit_events(order_id,actor_id,event_type,reason,details) values(order_id_input,auth.uid(),'cancelled',reason_input,jsonb_build_object('points_reversed',true));
  return order_record;
end;
$$;

grant execute on function public.evaluate_promotions(jsonb,uuid,text) to authenticated;
grant execute on function public.create_pos_order(uuid,numeric,text,uuid,numeric,jsonb,text,text,text,text) to authenticated;
grant execute on function public.cancel_pos_order(uuid,text) to authenticated;

commit;
