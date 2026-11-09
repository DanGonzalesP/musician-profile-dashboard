-- 0026 ya se aplicó localmente: corrección forward-only.
-- Retirar también la referencia de la PK anterior al renombrar una fila.
-- Normalizar barras inversas y controles que el navegador normaliza en URLs.
create or replace function private.media_keys(p_content jsonb) returns text[]
language plpgsql immutable security invoker set search_path = '' as $$
declare v_value text; v_path text; v_segment text; v_parts text[]; v_key text;
  v_result text[] := '{}'; v_match text[]; v_hex text; v_code integer; v_i integer;
begin
  for v_value in select v #>> '{}' from jsonb_path_query(p_content,
    'strict $.** ? (@.type() == "string")') v loop
    v_value := replace(translate(v_value, chr(9) || chr(10) || chr(13), ''), chr(92), '/');
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
create or replace function private.sync_media_references() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_id text; v_old_id text; v_keys text[] := '{}'; v_old_keys text[]; v_row record;
begin
  v_id := case when TG_OP = 'DELETE' then to_jsonb(old)->>TG_ARGV[0]
    else to_jsonb(new)->>TG_ARGV[0] end;
  v_old_id := case when TG_OP = 'UPDATE' then to_jsonb(old)->>TG_ARGV[0] else v_id end;
  if TG_OP <> 'DELETE' then v_keys := private.media_keys(to_jsonb(new)); end if;
  select coalesce(array_agg(key), '{}') into v_old_keys from private.media_references
    where source_table = TG_TABLE_NAME and source_id in (v_id, v_old_id);
  insert into private.media_lifecycle(key) select unnest(v_keys) order by 1 on conflict do nothing;
  -- Mismo bloqueo que claim_media_deletion. Orden estable entre varias keys.
  for v_row in select key, state from private.media_lifecycle
    where key = any(v_keys || v_old_keys) order by key for update loop
    if v_row.key = any(v_keys) and v_row.state <> 'active' then
      raise exception 'archivo_retirado' using errcode = 'PT409';
    end if;
  end loop;
  delete from private.media_references where source_table = TG_TABLE_NAME and source_id in (v_id, v_old_id);
  insert into private.media_references(key, source_table, source_id)
    select unnest(v_keys), TG_TABLE_NAME, v_id;
  return null;
end;
$$;
notify pgrst, 'reload schema';

