-- Referencias persistentes y exclusión entre publicar/referenciar y borrar.
-- Los tombstones sobreviven al inventario: una key retirada nunca se reutiliza.
-- No resuelve aún el drenaje de PUT firmados ni la supresión de cuentas.
begin;
lock table public.media_assets, public.profiles, public.profile_blocks,
  public.profile_private, public.products, public.services, public.music_feed
  in share row exclusive mode;

create table private.media_lifecycle (
  key text primary key,
  owner_user_id uuid,
  state text not null default 'active' check (state in ('active', 'deleting')),
  deletion_requested_at timestamptz
);
create table private.media_references (
  key text not null references private.media_lifecycle(key),
  source_table text not null,
  source_id text not null,
  primary key (key, source_table, source_id)
);
create index media_references_source on private.media_references(source_table, source_id);
revoke all on private.media_lifecycle, private.media_references from public, anon, authenticated;

-- URLs y keys nuevas usan ASCII. Decodificar escapes de ASCII y normalizar
-- segmentos evita saltarse referencias mediante %61udio, %2F o /./ y /../.
-- No se discrimina por host: un host antiguo/alternativo conserva protección.
-- Coincidencias externas conservadoras pueden impedir borrar, nunca permitirlo.
create function private.media_keys(p_content jsonb) returns text[]
language plpgsql immutable security invoker set search_path = '' as $$
declare v_value text; v_path text; v_segment text; v_parts text[]; v_key text;
  v_result text[] := '{}'; v_match text[]; v_hex text; v_code integer; v_i integer;
begin
  for v_value in select v #>> '{}' from jsonb_path_query(p_content,
    'strict $.** ? (@.type() == "string")') v loop
    if v_value ~ '^(images|audio|video)/' then v_value := '/' || v_value; end if;
    for v_match in select regexp_matches(v_value,
      '(?:https?://[^/[:space:]]+|^)(/[^?#[:space:]"<>]*)', 'gi') loop
      v_path := v_match[1];
      for v_hex in select distinct m[1] from regexp_matches(v_path, '%([0-9A-Fa-f]{2})', 'g') m loop
        v_code := get_byte(decode(v_hex, 'hex'), 0);
        if v_code between 33 and 126 then
          v_path := replace(v_path, '%' || v_hex, chr(v_code));
        end if;
      end loop;
      v_parts := '{}';
      foreach v_segment in array string_to_array(v_path, '/') loop
        if v_segment = '..' then v_parts := v_parts[1:greatest(cardinality(v_parts)-1,0)];
        elsif v_segment not in ('', '.') then v_parts := array_append(v_parts, v_segment);
        end if;
      end loop;
      for v_i in 1..cardinality(v_parts) loop
        if v_parts[v_i] in ('images','audio','video') then
          v_key := array_to_string(v_parts[v_i:cardinality(v_parts)], '/');
          if v_key ~ '^(images|audio|video)/[A-Za-z0-9_./~-]+$' then
            v_result := array_append(v_result, v_key);
          end if;
        end if;
      end loop;
    end loop;
  end loop;
  return array(select distinct k from unnest(v_result) k order by k);
end;
$$;
revoke all on function private.media_keys(jsonb) from public, anon, authenticated;

insert into private.media_lifecycle(key, owner_user_id)
select key, owner_user_id from public.media_assets;

create function private.sync_media_references() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_id text; v_keys text[] := '{}'; v_old_keys text[]; v_row record;
begin
  v_id := case when TG_OP = 'DELETE' then to_jsonb(old)->>TG_ARGV[0]
    else to_jsonb(new)->>TG_ARGV[0] end;
  if TG_OP <> 'DELETE' then v_keys := private.media_keys(to_jsonb(new)); end if;
  select coalesce(array_agg(key), '{}') into v_old_keys from private.media_references
    where source_table = TG_TABLE_NAME and source_id = v_id;
  insert into private.media_lifecycle(key) select unnest(v_keys) order by 1 on conflict do nothing;
  -- Mismo bloqueo que claim_media_deletion. Orden estable entre varias keys.
  for v_row in select key, state from private.media_lifecycle
    where key = any(v_keys || v_old_keys) order by key for update loop
    if v_row.key = any(v_keys) and v_row.state <> 'active' then
      raise exception 'archivo_retirado' using errcode = 'PT409';
    end if;
  end loop;
  delete from private.media_references where source_table = TG_TABLE_NAME and source_id = v_id;
  insert into private.media_references(key, source_table, source_id)
    select unnest(v_keys), TG_TABLE_NAME, v_id;
  return null;
end;
$$;
revoke all on function private.sync_media_references() from public, anon, authenticated;

-- Backfill en la misma transacción que instala los triggers: no hay ventana
-- de escrituras sin inventariar. No modifica contenido ni revisiones de editor.
do $$
declare v_table text; v_pk text;
begin
  foreach v_table in array array['profiles','profile_blocks','profile_private','products','services','music_feed'] loop
    v_pk := case when v_table = 'profile_private' then 'profile_id' else 'id' end;
    execute format('insert into private.media_lifecycle(key) select distinct unnest(private.media_keys(to_jsonb(t))) from public.%I t on conflict do nothing', v_table);
    execute format('insert into private.media_references(key,source_table,source_id) select unnest(private.media_keys(to_jsonb(t))), %L, t.%I::text from public.%I t', v_table, v_pk, v_table);
    execute format('create trigger media_references after insert or update or delete on public.%I for each row execute function private.sync_media_references(%L)', v_table, v_pk);
  end loop;
end;
$$;

create function private.register_media_lifecycle() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_row private.media_lifecycle;
begin
  insert into private.media_lifecycle(key, owner_user_id) values(new.key, new.owner_user_id)
    on conflict do nothing;
  select * into v_row from private.media_lifecycle where key = new.key for update;
  if v_row.state <> 'active' or (v_row.owner_user_id is not null and v_row.owner_user_id <> new.owner_user_id) then
    raise exception 'archivo_retirado' using errcode = 'PT409';
  end if;
  update private.media_lifecycle set owner_user_id = new.owner_user_id where key = new.key;
  return new;
end;
$$;
revoke all on function private.register_media_lifecycle() from public, anon, authenticated;
create trigger media_lifecycle_insert before insert on public.media_assets
for each row execute function private.register_media_lifecycle();

create function public.claim_media_deletion(p_key text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_row private.media_lifecycle;
begin
  if auth.uid() is null then return false; end if;
  select * into v_row from private.media_lifecycle where key = p_key for update;
  if not found or v_row.owner_user_id is distinct from auth.uid() then return false; end if;
  if v_row.state = 'deleting' then return true; end if;
  if exists(select 1 from private.media_references where key = p_key) then return false; end if;
  update private.media_lifecycle set state = 'deleting', deletion_requested_at = clock_timestamp() where key = p_key;
  return true;
end;
$$;
revoke all on function public.claim_media_deletion(text) from public, anon;
grant execute on function public.claim_media_deletion(text) to authenticated;

-- Un cliente antiguo que borra inventario directamente tampoco permite
-- reutilizar la key. El administrador de fixtures puede eliminar auth.users;
-- la supresión operativa de cuentas todavía requiere su protocolo de drenaje.
create function private.retire_media_inventory() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from private.media_lifecycle where key = old.key for update;
  if auth.uid() is not null and exists(select 1 from private.media_references where key = old.key) then
    raise exception 'archivo_en_uso' using errcode = 'PT409';
  end if;
  update private.media_lifecycle set state = 'deleting',
    deletion_requested_at = coalesce(deletion_requested_at, clock_timestamp()) where key = old.key;
  return old;
end;
$$;
revoke all on function private.retire_media_inventory() from public, anon, authenticated;
create trigger media_lifecycle_delete before delete on public.media_assets
for each row execute function private.retire_media_inventory();
notify pgrst, 'reload schema';
commit;
