-- Ejecutor acotado: sólo cierres solicitados con JWT y reservas vencidas.
-- Clave exclusiva, leases y antirreplay; no suplanta auth.uid() ni usa service role.
begin;
create function private.media_closure_batch(p_owner uuid, p_limit integer default 25) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_cutoff timestamptz; v_blocked boolean; v_keys text[]; v_remaining integer; v_total integer;
begin
  perform 1 from private.media_account_state where owner_user_id = p_owner for update;
  if not exists(select 1 from private.media_account_state where owner_user_id = p_owner and state = 'closing') then
    raise exception 'cierre_no_iniciado' using errcode = 'PT409';
  end if;
  select legacy_puts_drained_at into v_cutoff from private.media_storage_safety where singleton;
  select exists(select 1 from private.media_lifecycle l where l.owner_user_id = p_owner
      and not exists(select 1 from public.media_assets a where a.key = l.key and a.owner_user_id = p_owner))
    or exists(select 1 from public.media_assets a where a.owner_user_id = p_owner
      and (a.key !~ '^(images|audio|video)/[A-Za-z0-9_.~-]+(/[A-Za-z0-9_.~-]+)*$'
        or a.key ~ '(^|/)\.{1,2}(/|$)'
        or split_part(a.key,'/',2) <> p_owner::text
        or not exists(select 1 from private.media_lifecycle l where l.key = a.key and l.owner_user_id = p_owner)
        or (not exists(select 1 from private.media_upload_intents i where i.key = a.key)
          and (v_cutoff is null or v_cutoff > clock_timestamp())))) into v_blocked;
  select count(*) into v_total from public.media_assets where owner_user_id = p_owner;
  select count(*) into v_remaining from public.media_assets a
    left join private.media_retirements r on r.key = a.key
    where a.owner_user_id = p_owner and (a.bytes is distinct from 0 or r.key is null
      or (not exists(select 1 from private.media_upload_intents i where i.key = a.key)
        and (v_cutoff is null or r.retired_at < v_cutoff)));
  select coalesce(array_agg(key),'{}') into v_keys from (
    select a.key from public.media_assets a left join private.media_retirements r on r.key = a.key
    where a.owner_user_id = p_owner and not v_blocked and (a.bytes is distinct from 0 or r.key is null
      or (not exists(select 1 from private.media_upload_intents i where i.key = a.key)
        and (v_cutoff is null or r.retired_at < v_cutoff)))
    order by a.key limit greatest(1,least(coalesce(p_limit,25),25))
  ) batch;
  return jsonb_build_object('keys',v_keys,'remaining',v_remaining,'total',v_total,'blocked',v_blocked);
end;
$$;
revoke all on function private.media_closure_batch(uuid,integer) from public,anon,authenticated;

create function private.complete_media_closure(p_owner uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := p_owner; v_batch jsonb; v_profiles uuid[];
begin
  -- Incluso la RPC antigua exige el protocolo completo. El cliente no puede
  -- sustituir una prueba de almacenamiento por declarar bytes=0.
  v_batch := private.media_closure_batch(v_uid,1);
  if v_batch->>'blocked' is distinct from 'false' or v_batch->>'remaining' is distinct from '0' then
    raise exception 'archivos_pendientes' using errcode = 'PT409';
  end if;
  insert into private.media_operation_context values(txid_current(),v_uid);
  select coalesce(array_agg(id),'{}') into v_profiles from public.profiles
    where user_id = v_uid or owner_user_id = v_uid;
  -- Estas dos relaciones históricas no tienen ON DELETE CASCADE.
  delete from public.products where seller_id = any(v_profiles);
  delete from public.services where profile_id = any(v_profiles);
  delete from public.feed_post_comments c where exists(select 1 from public.profile_blocks b
    where b.profile_id = any(v_profiles) and split_part(c.post_id,':',1) = b.id::text);
  delete from public.profiles where id = any(v_profiles);
  insert into public.audit_log(actor_user_id,action,target_table,target_id,metadata)
    values(v_uid,'cuenta_eliminada','auth.users',v_uid::text,'{}');
  update private.media_account_state set state = 'closed',closure_finished_at = clock_timestamp()
    where owner_user_id = v_uid;
  delete from auth.users where id = v_uid;
  delete from private.media_operation_context where transaction_id = txid_current() and owner_user_id = v_uid;
end;
$$;
revoke all on function private.complete_media_closure(uuid) from public,anon,authenticated;

create or replace function public.get_media_account_closure_batch(p_limit integer default 25) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.lock_media_account();
  return private.media_closure_batch(auth.uid(),p_limit);
end;
$$;
create or replace function private.eliminar_mi_cuenta_impl() returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.lock_media_account();
  perform private.complete_media_closure(auth.uid());
end;
$$;

-- Sólo código privado autorizado establece el contexto. El ejecutor puede
-- terminar la misma cascada que el dueño ya autorizó, sin fabricar un JWT.
create or replace function private.media_internal_operation(p_owner uuid) returns boolean
language sql security definer set search_path = '' as $$
  select exists(select 1 from private.media_operation_context
    where transaction_id = txid_current() and (p_owner is null or owner_user_id = p_owner));
$$;

create table private.media_maintenance_keys (
  key_id text primary key check (key_id ~ '^[a-zA-Z0-9_-]{1,100}$'),
  secret_hex text not null check (secret_hex ~ '^[0-9a-fA-F]{64}$')
);
create table private.media_maintenance_nonces (
  key_id text not null, nonce uuid not null, received_at timestamptz not null default clock_timestamp(),
  primary key(key_id,nonce)
);
create table private.media_maintenance_leases (
  owner_user_id uuid primary key references private.media_account_state(owner_user_id),
  lease_id uuid not null unique default gen_random_uuid(),
  lease_until timestamptz not null default '-infinity',
  next_attempt_at timestamptz not null default '-infinity',
  purpose text not null check (purpose in ('closure','expired')),
  keys text[] not null default '{}',
  last_outcome text not null default 'pending' check (last_outcome in ('pending','leased','blocked','continued','completed'))
);
create index media_maintenance_nonce_time on private.media_maintenance_nonces(received_at);
create index media_pending_expiry on private.media_upload_intents(expires_at,owner_user_id) where state = 'pending';
revoke all on private.media_maintenance_keys,private.media_maintenance_nonces,private.media_maintenance_leases from public,anon,authenticated;

create function private.verify_media_maintenance(p_payload text,p_signature text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v jsonb; v_secret text; v_expected bytea; v_given bytea; v_diff integer := 0;
begin
  if p_payload is null or octet_length(p_payload) > 4096 or p_signature is null
    or p_signature !~ '^[0-9a-fA-F]{64}$' then
    raise exception 'mantenimiento_no_autorizado' using errcode = '42501';
  end if;
  v := p_payload::jsonb;
  select secret_hex into v_secret from private.media_maintenance_keys where key_id = v->>'keyId';
  if v_secret is null then raise exception 'mantenimiento_no_autorizado' using errcode = '42501'; end if;
  v_expected := extensions.hmac(convert_to(p_payload,'UTF8'),decode(v_secret,'hex'),'sha256');
  v_given := decode(p_signature,'hex');
  for n in 0..31 loop v_diff := v_diff | (get_byte(v_expected,n) # get_byte(v_given,n)); end loop;
  if v_diff <> 0 or v->>'version' is distinct from '1'
    or not coalesce(v->>'action' in ('claim','retire','finish'),false)
    or not coalesce(v->>'nonce' ~ '^[0-9a-f-]{36}$',false)
    or not coalesce(v->>'issuedAt' ~ '^\d{1,12}$',false)
    or abs(extract(epoch from clock_timestamp()) - (v->>'issuedAt')::numeric) > 60 then
    raise exception 'mantenimiento_no_autorizado' using errcode = '42501';
  end if;
  delete from private.media_maintenance_nonces where received_at < clock_timestamp() - interval '2 minutes';
  insert into private.media_maintenance_nonces(key_id,nonce) values(v->>'keyId',(v->>'nonce')::uuid) on conflict do nothing;
  if not found then raise exception 'mantenimiento_repetido' using errcode = '42501'; end if;
  return v;
end;
$$;
revoke all on function private.verify_media_maintenance(text,text) from public,anon,authenticated;

-- La selección la hace la base: nunca acepta un propietario solicitado por el
-- ejecutor. Sólo se permite continuar un cierre ya autorizado o una reserva
-- pendiente vencida. El lease persiste aunque muera el proceso o se cierre la web.
create function public.run_media_maintenance(p_payload text,p_signature text) returns jsonb
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
      and (s.state = 'closing' or (s.state = 'active' and exists(
        select 1 from private.media_upload_intents i where i.owner_user_id = s.owner_user_id
          and i.state = 'pending' and i.expires_at < clock_timestamp())))
    order by coalesce(j.next_attempt_at,'-infinity'),s.owner_user_id
    limit 1 for update of s skip locked;
    if v_owner is null then return jsonb_build_object('job',null,'blocked',false); end if;
    v_purpose := case when v_state = 'closing' then 'closure' else 'expired' end;
    if v_purpose = 'closure' then
      v_batch := private.media_closure_batch(v_owner,20);
      select array(select jsonb_array_elements_text(v_batch->'keys')) into v_keys;
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
notify pgrst,'reload schema';
commit;
