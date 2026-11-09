-- Cierre por etapas: congelar, atestiguar marcadores y sólo entonces suprimir.
-- No habilita limpieza de históricos sin evidencia operativa de drenaje.
begin;

alter table private.media_account_state add column closure_finished_at timestamptz;
create table private.media_operation_context (
  transaction_id bigint not null,
  owner_user_id uuid not null,
  primary key (transaction_id, owner_user_id)
);
create table private.media_retirements (
  key text primary key references private.media_lifecycle(key),
  retired_at timestamptz not null,
  etag text not null
);
create table private.media_storage_safety (
  singleton boolean primary key default true check (singleton),
  legacy_puts_drained_at timestamptz,
  evidence_ref text,
  check (legacy_puts_drained_at is null or coalesce(length(trim(evidence_ref)) > 0,false))
);
insert into private.media_storage_safety(singleton) values(true);
revoke all on private.media_operation_context, private.media_retirements,
  private.media_storage_safety from public, anon, authenticated;

-- La identidad mínima del inventario sobrevive al borrado de auth.users.
-- No se borra un marcador dejando un objeto sin fila de propiedad.
insert into private.media_account_state(owner_user_id)
  select id from auth.users on conflict do nothing;
create function private.register_media_account() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into private.media_account_state(owner_user_id) values(new.id) on conflict do nothing;
  return new;
end;
$$;
revoke all on function private.register_media_account() from public, anon, authenticated;
create trigger media_account_register after insert on auth.users
  for each row execute function private.register_media_account();
alter table public.media_assets drop constraint media_assets_owner_user_id_fkey;
alter table public.media_assets add constraint media_assets_durable_owner_fkey
  foreign key(owner_user_id) references private.media_account_state(owner_user_id);

create function private.media_internal_operation(p_owner uuid) returns boolean
language sql security definer set search_path = '' as $$
  select exists(select 1 from private.media_operation_context
    where transaction_id = txid_current() and owner_user_id = p_owner);
$$;
revoke all on function private.media_internal_operation(uuid) from public, anon, authenticated;

create function private.assert_account_writable(p_owner uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_state text;
begin
  if p_owner is null or private.media_internal_operation(p_owner) then return; end if;
  insert into private.media_account_state(owner_user_id)
    select id from auth.users where id = p_owner on conflict do nothing;
  select state into v_state from private.media_account_state
    where owner_user_id = p_owner for update;
  if v_state is distinct from 'active' then
    raise exception 'cuenta_en_eliminacion' using errcode = 'PT409';
  end if;
end;
$$;
revoke all on function private.assert_account_writable(uuid) from public, anon, authenticated;

create function private.guard_account_writes() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_doc jsonb; v_docs jsonb[] := '{}'; v_name text; v_value text;
  v_owners uuid[] := array[auth.uid()]; v_profiles uuid[] := '{}'; v_owner uuid;
begin
  -- Sólo mantenimiento administrativo/fixtures, nunca una identidad de la app.
  if (auth.uid() is null and coalesce(auth.role(),'') <> 'anon')
    or private.media_internal_operation(auth.uid()) then
    if TG_OP = 'DELETE' then return old; else return new; end if;
  end if;
  if TG_OP <> 'INSERT' then v_docs := array_append(v_docs,to_jsonb(old)); end if;
  if TG_OP <> 'DELETE' then v_docs := array_append(v_docs,to_jsonb(new)); end if;
  foreach v_doc in array v_docs loop
    foreach v_name in array array['user_id','owner_user_id','member_user_id',
      'asker_user_id','reporter_user_id','blocker_user_id'] loop
      v_value := v_doc->>v_name;
      if v_value is not null then v_owners := array_append(v_owners,v_value::uuid); end if;
    end loop;
    foreach v_name in array array['profile_id','band_profile_id','seller_id',
      'owner_profile_id','requester_profile_id','reported_profile_id','blocked_profile_id'] loop
      v_value := v_doc->>v_name;
      if v_value is not null then v_profiles := array_append(v_profiles,v_value::uuid); end if;
    end loop;
    if TG_TABLE_NAME = 'profiles' then
      v_profiles := array_append(v_profiles,(v_doc->>'id')::uuid);
    elsif TG_TABLE_NAME = 'feed_comments' then
      v_profiles := v_profiles || array(select profile_id from public.music_feed where id = (v_doc->>'track_id')::uuid);
    elsif TG_TABLE_NAME = 'feed_post_comments' then
      -- El identificador público es <id del bloque bigint>:<id del item>.
      v_value := split_part(v_doc->>'post_id',':',1);
      if v_value ~ '^[0-9]{1,18}$' then
        v_profiles := v_profiles || array(select profile_id from public.profile_blocks where id = v_value::bigint);
      end if;
    end if;
  end loop;
  select v_owners || coalesce(array_agg(owner_id),'{}') into v_owners from (
    select user_id owner_id from public.profiles where id = any(v_profiles)
    union select owner_user_id from public.profiles where id = any(v_profiles)
  ) owners;
  -- El mismo bloqueo que reserva/cierre, también para colaboradores y receptores.
  for v_owner in select distinct id from unnest(v_owners) id where id is not null order by id loop
    perform private.assert_account_writable(v_owner);
  end loop;
  if TG_OP = 'DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function private.guard_account_writes() from public, anon, authenticated;
do $$
declare v_table text;
begin
  foreach v_table in array array['profiles','profile_blocks','profile_private',
    'products','services','music_feed','media_assets','band_members','feed_comments',
    'feed_post_comments','profile_questions','credit_requests','author_certificates',
    'licenses','user_blocks','content_reports','username_history','artist','merch','donations'] loop
    execute format('create trigger account_writes_guard before insert or update or delete on public.%I
      for each row execute function private.guard_account_writes()',v_table);
  end loop;
end;
$$;

create or replace function public.begin_media_account_closure() returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform private.lock_media_account();
  insert into private.media_operation_context values(txid_current(),auth.uid());
  update private.media_account_state set state = 'closing',
    closure_requested_at = coalesce(closure_requested_at,clock_timestamp())
    where owner_user_id = auth.uid() and state <> 'closed';
  -- Ocultar el perfil usa la suspensión ya comprobada por render y caché.
  update public.profiles set is_suspended = true
    where (user_id = auth.uid() or owner_user_id = auth.uid()) and not is_suspended;
  -- La retirada de cuenta revoca también sus archivos usados en otro perfil.
  -- No modifica ni borra contenido de esos otros perfiles.
  perform 1 from private.media_lifecycle where owner_user_id = auth.uid() order by key for update;
  update private.media_lifecycle set state = 'deleting',
    deletion_requested_at = coalesce(deletion_requested_at,clock_timestamp())
    where owner_user_id = auth.uid();
  delete from private.media_operation_context where transaction_id = txid_current() and owner_user_id = auth.uid();
  return true;
end;
$$;

-- Una excepción sólo existe dentro de un RPC privado en esta transacción.
-- No usar GUC/configuración de sesión que pueda falsificar un cliente.
create or replace function private.guard_reserved_media_inventory() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_row private.media_upload_intents;
begin
  if auth.uid() is null or private.media_internal_operation(auth.uid()) then
    if TG_OP = 'DELETE' then return old; else return new; end if;
  end if;
  select * into v_row from private.media_upload_intents where key = old.key;
  if not found then
    if TG_OP = 'DELETE' then return old; else return new; end if;
  end if;
  if TG_OP = 'DELETE' then raise exception 'inventario_reservado' using errcode = '42501'; end if;
  if new.profile_id is distinct from old.profile_id or new.folder is distinct from old.folder
    or new.content_type is distinct from old.content_type or new.created_at is distinct from old.created_at
    or (new.bytes is distinct from old.bytes and not coalesce(v_row.state = 'retired' and new.bytes = 0,false)) then
    raise exception 'inventario_reservado' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.retire_media_upload(p_payload text, p_signature text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v jsonb; v_owner uuid; v_state text;
begin
  v := private.verify_media_receipt(p_payload,p_signature,'retire');
  perform private.lock_media_account();
  select state, owner_user_id into v_state,v_owner from private.media_lifecycle
    where key = v->>'key' for update;
  if v_state is distinct from 'deleting' or v_owner is distinct from auth.uid()
    or v->>'bytes' is distinct from '0' or not coalesce(length(v->>'etag') between 1 and 200,false)
    or not exists(select 1 from public.media_assets where key = v->>'key' and owner_user_id = auth.uid()) then
    raise exception 'retirada_invalida' using errcode = 'PT409';
  end if;
  insert into private.media_operation_context values(txid_current(),auth.uid());
  update private.media_upload_intents set state = 'retired' where key = v->>'key' and owner_user_id = auth.uid();
  update public.media_assets set bytes = 0 where key = v->>'key' and owner_user_id = auth.uid();
  -- La hora atestiguada evita rejuvenecer un recibo anterior al drenaje por replay.
  insert into private.media_retirements(key,retired_at,etag) values(v->>'key',to_timestamp((v->>'issuedAt')::double precision),v->>'etag')
    on conflict(key) do update set retired_at = excluded.retired_at, etag = excluded.etag;
  delete from private.media_operation_context where transaction_id = txid_current() and owner_user_id = auth.uid();
  return true;
end;
$$;

create function public.get_media_account_closure_batch(p_limit integer default 25) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_cutoff timestamptz; v_blocked boolean; v_keys text[]; v_remaining integer; v_total integer;
begin
  if private.lock_media_account() <> 'closing' then
    raise exception 'cierre_no_iniciado' using errcode = 'PT409';
  end if;
  select legacy_puts_drained_at into v_cutoff from private.media_storage_safety where singleton;
  select exists(select 1 from private.media_lifecycle l where l.owner_user_id = auth.uid()
      and not exists(select 1 from public.media_assets a where a.key = l.key and a.owner_user_id = auth.uid()))
    or exists(select 1 from public.media_assets a where a.owner_user_id = auth.uid()
      and (a.key !~ '^(images|audio|video)/[A-Za-z0-9_.~-]+(/[A-Za-z0-9_.~-]+)*$'
        or a.key ~ '(^|/)\.{1,2}(/|$)'
        or (not exists(select 1 from private.media_upload_intents i where i.key = a.key)
          and (v_cutoff is null or v_cutoff > clock_timestamp())))) into v_blocked;
  select count(*) into v_total from public.media_assets where owner_user_id = auth.uid();
  select count(*) into v_remaining from public.media_assets a
    left join private.media_retirements r on r.key = a.key
    where a.owner_user_id = auth.uid() and (a.bytes is distinct from 0 or r.key is null
      or (not exists(select 1 from private.media_upload_intents i where i.key = a.key)
        and (v_cutoff is null or r.retired_at < v_cutoff)));
  select coalesce(array_agg(key),'{}') into v_keys from (
    select a.key from public.media_assets a left join private.media_retirements r on r.key = a.key
    where a.owner_user_id = auth.uid() and not v_blocked and (a.bytes is distinct from 0 or r.key is null
      or (not exists(select 1 from private.media_upload_intents i where i.key = a.key)
        and (v_cutoff is null or r.retired_at < v_cutoff)))
    order by a.key limit greatest(1,least(coalesce(p_limit,25),25))
  ) batch;
  return jsonb_build_object('keys',v_keys,'remaining',v_remaining,'total',v_total,'blocked',v_blocked);
end;
$$;
revoke all on function public.get_media_account_closure_batch(integer) from public, anon;
grant execute on function public.get_media_account_closure_batch(integer) to authenticated;

create or replace function private.eliminar_mi_cuenta_impl() returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_batch jsonb; v_profiles uuid[];
begin
  -- Incluso la RPC antigua exige el protocolo completo. El cliente no puede
  -- sustituir una prueba de almacenamiento por declarar bytes=0.
  v_batch := public.get_media_account_closure_batch(1);
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

create function public.media_account_exists() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists(select 1 from auth.users where id = auth.uid());
$$;
revoke all on function public.media_account_exists() from public, anon;
grant execute on function public.media_account_exists() to authenticated;
create policy media_inventory_live_account on public.media_assets as restrictive for select to authenticated
  using (public.media_account_exists());

-- Preservar el contador existente; el cierre usa una ventana propia en Postgres.
create or replace function private.consume_authenticated_rate_limit(p_bucket text)
returns table (is_allowed boolean, retry_after integer)
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_limit integer; v_window_seconds integer := 3600;
  now_at timestamptz := pg_catalog.now(); v_started_at timestamptz; v_count integer;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  case p_bucket
    when 'upload' then v_limit := 120;
    when 'upload-finalize' then v_limit := 360;
    when 'account-closure' then v_limit := 120;
    when 'image-generation' then v_limit := 10;
    else raise exception 'unknown rate limit bucket';
  end case;
  insert into public.rate_limit_windows as w(bucket,user_id,started_at,request_count)
    values(p_bucket,v_uid,now_at,1) on conflict(bucket,user_id) do update
    set started_at = case when w.started_at <= now_at - make_interval(secs => v_window_seconds) then now_at else w.started_at end,
    request_count = case when w.started_at <= now_at - make_interval(secs => v_window_seconds) then 1 else w.request_count + 1 end
    returning w.started_at,w.request_count into v_started_at,v_count;
  if v_count <= v_limit then return query select true,0;
  else return query select false,greatest(1,ceil(extract(epoch from
    (v_started_at + make_interval(secs => v_window_seconds) - now_at)))::integer); end if;
end;
$$;
notify pgrst,'reload schema';
commit;
