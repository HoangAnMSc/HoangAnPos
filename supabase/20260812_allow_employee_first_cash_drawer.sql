-- Allow the first cashier to open the physical drawer when their counted cash
-- matches the balance calculated by the system. A manager is still required
-- to approve any variance, and evidence remains mandatory for that variance.
create or replace function public.open_cash_drawer(
  opening_cash_input numeric,
  evidence_urls_input text[] default '{}'
)
returns public.cash_drawer_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  cashier_name_value text;
  expected_opening_cash_value numeric(12, 2);
  is_first_session_value boolean;
  opening_variance_value numeric(12, 2);
  session_record public.cash_drawer_sessions;
begin
  if auth.uid() is null or not public.has_permission('cash-management.session.open') then
    raise exception 'Permission denied';
  end if;

  if opening_cash_input is null or opening_cash_input < 0 then
    raise exception 'Opening cash cannot be negative';
  end if;

  perform pg_advisory_xact_lock(417902113);

  if exists (
    select 1
    from public.cash_drawer_sessions
    where status = 'open'
      and public.requires_cash_reconciliation(cashier_id)
  ) then
    raise exception 'Cash drawer is already open';
  end if;

  update public.cash_drawer_sessions supporting_session
  set
    cash_sales = coalesce((
      select sum(pos_order.total)
      from public.orders pos_order
      where pos_order.cash_session_id = supporting_session.id
        and pos_order.status = 'paid'
        and pos_order.payment_method = 'cash'
    ), 0),
    transfer_sales = coalesce((
      select sum(pos_order.total)
      from public.orders pos_order
      where pos_order.cash_session_id = supporting_session.id
        and pos_order.status = 'paid'
        and pos_order.payment_method = 'transfer'
    ), 0),
    expected_cash = public.current_cash_drawer_balance(),
    counted_cash = public.current_cash_drawer_balance(),
    variance = 0,
    cash_adjustment = 0,
    status = 'closed',
    closed_at = now(),
    closed_by = auth.uid(),
    close_evidence_urls = '{}'
  where supporting_session.status = 'open'
    and not public.requires_cash_reconciliation(supporting_session.cashier_id);

  is_first_session_value := not exists (
    select 1 from public.cash_drawer_sessions
  );
  expected_opening_cash_value := public.current_cash_drawer_balance();
  opening_variance_value := opening_cash_input - expected_opening_cash_value;

  if opening_variance_value <> 0 then
    if not public.has_permission('cash-management.handover.override') then
      if is_first_session_value then
        raise exception 'Opening cash does not match the system balance and requires manager approval';
      end if;
      raise exception 'Opening cash does not match the previous handover balance';
    end if;

    if cardinality(coalesce(evidence_urls_input, '{}')) not between 1 and 5 then
      raise exception 'Between 1 and 5 evidence images are required when opening cash has a variance';
    end if;
  end if;

  select concat_ws(
    ' - ',
    coalesce(r.name, nullif(trim(p.role), ''), 'Nhân viên'),
    nullif(trim(p.full_name), '')
  )
  into cashier_name_value
  from public.profiles p
  left join public.app_roles r on r.id = p.role_id
  where p.id = auth.uid()
    and p.is_active = true;

  if not found then
    raise exception 'Active cashier profile is required';
  end if;

  insert into public.cash_drawer_sessions (
    cashier_id,
    cashier_name,
    expected_opening_cash,
    opening_cash,
    opening_variance,
    opening_evidence_urls
  )
  values (
    auth.uid(),
    coalesce(nullif(cashier_name_value, ''), 'Nhân viên'),
    expected_opening_cash_value,
    opening_cash_input,
    opening_variance_value,
    case when opening_variance_value = 0 then '{}' else coalesce(evidence_urls_input, '{}') end
  )
  returning * into session_record;

  return session_record;
exception
  when unique_violation then
    raise exception 'Cash drawer is already open';
end;
$$;

revoke all on function public.open_cash_drawer(numeric, text[]) from public, anon;
grant execute on function public.open_cash_drawer(numeric, text[]) to authenticated;
