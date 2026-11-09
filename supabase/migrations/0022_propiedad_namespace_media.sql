-- La fila de propiedad podía inventarse para una key histórica ajena sin fila.
-- Nuevas subidas tienen un namespace del propietario; no cambia keys existentes.
-- Aplicar junto al nuevo /api/upload-url (clientes antiguos recibirán rechazo).
create policy media_assets_namespace_insert on public.media_assets
as restrictive for insert to authenticated
with check (
  owner_user_id = auth.uid()
  and split_part(key, '/', 1) = folder
  and split_part(key, '/', 2) = auth.uid()::text
  and key ~ '^(images|audio|video)/[0-9a-f-]{36}/[0-9a-f-]{36}\.[a-z0-9]{1,10}$'
  and (profile_id is null or public.get_profile_role(profile_id) in ('owner', 'admin'))
);

-- No puede reasignarse una fila existente para apropiarse de otro objeto.
create or replace function private.media_identidad_inmutable()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.key is distinct from old.key or new.owner_user_id is distinct from old.owner_user_id then
    raise exception 'propiedad_inmutable' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.media_identidad_inmutable() from public, anon, authenticated;
create trigger media_identidad_inmutable before update on public.media_assets
for each row execute function private.media_identidad_inmutable();
notify pgrst, 'reload schema';
