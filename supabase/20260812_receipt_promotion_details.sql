begin;

-- POS and order-history users need read-only access to the applied promotion
-- names and redemption amounts so receipts can explain every discount.
drop policy if exists promotions_read on public.promotions;
create policy promotions_read on public.promotions
for select to authenticated using (
  public.has_permission('promotions')
  or public.has_permission('orders')
  or public.has_permission('pos')
);

drop policy if exists promotion_redemptions_read on public.promotion_redemptions;
create policy promotion_redemptions_read on public.promotion_redemptions
for select to authenticated using (
  public.has_permission('promotions')
  or public.has_permission('orders')
  or public.has_permission('pos')
);

commit;
