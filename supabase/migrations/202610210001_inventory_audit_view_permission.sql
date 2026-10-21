-- Separate inventory audit history viewing from warehouse access.
begin;

drop policy if exists inventory_audits_read on public.inventory_audits;
create policy inventory_audits_read on public.inventory_audits
  for select to authenticated
  using (public.has_permission('warehouse.audit.view'));

drop policy if exists inventory_audit_lines_read on public.inventory_audit_lines;
create policy inventory_audit_lines_read on public.inventory_audit_lines
  for select to authenticated
  using (public.has_permission('warehouse.audit.view'));

-- Existing FOR ALL write policies also participate in SELECT. A restrictive
-- policy prevents delete permission from granting history viewing implicitly.
-- Submission uses the existing SECURITY DEFINER RPC and remains independent.
drop policy if exists inventory_audits_view_permission on public.inventory_audits;
create policy inventory_audits_view_permission on public.inventory_audits
  as restrictive for select to authenticated
  using (public.has_permission('warehouse.audit.view'));

drop policy if exists inventory_audit_lines_view_permission on public.inventory_audit_lines;
create policy inventory_audit_lines_view_permission on public.inventory_audit_lines
  as restrictive for select to authenticated
  using (public.has_permission('warehouse.audit.view'));

notify pgrst, 'reload schema';
commit;
