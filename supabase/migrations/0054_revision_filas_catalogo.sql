-- Preparada, no aplicada. Versiones opacas para comparación atómica en gestores.
begin;
alter table public.products add column revision uuid not null default gen_random_uuid();
alter table public.services add column revision uuid not null default gen_random_uuid();

create function private.rotate_catalog_revision() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- Nunca aceptar una revisión elegida por el cliente, ni reutilizar la anterior.
  new.revision := gen_random_uuid();
  return new;
end;
$$;
revoke all on function private.rotate_catalog_revision() from public, anon, authenticated;
create trigger rotate_catalog_revision before insert or update on public.products
  for each row execute function private.rotate_catalog_revision();
create trigger rotate_catalog_revision before insert or update on public.services
  for each row execute function private.rotate_catalog_revision();
notify pgrst, 'reload schema';
commit;
