-- Expandir sin romper clientes anteriores: conservar el RPC de 0012.
-- La identidad y el resumen se leen en la misma sentencia/snapshot y con RLS.
begin;

create function public.descubrimiento_perfiles_con_identidad(
  p_tipo text,
  p_limite integer default 60
)
returns table (
  profile_id uuid,
  username text,
  display_name text,
  profile_type text,
  musician_roles jsonb,
  categorias text[],
  total bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select pr.id, d.username, d.display_name, d.profile_type,
    d.musician_roles, d.categorias, d.total
  from public.descubrimiento_perfiles(p_tipo, p_limite) d
  join public.profiles pr on pr.username = d.username
  where not coalesce(pr.is_suspended, false)
  order by d.total desc, d.username asc;
$$;

revoke all on function public.descubrimiento_perfiles_con_identidad(text, integer) from public;
grant execute on function public.descubrimiento_perfiles_con_identidad(text, integer) to anon, authenticated;
comment on function public.descubrimiento_perfiles_con_identidad(text, integer) is
  'Resumen público con identidad estable en una lectura. Conserva límites, filtros y RLS del descubrimiento original; no concede acceso adicional.';

commit;
