begin;

-- RPC nuevo: los clientes previos conservan sus contratos. El cursor corresponde
-- al último resumen recibido, antes de ocultar bloqueos locales del visitante.
create function public.descubrimiento_perfiles_pagina(
  p_tipo text,
  p_limite integer default 60,
  p_despues_total bigint default null,
  p_despues_username text default null
)
returns table (
  profile_id uuid, username text, display_name text, profile_type text,
  musician_roles jsonb, categorias text[], total bigint
)
language sql stable security invoker set search_path = public
as $$
  with items as (
    select p.seller_id as profile_id, p.category
    from public.products p
    where p_tipo = 'productos' and coalesce(p.is_active, true)
    union all
    select s.profile_id, s.category
    from public.services s
    where p_tipo = 'servicios' and coalesce(s.is_active, true)
  ), resumen as (
    select i.profile_id, array_remove(array_agg(distinct i.category), null) as categorias,
      count(*) as total
    from items i group by i.profile_id
  )
  select pr.id, pr.username, pr.display_name, pr.profile_type,
    to_jsonb(pr.musician_roles), r.categorias, r.total
  from resumen r join public.profiles pr on pr.id = r.profile_id
  where not coalesce(pr.is_suspended, false) and pr.username is not null
    and (
      (p_despues_total is null and p_despues_username is null)
      or (p_despues_total > 0 and p_despues_username is not null and
        (r.total < p_despues_total or
          (r.total = p_despues_total and pr.username > p_despues_username)))
    )
  order by r.total desc, pr.username asc
  limit least(greatest(coalesce(p_limite, 60), 1), 100);
$$;

revoke all on function public.descubrimiento_perfiles_pagina(text, integer, bigint, text) from public;
grant execute on function public.descubrimiento_perfiles_pagina(text, integer, bigint, text) to anon, authenticated;
comment on function public.descubrimiento_perfiles_pagina(text, integer, bigint, text) is
  'Descubrimiento público paginado por total descendente y username ascendente; RLS invoker, máximo100. No es una instantánea entre peticiones: refrescar si cambian catálogos o alias.';

commit;
