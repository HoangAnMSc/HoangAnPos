-- Let users with Marketing permissions read/write promotion data.
-- Existing admin access is preserved by has_permission().
begin;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'promotions',
    'promotion_condition_groups',
    'promotion_conditions',
    'promotion_scopes',
    'promotion_redemptions'
  ] loop
    execute format('drop policy if exists %I on public.%I', table_name || '_read', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_write', table_name);
  end loop;
end $$;

create policy promotions_read on public.promotions
for select to authenticated using (public.has_permission('promotions'));
create policy promotions_write on public.promotions
for all to authenticated
using (
  public.has_permission('promotions.create')
  or public.has_permission('promotions.update')
  or public.has_permission('promotions.delete')
)
with check (
  public.has_permission('promotions.create')
  or public.has_permission('promotions.update')
);

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'promotion_condition_groups',
    'promotion_conditions',
    'promotion_scopes'
  ] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.has_permission(''promotions''))',
      table_name || '_read', table_name
    );
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.has_permission(''promotions.update'') or public.has_permission(''promotions.delete'')) with check (public.has_permission(''promotions.create'') or public.has_permission(''promotions.update''))',
      table_name || '_write', table_name
    );
  end loop;
end $$;

create policy promotion_redemptions_read on public.promotion_redemptions
for select to authenticated using (public.has_permission('promotions'));

commit;
