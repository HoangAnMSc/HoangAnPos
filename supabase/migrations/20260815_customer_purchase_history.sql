-- Add customer purchase-history access without resetting existing data.

update public.app_roles
set permissions = array_append(permissions, 'customers.purchase-history.view')
where code in ('admin', 'staff')
  and not ('customers.purchase-history.view' = any(permissions));

drop policy if exists "Order viewers can read orders" on public.orders;
create policy "Order viewers can read orders"
on public.orders for select
using (
  public.has_permission('orders')
  or public.has_permission('revenue')
  or public.has_permission('customers.purchase-history.view')
);

drop policy if exists order_items_read on public.order_items;
create policy order_items_read
on public.order_items for select to authenticated
using (
  public.has_permission('orders')
  or public.has_permission('revenue')
  or public.has_permission('pos')
  or public.has_permission('customers.purchase-history.view')
);

drop policy if exists product_images_read on public.product_images;
create policy product_images_read
on public.product_images for select to authenticated
using (
  public.is_admin()
  or public.has_permission('products')
  or public.has_permission('pos')
  or public.has_permission('orders')
  or public.has_permission('warehouse')
  or public.has_permission('inventory')
  or public.has_permission('promotions')
  or public.has_permission('customers.purchase-history.view')
);

drop policy if exists product_variants_read on public.product_variants;
create policy product_variants_read
on public.product_variants for select to authenticated
using (
  public.is_admin()
  or public.has_permission('products')
  or public.has_permission('pos')
  or public.has_permission('orders')
  or public.has_permission('warehouse')
  or public.has_permission('inventory')
  or public.has_permission('promotions')
  or public.has_permission('customers.purchase-history.view')
);
