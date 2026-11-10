-- Allow multiple completed shifts per business day; still only one open shift.
-- Replace the function directly: existing deployments may use different
-- whitespace or CRLF line endings inside their PL/pgSQL function bodies.
begin;
drop index if exists public.attendance_records_user_work_date_unique_idx;

create unique index if not exists attendance_records_one_open_shift_idx
  on public.attendance_records(user_id) where clock_out_at is null;

create or replace function public.clock_in_attendance(
  latitude_input numeric,
  longitude_input numeric,
  accuracy_input numeric
) returns public.attendance_records
language plpgsql security definer set search_path=public as $$
declare
  attendance_record public.attendance_records;
  drawer_session public.cash_drawer_sessions;
  employee_name_value text;
  expected_cash_value numeric := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.has_permission('attendance.clock') then
    raise exception 'Permission denied';
  end if;

  if latitude_input is null or longitude_input is null then
    raise exception 'Location is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('attendance-user:' || auth.uid()::text,0));
  select *
  into attendance_record
  from public.attendance_records
  where user_id = auth.uid()
    and clock_out_at is null
  order by clock_in_at desc
  limit 1
  for update;

  if not found then
    insert into public.attendance_records (
      user_id,
      clock_in_latitude,
      clock_in_longitude,
      clock_in_accuracy_m
    )
    values (
      auth.uid(),
      latitude_input,
      longitude_input,
      accuracy_input
    )
    returning * into attendance_record;
  end if;

  if public.requires_cash_reconciliation(auth.uid()) then
    select *
    into drawer_session
    from public.cash_drawer_sessions
    where status = 'open'
    order by opened_at desc, id desc
    limit 1;

    if not found then
      select *
      into drawer_session
      from public.cash_drawer_sessions
      where status = 'closed'
      order by closed_at desc, id desc
      limit 1;
    end if;

    expected_cash_value := public.current_cash_drawer_balance();

    select coalesce(nullif(btrim(profile.full_name), ''), 'Nhân viên ' || left(profile.id::text, 8))
    into employee_name_value
    from public.profiles profile
    where profile.id = auth.uid();

    insert into public.cash_drawer_checks (
      attendance_record_id,
      employee_id,
      employee_name,
      cash_session_id,
      expected_cash
    )
    values (
      attendance_record.id,
      auth.uid(),
      coalesce(employee_name_value, 'Nhân viên'),
      drawer_session.id,
      expected_cash_value
    )
    on conflict (attendance_record_id) do nothing;
  end if;

  return attendance_record;
end $$;

revoke all on function public.clock_in_attendance(numeric,numeric,numeric) from public,anon;
grant execute on function public.clock_in_attendance(numeric,numeric,numeric) to authenticated,service_role;
notify pgrst,'reload schema';
commit;
