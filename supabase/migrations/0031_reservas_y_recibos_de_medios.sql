-- Protocolo de reserva/finalización atestiguado por servidor + JWT del dueño.
-- Aditivo: los clientes se trasladan en el siguiente corte; no cerrar la cuota
-- global mientras las escrituras heredadas sigan disponibles.
begin;
create table private.media_runtime_keys (
  key_id text primary key check (key_id ~ '^[a-zA-Z0-9_-]{1,100}$'),
  secret_hex text not null check (secret_hex ~ '^[0-9a-fA-F]{64}$')
);
-- No se incluye ninguna clave en migraciones. Sin provisión, los RPC fallan cerrados.
create table private.media_account_state (
  owner_user_id uuid primary key,
  state text not null default 'active' check (state in ('active','closing','closed')),
  closure_requested_at timestamptz
);
create table private.media_upload_intents (
  key text primary key references private.media_lifecycle(key),
  owner_user_id uuid not null,
  bytes bigint not null check (bytes > 0),
  content_type text not null,
  profile_id uuid,
  state text not null default 'pending' check (state in ('pending','ready','retired')),
  expires_at timestamptz not null,
  etag text
);
create index media_upload_intents_owner on private.media_upload_intents(owner_user_id, state);
revoke all on private.media_runtime_keys, private.media_account_state,
  private.media_upload_intents from public, anon, authenticated;

create function private.verify_media_receipt(p_payload text, p_signature text, p_action text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_key text; v_expected bytea; v_given bytea; v_diff integer := 0; v_json jsonb;
begin
  if auth.uid() is null or p_payload is null or octet_length(p_payload) > 4096
    or p_signature is null or p_signature !~ '^[0-9a-fA-F]{64}$' then
    raise exception 'recibo_invalido' using errcode = '42501';
  end if;
  v_json := p_payload::jsonb;
  select secret_hex into v_key from private.media_runtime_keys where key_id = v_json->>'keyId';
  if v_key is null then raise exception 'medios_no_configurados' using errcode = 'PT503'; end if;
  v_expected := extensions.hmac(convert_to(p_payload,'UTF8'), decode(v_key,'hex'), 'sha256');
  v_given := decode(p_signature,'hex');
  -- Comparar los 32 bytes sin salida anticipada por prefijo diferente.
  for v_i in 0..31 loop
    v_diff := v_diff | (get_byte(v_expected,v_i) # get_byte(v_given,v_i));
  end loop;
  if v_diff <> 0 then raise exception 'recibo_invalido' using errcode = '42501'; end if;
  if v_json->>'version' is distinct from '1'
    or v_json->>'action' is distinct from p_action
    or v_json->>'actor' is distinct from auth.uid()::text
    or not coalesce((v_json->>'issuedAt') ~ '^\d{1,12}$', false)
    or abs(extract(epoch from clock_timestamp()) - (v_json->>'issuedAt')::numeric) > 60 then
    raise exception 'recibo_invalido' using errcode = '42501';
  end if;
  return v_json;
end;
$$;
revoke all on function private.verify_media_receipt(text,text,text) from public, anon, authenticated;

create function private.lock_media_account() returns text
language plpgsql security definer set search_path = '' as $$
declare v_state text; v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists(select 1 from auth.users where id = v_uid) then
    raise exception 'sesion_invalida' using errcode = '42501';
  end if;
  insert into private.media_account_state(owner_user_id) values(v_uid) on conflict do nothing;
  select state into v_state from private.media_account_state where owner_user_id = v_uid for update;
  return v_state;
end;
$$;
revoke all on function private.lock_media_account() from public, anon, authenticated;

create function public.reserve_media_upload(p_payload text, p_signature text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v jsonb; v_key text; v_folder text; v_bytes bigint; v_limit bigint;
  v_profile uuid; v_used numeric; v_unknown boolean; v_existing private.media_upload_intents;
  v_expiry timestamptz;
begin
  v := private.verify_media_receipt(p_payload,p_signature,'reserve');
  if private.lock_media_account() <> 'active' then
    raise exception 'cuenta_en_eliminacion' using errcode = 'PT409';
  end if;
  v_key := v->>'key'; v_bytes := (v->>'bytes')::bigint;
  v_limit := (v->>'limitBytes')::bigint; v_profile := (v->>'profileId')::uuid;
  v_folder := split_part(v_key,'/',1);
  if v_key is null or v_key !~ '^(images|audio|video)/[0-9a-f-]{36}/[0-9a-f-]{36}\.[a-z0-9]{1,10}$'
    or split_part(v_key,'/',2) <> auth.uid()::text
    or v_bytes is null or v_bytes <= 0 or not coalesce(v->>'bytes' ~ '^[1-9][0-9]*$',false)
    or v_bytes > (case v_folder when 'images' then 5242880 when 'audio' then 104857600 else 209715200 end)
    or v_limit is null or v_limit <= 0 or v_limit > 9007199254740991
    or not coalesce(v->>'limitBytes' ~ '^[1-9][0-9]*$',false)
    or not coalesce(v->>'quotaMode' in ('observar','rechazar'),false)
    or not coalesce(v->>'contentType' ~ '^(image|audio|video)/[a-zA-Z0-9.+-]{1,80}$',false)
    or (v_profile is not null and coalesce(public.get_profile_role(v_profile),'') not in ('owner','admin')) then
    raise exception 'reserva_invalida' using errcode = '22023';
  end if;
  select * into v_existing from private.media_upload_intents where key = v_key;
  if found then
    if v_existing.owner_user_id <> auth.uid() or v_existing.bytes <> v_bytes
      or v_existing.content_type is distinct from v->>'contentType'
      or v_existing.profile_id is distinct from v_profile or v_existing.state = 'retired' then
      raise exception 'reserva_incompatible' using errcode = 'PT409';
    end if;
    return jsonb_build_object('key',v_key,'expiresAt',v_existing.expires_at,'state',v_existing.state);
  end if;
  if exists(select 1 from private.media_lifecycle where key = v_key) then
    raise exception 'key_preexistente' using errcode = 'PT409';
  end if;
  -- La reserva y la suma comparten el bloqueo por cuenta. Ningún reintento
  -- ni borrado directo del inventario libera una intención aún no retirada.
  select coalesce(sum(bytes),0) into v_used from private.media_upload_intents
    where owner_user_id = auth.uid() and state <> 'retired';
  select v_used + coalesce(sum(a.bytes),0), coalesce(bool_or(a.bytes is null),false)
    into v_used, v_unknown from public.media_assets a
    where a.owner_user_id = auth.uid()
    and not exists(select 1 from private.media_upload_intents i where i.key = a.key);
  if v->>'quotaMode' = 'rechazar' and (v_unknown or v_used + v_bytes > v_limit) then
    raise exception 'cuota_insuficiente' using errcode = 'PT413';
  end if;
  v_expiry := clock_timestamp() + interval '300 seconds';
  -- Adquirir una key realmente nueva de forma atómica: la publicación puede
  -- haberla registrado entre la lectura anterior y este INSERT.
  insert into private.media_lifecycle(key,owner_user_id) values(v_key,auth.uid()) on conflict do nothing;
  if not found then raise exception 'key_preexistente' using errcode = 'PT409'; end if;
  insert into public.media_assets(key,owner_user_id,profile_id,folder,content_type,bytes)
    values(v_key,auth.uid(),v_profile,v_folder,v->>'contentType',v_bytes);
  insert into private.media_upload_intents(key,owner_user_id,bytes,content_type,profile_id,expires_at)
    values(v_key,auth.uid(),v_bytes,v->>'contentType',v_profile,v_expiry);
  return jsonb_build_object('key',v_key,'expiresAt',v_expiry,'state','pending',
    'usedBytes',v_used,'exceeded',v_unknown or v_used + v_bytes > v_limit);
end;
$$;
revoke all on function public.reserve_media_upload(text,text) from public, anon;
grant execute on function public.reserve_media_upload(text,text) to authenticated;

create function public.finalize_media_upload(p_payload text, p_signature text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v jsonb; v_row private.media_upload_intents; v_state text;
begin
  v := private.verify_media_receipt(p_payload,p_signature,'finalize');
  if private.lock_media_account() <> 'active' then
    raise exception 'cuenta_en_eliminacion' using errcode = 'PT409';
  end if;
  select state into v_state from private.media_lifecycle where key = v->>'key' for update;
  select * into v_row from private.media_upload_intents where key = v->>'key';
  if not found or v_row.owner_user_id <> auth.uid() or v_state <> 'active'
    or v_row.state = 'retired' or v_row.bytes is distinct from (v->>'bytes')::bigint
    or v_row.content_type is distinct from v->>'contentType'
    or not coalesce(length(v->>'etag') between 1 and 200,false) then
    raise exception 'finalizacion_invalida' using errcode = 'PT409';
  end if;
  if v_row.state = 'ready' and v_row.etag is distinct from v->>'etag' then
    raise exception 'objeto_modificado' using errcode = 'PT409';
  end if;
  update private.media_upload_intents set state = 'ready', etag = v->>'etag' where key = v_row.key;
  return true;
end;
$$;
revoke all on function public.finalize_media_upload(text,text) from public, anon;
grant execute on function public.finalize_media_upload(text,text) to authenticated;

create function public.retire_media_upload(p_payload text, p_signature text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v jsonb; v_row private.media_upload_intents; v_state text;
begin
  v := private.verify_media_receipt(p_payload,p_signature,'retire');
  perform private.lock_media_account();
  select state into v_state from private.media_lifecycle where key = v->>'key' for update;
  select * into v_row from private.media_upload_intents where key = v->>'key';
  if not found or v_row.owner_user_id <> auth.uid() or v_state <> 'deleting'
    or v->>'bytes' is distinct from '0' or not coalesce(length(v->>'etag') between 1 and 200,false) then
    raise exception 'retirada_invalida' using errcode = 'PT409';
  end if;
  -- Solo después de que el servidor atestigüe el tombstone de R2 (cero bytes).
  update private.media_upload_intents set state = 'retired' where key = v_row.key;
  delete from public.media_assets where key = v_row.key and owner_user_id = auth.uid();
  return true;
end;
$$;
revoke all on function public.retire_media_upload(text,text) from public, anon;
grant execute on function public.retire_media_upload(text,text) to authenticated;

create function public.begin_media_account_closure() returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform private.lock_media_account();
  update private.media_account_state set state = 'closing',
    closure_requested_at = coalesce(closure_requested_at,clock_timestamp())
    where owner_user_id = auth.uid() and state <> 'closed';
  return true;
end;
$$;
revoke all on function public.begin_media_account_closure() from public, anon;
grant execute on function public.begin_media_account_closure() to authenticated;

-- Las reservas no pueden publicarse antes de un HEAD verificado por servidor.
-- Las referencias antiguas siguen bajo el protocolo de 0026 hasta su migración.
create function private.assert_finalized_media() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_key text; v_keys text[];
begin
  v_keys := private.media_keys(to_jsonb(new));
  for v_key in select key from private.media_lifecycle where key = any(v_keys) order by key for update loop
    if exists(select 1 from private.media_upload_intents where key = v_key and state <> 'ready') then
      raise exception 'archivo_no_finalizado' using errcode = 'PT409';
    end if;
  end loop;
  return null;
end;
$$;
revoke all on function private.assert_finalized_media() from public, anon, authenticated;
do $$
declare v_table text;
begin
  foreach v_table in array array['profiles','profile_blocks','profile_private','products','services','music_feed'] loop
    -- AFTER y nombre posterior a media_references: ese trigger ya creó/bloqueó
    -- las keys inexistentes, incluida una reserva concurrente aún sin commit.
    execute format('create trigger media_require_finalization after insert or update on public.%I for each row execute function private.assert_finalized_media()',v_table);
  end loop;
end;
$$;
notify pgrst, 'reload schema';
commit;
