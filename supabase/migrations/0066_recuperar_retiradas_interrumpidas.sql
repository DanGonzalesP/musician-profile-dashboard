-- Continuar borrados autorizados que quedaron interrumpidos tras publicar.
-- No descubre huérfanos ni atribuye objetos históricos. Sólo reclamaciones
-- duraderas, sin referencias y con propiedad coincidente; gracia de cinco minutos.
begin;
create function private.pending_media_retirements(p_owner uuid) returns table(key text)
language sql stable security definer set search_path = '' as $$
  select l.key from private.media_lifecycle l
  join public.media_assets a on a.key = l.key and a.owner_user_id = l.owner_user_id
  left join private.media_retirements r on r.key = l.key
  where l.owner_user_id = p_owner and l.state = 'deleting'
    and l.deletion_requested_at < statement_timestamp() - interval '5 minutes'
    and (r.key is null or a.bytes is distinct from 0)
    and not exists(select 1 from private.media_references ref where ref.key = l.key)
    and l.key ~ '^(images|audio|video)/[A-Za-z0-9_.~-]+(/[A-Za-z0-9_.~-]+)*$'
    and l.key !~ '(^|/)\.{1,2}(/|$)' and split_part(l.key,'/',2) = p_owner::text;
$$;
revoke all on function private.pending_media_retirements(uuid) from public,anon,authenticated;
create index media_deletion_recovery on private.media_lifecycle(owner_user_id,deletion_requested_at)
  where state = 'deleting';
insert into private.media_account_state(owner_user_id)
  select distinct l.owner_user_id from private.media_lifecycle l
  join auth.users u on u.id = l.owner_user_id where l.state = 'deleting'
  on conflict(owner_user_id) do nothing;
alter table private.media_maintenance_leases drop constraint media_maintenance_leases_purpose_check;
alter table private.media_maintenance_leases add constraint media_maintenance_leases_purpose_check
  check (purpose in ('closure','expired','retirement'));

create or replace function public.claim_media_deletion(p_key text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_row private.media_lifecycle;
begin
  if auth.uid() is null then return false; end if;
  -- Una key histórica fuera de la gramática del extractor exige revisión.
  if p_key is null or p_key !~ '^(images|audio|video)/[A-Za-z0-9_.~-]+(/[A-Za-z0-9_.~-]+)*$'
     or p_key ~ '(^|/)\.{1,2}(/|$)' then return false; end if;
  perform private.lock_media_account();
  select * into v_row from private.media_lifecycle where key = p_key for update;
  if not found or v_row.owner_user_id is distinct from auth.uid() then return false; end if;
  if v_row.state = 'deleting' then return true; end if;
  if exists(select 1 from private.media_references where key = p_key) then return false; end if;
  update private.media_lifecycle set state = 'deleting', deletion_requested_at = clock_timestamp() where key = p_key;
  return true;
end;
$$;

create or replace function public.run_media_maintenance(p_payload text,p_signature text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v jsonb; v_owner uuid; v_state text; v_keys text[]; v_batch jsonb;
  v_job private.media_maintenance_leases; v_purpose text; v_key text;
begin
  v := private.verify_media_maintenance(p_payload,p_signature);
  if v->>'action' = 'claim' then
    select s.owner_user_id,s.state into v_owner,v_state
    from private.media_account_state s left join private.media_maintenance_leases j using(owner_user_id)
    where coalesce(j.next_attempt_at,'-infinity') <= clock_timestamp()
      and coalesce(j.lease_until,'-infinity') <= clock_timestamp()
      and exists(select 1 from auth.users where id = s.owner_user_id)
      and (s.state = 'closing' or (s.state = 'active' and (exists(
        select 1 from private.media_upload_intents i where i.owner_user_id = s.owner_user_id
          and i.state = 'pending' and i.expires_at < clock_timestamp())
        or exists(select 1 from private.pending_media_retirements(s.owner_user_id)))))
    order by coalesce(j.next_attempt_at,'-infinity'),s.owner_user_id
    limit 1 for update of s skip locked;
    if v_owner is null then return jsonb_build_object('job',null,'blocked',false); end if;
    v_purpose := case when v_state = 'closing' then 'closure'
      when exists(select 1 from private.pending_media_retirements(v_owner)) then 'retirement'
      else 'expired' end;
    if v_purpose = 'closure' then
      v_batch := private.media_closure_batch(v_owner,20);
      select array(select jsonb_array_elements_text(v_batch->'keys')) into v_keys;
    elsif v_purpose = 'retirement' then
      select coalesce(array_agg(key),'{}') into v_keys from (
        select key from private.pending_media_retirements(v_owner) order by key limit 20
      ) pending;
      v_batch := jsonb_build_object('blocked',cardinality(v_keys) = 0);
    else
      -- El bloqueo de cuenta serializa finalización y limpieza. Un archivo ready
      -- o una referencia histórica no se retira por haber vencido su firma.
      select coalesce(array_agg(key),'{}') into v_keys from (
        select i.key from private.media_upload_intents i
        join public.media_assets a on a.key = i.key and a.owner_user_id = v_owner
        join private.media_lifecycle l on l.key = i.key and l.owner_user_id = v_owner
        where i.owner_user_id = v_owner and i.state = 'pending' and i.expires_at < clock_timestamp()
          and not exists(select 1 from private.media_references r where r.key = i.key)
          and i.key ~ '^(images|audio|video)/[A-Za-z0-9_.~-]+(/[A-Za-z0-9_.~-]+)*$'
          and i.key !~ '(^|/)\.{1,2}(/|$)' and split_part(i.key,'/',2) = v_owner::text
        order by i.key limit 20
      ) eligible;
      v_batch := jsonb_build_object('blocked',cardinality(v_keys) = 0);
    end if;
    insert into private.media_maintenance_leases(owner_user_id,purpose) values(v_owner,v_purpose)
      on conflict(owner_user_id) do nothing;
    if v_batch->>'blocked' = 'true' then
      update private.media_maintenance_leases set next_attempt_at = clock_timestamp() + interval '15 minutes',
        lease_until = '-infinity',keys = '{}',last_outcome = 'blocked' where owner_user_id = v_owner;
      return jsonb_build_object('job',null,'blocked',true);
    end if;
    perform 1 from private.media_lifecycle where key = any(v_keys) order by key for update;
    update private.media_lifecycle set state = 'deleting',
      deletion_requested_at = coalesce(deletion_requested_at,clock_timestamp()) where key = any(v_keys);
    update private.media_maintenance_leases set lease_id = gen_random_uuid(),purpose = v_purpose,keys = v_keys,
      lease_until = clock_timestamp() + interval '5 minutes',last_outcome = 'leased'
      where owner_user_id = v_owner returning * into v_job;
    return jsonb_build_object('job',jsonb_build_object('leaseId',v_job.lease_id,'owner',v_owner,'keys',v_keys), 'blocked',false);
  end if;

  -- Orden cuenta -> lease -> lifecycle, igual que claim/reserve/finalize.
  select owner_user_id into v_owner from private.media_maintenance_leases where lease_id = (v->>'leaseId')::uuid;
  perform 1 from private.media_account_state where owner_user_id = v_owner for update;
  select * into v_job from private.media_maintenance_leases where owner_user_id = v_owner for update;
  if v_owner is null or v_job.lease_id is distinct from (v->>'leaseId')::uuid or v_job.lease_until <= clock_timestamp() then
    raise exception 'trabajo_vencido' using errcode = 'PT409';
  end if;
  if v->>'action' = 'retire' then
    v_key := v->>'key';
    if not coalesce(v_key = any(v_job.keys),false) or v->>'bytes' is distinct from '0'
      or not coalesce(length(v->>'etag') between 1 and 200,false) then
      raise exception 'retirada_invalida' using errcode = 'PT409';
    end if;
    perform 1 from private.media_lifecycle where key = v_key and owner_user_id = v_owner and state = 'deleting' for update;
    if not found or not exists(select 1 from public.media_assets where key = v_key and owner_user_id = v_owner) then
      raise exception 'propiedad_invalida' using errcode = 'PT409';
    end if;
    insert into private.media_operation_context values(txid_current(),v_owner);
    update private.media_upload_intents set state = 'retired' where key = v_key and owner_user_id = v_owner;
    update public.media_assets set bytes = 0 where key = v_key and owner_user_id = v_owner;
    insert into private.media_retirements(key,retired_at,etag) values(v_key,to_timestamp((v->>'issuedAt')::double precision),v->>'etag')
      on conflict(key) do update set retired_at = excluded.retired_at,etag = excluded.etag;
    delete from private.media_operation_context where transaction_id = txid_current() and owner_user_id = v_owner;
    return jsonb_build_object('ok',true);
  end if;
  if exists(select 1 from unnest(v_job.keys) k left join public.media_assets a on a.key = k
      left join private.media_retirements r on r.key = k where a.bytes is distinct from 0 or r.key is null) then
    raise exception 'archivos_pendientes' using errcode = 'PT409';
  end if;
  if v_job.purpose = 'closure' then
    v_batch := private.media_closure_batch(v_owner,1);
    if v_batch->>'blocked' = 'false' and v_batch->>'remaining' = '0' then
      perform private.complete_media_closure(v_owner);
    end if;
  end if;
  update private.media_maintenance_leases set lease_until = '-infinity',keys = '{}',
    next_attempt_at = clock_timestamp() + interval '1 minute',
    last_outcome = case when exists(select 1 from private.media_account_state where owner_user_id = v_owner and state = 'closed')
      then 'completed' else 'continued' end where owner_user_id = v_owner;
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.run_media_maintenance(text,text) from public,authenticated;
grant execute on function public.run_media_maintenance(text,text) to anon;

create or replace function public.media_maintenance_overview() returns jsonb
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
    where s.state = 'closing' or (s.state = 'active' and (exists (
      select 1 from private.media_upload_intents i
      where i.owner_user_id = s.owner_user_id and i.state = 'pending' and i.expires_at < v_now
    ) or exists(select 1 from private.pending_media_retirements(s.owner_user_id))))
  )
  select jsonb_build_object(
    'observedAt', v_now,
    'closuresPending', c.pending,
    'oldestClosureAt', c.oldest,
    'uploadsExpired', e.pending,
    'retirementsPending', (select count(*) from private.media_account_state s
      cross join lateral private.pending_media_retirements(s.owner_user_id) p where s.state = 'active'),
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
