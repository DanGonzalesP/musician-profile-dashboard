-- Supervisión agregada: no expone titulares, claves de objetos ni secretos.
begin;
create function public.media_maintenance_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb; v_now timestamptz := statement_timestamp();
begin
  if auth.uid() is null or not public.has_platform_permission('maintenance') then
    raise exception 'mantenimiento_no_autorizado' using errcode = '42501';
  end if;
  with closures as (
    select count(*) as pending, min(closure_requested_at) as oldest
    from private.media_account_state where state = 'closing'
  ), expired as (
    select count(*) as pending, min(expires_at) as oldest
    from private.media_upload_intents where state = 'pending' and expires_at < v_now
  ), jobs as (
    -- Ignore historical leases once their account/work is finished.
    select j.* from private.media_maintenance_leases j
    join private.media_account_state s using(owner_user_id)
    where s.state = 'closing' or (s.state = 'active' and exists (
      select 1 from private.media_upload_intents i
      where i.owner_user_id = s.owner_user_id and i.state = 'pending' and i.expires_at < v_now
    ))
  )
  select jsonb_build_object(
    'observedAt', v_now,
    'closuresPending', c.pending,
    'oldestClosureAt', c.oldest,
    'uploadsExpired', e.pending,
    'oldestUploadExpiryAt', e.oldest,
    'jobsLeased', (select count(*) from jobs where lease_until > v_now),
    'jobsLeaseExpired', (select count(*) from jobs where last_outcome = 'leased' and lease_until <= v_now),
    'jobsBlocked', (select count(*) from jobs where last_outcome = 'blocked'),
    'jobsWaitingRetry', (select count(*) from jobs where lease_until <= v_now and next_attempt_at > v_now),
    'closuresWithoutJob', (select count(*) from private.media_account_state s
      where s.state = 'closing' and not exists (
        select 1 from private.media_maintenance_leases j where j.owner_user_id = s.owner_user_id
      ))
  ) into v_result from closures c cross join expired e;
  return v_result;
end;
$$;
revoke all on function public.media_maintenance_overview() from public,anon,authenticated;
grant execute on function public.media_maintenance_overview() to authenticated;
comment on function public.media_maintenance_overview() is
  'Estado agregado de cierres y reservas vencidas; solo maintenance/owner. No modifica ni reclama trabajos.';
notify pgrst,'reload schema';
commit;
