-- Correcciones del linter de funciones privadas: tipos explícitos y volatilidad.
create or replace function private.media_keys(p_content jsonb) returns text[]
language plpgsql stable security invoker set search_path = '' as $$
declare v_value text; v_path text; v_segment text; v_parts text[]; v_key text;
  v_result text[] := array[]::text[]; v_match text[]; v_hex text; v_code integer;
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
      v_parts := array[]::text[];
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

