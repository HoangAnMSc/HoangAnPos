-- Keep applied promotions for historical orders; remove unused promotions.
alter table public.promotions add column if not exists deleted_at timestamptz;
alter table public.promotions
  add column if not exists buy_variant_id uuid references public.product_variants(id),
  add column if not exists buy_quantity integer not null default 10,
  add column if not exists gift_variant_id uuid references public.product_variants(id),
  add column if not exists gift_quantity integer not null default 1,
  add column if not exists repeat_gift boolean not null default true;
alter table public.promotions drop constraint if exists promotions_discount_type_check;
alter table public.promotions add constraint promotions_discount_type_check
  check (discount_type in ('percentage','fixed_amount','free_shipping','buy_x_get_y'));
alter table public.promotions drop constraint if exists promotions_gift_rule_check;
alter table public.promotions add constraint promotions_gift_rule_check
  check (buy_quantity > 0 and gift_quantity > 0
    and (discount_type <> 'buy_x_get_y' or buy_variant_id is not null));

alter table public.promotion_redemptions
  add column if not exists promotion_name text,
  add column if not exists gifts jsonb not null default '[]'::jsonb;
update public.promotion_redemptions r set promotion_name=p.name
from public.promotions p where p.id=r.promotion_id and r.promotion_name is null;
alter table public.order_items
  add column if not exists is_promotion_gift boolean not null default false,
  add column if not exists promotion_id uuid references public.promotions(id) on delete restrict,
  add column if not exists promotion_name text;

create or replace function public.delete_promotion(promotion_id_input uuid)
returns text language plpgsql security definer set search_path = public as $$
declare promotion_record public.promotions;
begin
  if auth.uid() is null or not public.has_permission('promotions.delete') then
    raise exception 'Bạn không có quyền xóa chương trình khuyến mãi.';
  end if;
  -- Checkout takes the same lock before evaluating and recording promotions.
  perform pg_advisory_xact_lock(hashtext('promotion-redemption'));
  select * into promotion_record from public.promotions where id = promotion_id_input for update;
  if not found then raise exception 'Không tìm thấy chương trình khuyến mãi.'; end if;
  if promotion_record.deleted_at is not null then return 'archived'; end if;
  if exists(select 1 from public.promotion_redemptions where promotion_id = promotion_id_input) then
    update public.promotions set deleted_at = now(), is_active = false, updated_at = now()
    where id = promotion_id_input;
    return 'archived';
  end if;
  delete from public.promotions where id = promotion_id_input;
  return 'deleted';
end;
$$;
revoke all on function public.delete_promotion(uuid) from public;
grant execute on function public.delete_promotion(uuid) to authenticated, service_role;

create or replace function public.guard_deleted_promotion()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.deleted_at is not null then
    raise exception 'Chương trình đã xóa chỉ được xem lại lịch sử.';
  end if;
  if new.deleted_at is distinct from old.deleted_at and not public.has_permission('promotions.delete') then
    raise exception 'Bạn không có quyền xóa chương trình khuyến mãi.';
  end if;
  if new.deleted_at is not null then new.is_active := false; end if;
  return new;
end;
$$;
drop trigger if exists guard_deleted_promotion on public.promotions;
create trigger guard_deleted_promotion before update on public.promotions
for each row execute function public.guard_deleted_promotion();

CREATE OR REPLACE FUNCTION public.evaluate_promotion_benefits(items_input jsonb, customer_id_input uuid DEFAULT NULL::uuid, coupon_code_input text DEFAULT NULL::text) RETURNS TABLE(promotion_id uuid, name text, discount_amount numeric, free_shipping boolean, gifts jsonb)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare p public.promotions; subtotal_value numeric; scoped_value numeric; amount_value numeric;
  inventory_items_value jsonb := items_input; gift_record record; gift_id uuid;
  bought_quantity integer; requested_quantity integer; available_quantity integer; awarded_quantity integer;
  allocated_gifts jsonb := '{}'::jsonb;
begin
  select coalesce(jsonb_agg(i),'[]'::jsonb) into items_input
  from jsonb_array_elements(items_input) i where not coalesce((i->>'is_reward')::boolean,false);
  select coalesce(sum((i->>'unit_price')::numeric * (i->>'quantity')::integer),0)
  into subtotal_value from jsonb_array_elements(items_input) i;
  for p in select * from public.promotions x where x.is_active and x.deleted_at is null
    and (x.start_at is null or x.start_at <= now()) and (x.end_at is null or x.end_at > now())
    and (x.trigger_type='automatic' or
         (x.trigger_type='coupon' and upper(x.code)=upper(trim(coupon_code_input))))
    order by x.priority desc, x.created_at
  loop
    if p.total_usage_limit is not null and (select count(*) from public.promotion_redemptions r where r.promotion_id=p.id) >= p.total_usage_limit then continue; end if;
    if p.usage_per_customer is not null and customer_id_input is null then continue; end if;
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
    if p.discount_type = 'buy_x_get_y' then
      select coalesce(sum((i->>'quantity')::integer),0) into bought_quantity
      from jsonb_array_elements(items_input) i where (i->>'variant_id')::uuid = p.buy_variant_id;
      requested_quantity := (case when p.repeat_gift then bought_quantity / p.buy_quantity
        else least(bought_quantity / p.buy_quantity,1) end) * p.gift_quantity;
      if requested_quantity <= 0 then continue; end if;
      gift_id := coalesce(p.gift_variant_id, p.buy_variant_id);
      select v.id, v.product_id, v.sku, v.base_price, v.stock_quantity, v.shelf_quantity,
        v.is_active and pr.status='active' and pr.deleted_at is null as available,
        pr.name as product_name,
        (select string_agg(vv.label,' / ' order by va.sort_order)
         from public.variant_value_links l join public.product_variant_values vv on vv.id=l.variant_value_id
         join public.product_variant_attributes va on va.id=l.variant_attribute_id
         where l.variant_id=v.id) as variant_name
      into gift_record from public.product_variants v join public.products pr on pr.id=v.product_id
      where v.id=gift_id;
      if gift_record.id is null then continue; end if;
      select greatest(0,least(gift_record.stock_quantity,gift_record.shelf_quantity)
        - coalesce(sum((i->>'quantity')::integer),0)::integer
        - coalesce((allocated_gifts->>gift_id::text)::integer,0)) into available_quantity
      from jsonb_array_elements(inventory_items_value) i where (i->>'variant_id')::uuid=gift_id;
      awarded_quantity := case when gift_record.available then least(requested_quantity,available_quantity) else 0 end;
      allocated_gifts := jsonb_set(allocated_gifts,array[gift_id::text],
        to_jsonb(coalesce((allocated_gifts->>gift_id::text)::integer,0)+awarded_quantity));
      promotion_id:=p.id; name:=p.name; discount_amount:=0; free_shipping:=false;
      gifts:=jsonb_build_array(jsonb_build_object('variant_id',gift_id,'product_id',gift_record.product_id,
        'sku',gift_record.sku,'product_name',gift_record.product_name,'variant_name',gift_record.variant_name,
        'unit_price',gift_record.base_price,'quantity',awarded_quantity,'requested_quantity',requested_quantity,
        'warning',case when awarded_quantity<requested_quantity then
          format('Chương trình %s: thiếu %s quà %s do không đủ tồn kho/tại quầy hoặc SKU đã ngừng bán. Đơn được tặng %s quà.',
            p.name,requested_quantity-awarded_quantity,gift_record.product_name,awarded_quantity) else null end));
      return next;
      if awarded_quantity>0 and not p.is_stackable then return; end if;
      continue;
    end if;
    select coalesce(sum((i->>'unit_price')::numeric*(i->>'quantity')::integer),0) into scoped_value
    from jsonb_array_elements(items_input) i where
      exists(select 1 from public.promotion_scopes s where s.promotion_id=p.id and s.scope_type='all') or
      exists(select 1 from public.promotion_scopes s where s.promotion_id=p.id and s.scope_type='variant' and s.scope_id=(i->>'variant_id')::uuid) or
      exists(select 1 from public.promotion_scopes s where s.promotion_id=p.id and s.scope_type='product' and s.scope_id=(i->>'product_id')::uuid) or
      exists(select 1 from public.promotion_scopes s join public.products pr on pr.id=(i->>'product_id')::uuid
        where s.promotion_id=p.id and s.scope_type='category'
          and (pr.product_type_id=s.scope_id or pr.category_id=s.scope_id));
    if scoped_value <= 0 then continue; end if;
    amount_value := case p.discount_type when 'percentage' then scoped_value*p.discount_value/100 when 'fixed_amount' then least(scoped_value,p.discount_value) else 0 end;
    if p.max_discount_amount is not null then amount_value:=least(amount_value,p.max_discount_amount); end if;
    gifts:='[]'::jsonb; promotion_id:=p.id; name:=p.name; discount_amount:=round(amount_value,2); free_shipping:=p.discount_type='free_shipping'; return next;
    if not p.is_stackable then return; end if;
  end loop;
end;
$$;

revoke all on function public.evaluate_promotion_benefits(jsonb,uuid,text) from public;
grant execute on function public.evaluate_promotion_benefits(jsonb,uuid,text) to authenticated, service_role;

create or replace function public.evaluate_promotions(items_input jsonb, customer_id_input uuid default null, coupon_code_input text default null)
returns table(promotion_id uuid,name text,discount_amount numeric,free_shipping boolean)
language sql stable security definer set search_path=public as $$
  select b.promotion_id,b.name,b.discount_amount,b.free_shipping
  from public.evaluate_promotion_benefits(items_input,customer_id_input,coupon_code_input) b;
$$;

alter table public.orders add column if not exists promotion_snapshot jsonb not null default '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.create_pos_order(cashier_id_input uuid, cash_received_input numeric, code_input text, customer_id_input uuid, discount_input numeric, items_input jsonb, note_input text, payment_method_input text, payment_proof_url_input text, payment_proof_note_input text) RETURNS public.orders
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  item jsonb; variant_record public.product_variants; product_record public.products; batch_record public.product_batches;
  customer_record public.customers; order_record public.orders; quantity_value integer; line_total_value numeric;
  subtotal_value numeric:=0; regular_subtotal_value numeric:=0; reward_subtotal_value numeric:=0; total_value numeric:=0;
  cash_session_id_value uuid; selected_values_value jsonb; variant_name_value text; discount_value numeric:=0;
  line_discount_value numeric:=0; evaluation_items jsonb:='[]'::jsonb; promotion_match record;
  points_redeemed_value integer:=0; points_earned_value integer:=0;
  benefits_value jsonb := '[]'::jsonb; gift_item jsonb;
begin
  if auth.uid() is null or not public.has_permission('pos.checkout') then
    raise exception 'Permission denied for checkout';
  end if;
  if cashier_id_input is distinct from auth.uid() then
    raise exception 'Cashier identity does not match the signed-in user';
  end if;
  if jsonb_typeof(items_input)<>'array' or jsonb_array_length(items_input)=0 then raise exception 'Order items are required'; end if;
  if payment_method_input not in ('cash','transfer') then raise exception 'Invalid payment method'; end if;

  if public.requires_cash_reconciliation(auth.uid()) then
    if not exists (
      select 1 from public.attendance_records attendance
      where attendance.user_id = auth.uid() and attendance.clock_out_at is null
    ) then
      raise exception 'Active attendance is required before checkout';
    end if;

    select id into cash_session_id_value
    from public.cash_drawer_sessions
    where cashier_id = auth.uid() and status = 'open'
    for update;
    if not found then raise exception 'Open a cash drawer session before checkout'; end if;
  else
    select id into cash_session_id_value
    from public.cash_drawer_sessions
    where status = 'open'
    order by opened_at desc, id desc
    limit 1
    for update;
  end if;

  if customer_id_input is not null then
    select * into customer_record from public.customers where id=customer_id_input for update;
    if customer_record.id is null then raise exception 'Customer not found'; end if;
  end if;
  perform pg_advisory_xact_lock(hashtext('promotion-redemption'));
  -- Reserve a consistent inventory view for paid lines and gifts before evaluation.
  perform 1 from public.product_variants v where v.id in (
    select (i->>'variant_id')::uuid from jsonb_array_elements(items_input) i
    union select coalesce(p.gift_variant_id,p.buy_variant_id) from public.promotions p
      where p.is_active and p.deleted_at is null and p.discount_type='buy_x_get_y'
  ) order by v.id for update;
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

    end if;
    evaluation_items:=evaluation_items||jsonb_build_array(jsonb_build_object('product_id',product_record.id,'variant_id',variant_record.id,'unit_price',variant_record.base_price,'quantity',quantity_value,'is_reward',product_record.is_reward));
  end loop;
  if points_redeemed_value>0 and (customer_id_input is null or customer_record.points<points_redeemed_value) then points_redeemed_value:=0; end if;
  subtotal_value:=regular_subtotal_value+case when points_redeemed_value>0 then 0 else reward_subtotal_value end;
  if coalesce(discount_input,0)<>0 then raise exception 'Order discounts are disabled'; end if;
  select coalesce(jsonb_agg(to_jsonb(b)),'[]'::jsonb) into benefits_value
  from public.evaluate_promotion_benefits(evaluation_items,customer_id_input,nullif(items_input->0->>'coupon_code','')) b;
  select coalesce(sum((b->>'discount_amount')::numeric),0) into discount_value from jsonb_array_elements(benefits_value) b;
  discount_value:=least(discount_value,subtotal_value); total_value:=subtotal_value-discount_value;
  points_earned_value:=case when customer_id_input is null then 0 else floor(total_value/100000)::integer end;
  if payment_method_input='cash' and coalesce(cash_received_input,0)<total_value then raise exception 'Cash received is lower than total'; end if;
  if payment_method_input='transfer'
    and nullif(trim(coalesce(payment_proof_url_input,'')), '') is null
    and nullif(trim(coalesce(payment_proof_note_input,'')), '') is null then
    raise exception 'Payment proof is required for transfer orders';
  end if;
  insert into public.orders(code,customer_id,cash_session_id,cashier_id,cashier_name,subtotal,discount,total,payment_method,cash_received,change_amount,payment_proof_url,payment_proof_note,note,status,points_earned,points_redeemed)
  values(code_input,customer_id_input,cash_session_id_value,auth.uid(),(select full_name from public.profiles where id=auth.uid()),subtotal_value,discount_value,total_value,
    payment_method_input,case when payment_method_input='cash' then coalesce(cash_received_input,0) else total_value end,case when payment_method_input='cash' then coalesce(cash_received_input,0)-total_value else 0 end,
    payment_proof_url_input,payment_proof_note_input,note_input,'paid',points_earned_value,points_redeemed_value) returning * into order_record;
  update public.orders set promotion_snapshot=benefits_value where id=order_record.id returning * into order_record;
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
  for promotion_match in select * from jsonb_to_recordset(benefits_value)
    as b(promotion_id uuid,name text,discount_amount numeric,free_shipping boolean,gifts jsonb)
  loop
    for gift_item in select value from jsonb_array_elements(coalesce(promotion_match.gifts,'[]'::jsonb)) loop
      quantity_value := (gift_item->>'quantity')::integer;
      if quantity_value<=0 then continue; end if;
      select * into variant_record from public.product_variants where id=(gift_item->>'variant_id')::uuid;
      perform public.reserve_variant_stock(variant_record.id,quantity_value,null);
      select coalesce(jsonb_object_agg(a.name,v.label),'{}'::jsonb) into selected_values_value
      from public.variant_value_links l join public.product_variant_values v on v.id=l.variant_value_id
      join public.product_variant_attributes a on a.id=l.variant_attribute_id where l.variant_id=variant_record.id;
      insert into public.order_items(order_id,product_id,variant_id,product_name,variant_name,selected_values,sku,
        quantity,unit_price,discount_amount,final_price,line_total,reward_points_cost,is_promotion_gift,promotion_id,promotion_name)
      values(order_record.id,variant_record.product_id,variant_record.id,gift_item->>'product_name',gift_item->>'variant_name',
        selected_values_value,variant_record.sku,quantity_value,0,0,0,0,0,true,promotion_match.promotion_id,promotion_match.name);
      insert into public.stock_movements(variant_id,movement_type,quantity,reason,reference_type,reference_id,actor_id,actor_name)
      values(variant_record.id,'sale',-quantity_value,'Quà khuyến mãi: '||promotion_match.name,'order',order_record.id,
        auth.uid(),coalesce((select full_name from public.profiles where id=auth.uid()),'System'));
    end loop;
    if promotion_match.discount_amount>0 or promotion_match.free_shipping or exists(
      select 1 from jsonb_array_elements(coalesce(promotion_match.gifts,'[]'::jsonb)) g where (g->>'quantity')::integer>0
    ) then
      insert into public.promotion_redemptions(promotion_id,user_id,order_id,discount_amount,promotion_name,gifts)
      values(promotion_match.promotion_id,customer_id_input,order_record.id,promotion_match.discount_amount,promotion_match.name,promotion_match.gifts);
    end if;
  end loop;
  if customer_id_input is not null then update public.customers set points=points-points_redeemed_value+points_earned_value where id=customer_id_input; end if;
  insert into public.order_audit_events(order_id,actor_id,event_type,details) values(order_record.id,auth.uid(),'created',jsonb_build_object('code',order_record.code,'total',order_record.total,'points_earned',points_earned_value,'points_redeemed',points_redeemed_value));
  return order_record;
end;
$$;
