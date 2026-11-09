-- Control de concurrencia independiente del catálogo/borrador.
begin;
alter table public.profiles add column settings_revision bigint not null default 0;

create function private.profile_settings_revision() returns trigger
language plpgsql set search_path = '' as $$
begin
  if row(new.username, new.display_name, new.unified_profile, new.musician_roles,
         new.musician_category, new.accent_color)
    is distinct from
     row(old.username, old.display_name, old.unified_profile, old.musician_roles,
         old.musician_category, old.accent_color) then
    new.settings_revision := old.settings_revision + 1;
    -- El lector público usa esta versión para invalidar contenido almacenado.
    new.content_version := greatest(old.content_version + 1, new.content_version);
  else
    new.settings_revision := old.settings_revision;
  end if;
  return new;
end;
$$;
revoke all on function private.profile_settings_revision() from public, anon, authenticated;
create trigger profile_settings_revision before update on public.profiles
  for each row execute function private.profile_settings_revision();
grant select(settings_revision) on public.profiles to authenticated;
notify pgrst, 'reload schema';
commit;
