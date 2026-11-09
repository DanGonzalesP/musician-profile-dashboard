-- Ampliación de la copia de datos, sin elevar privilegios ni relajar RLS.
-- Pendiente de validación y aplicación; no acredita una exportación integral.
begin;

create or replace function public.exportar_mis_datos()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_resultado jsonb;
begin
  if v_actor is null then
    raise exception 'Se necesita una sesion activa' using errcode = '42501';
  end if;

  -- Una única sentencia conserva una vista coherente de las categorías.
  -- Ser editor de un grupo no convierte sus datos en datos propios.
  with propios as materialized (
    select p.id from public.profiles p
    where p.user_id = v_actor or p.owner_user_id = v_actor
  )
  select jsonb_build_object(
    'version_formato', 2,
    'exportado_en', now(),
    'alcance', jsonb_build_object(
      'completa', false,
      'binarios_incluidos', false,
      'criterio', 'Titularidad propia y filas permitidas por RLS',
      'pendientes', jsonb_build_array('preguntas', 'reportes', 'datos de autenticacion', 'archivos binarios', 'revision de retencion y registros historicos')
    ),
    'perfiles', (select coalesce(jsonb_agg(to_jsonb(p) order by p.id), '[]'::jsonb)
      from public.profiles p where p.id in (select id from propios)),
    'datos_privados', (select coalesce(jsonb_agg(to_jsonb(p) order by p.profile_id), '[]'::jsonb)
      from public.profile_private p where p.profile_id in (select id from propios)),
    'bloques', (select coalesce(jsonb_agg(to_jsonb(b) order by b.id), '[]'::jsonb)
      from public.profile_blocks b where b.profile_id in (select id from propios)),
    'archivos', (select coalesce(jsonb_agg(to_jsonb(m) order by m.key), '[]'::jsonb)
      from public.media_assets m where m.owner_user_id = v_actor),
    'productos', (select coalesce(jsonb_agg(to_jsonb(p) order by p.id), '[]'::jsonb)
      from public.products p where p.seller_id in (select id from propios)),
    'servicios', (select coalesce(jsonb_agg(to_jsonb(s) order by s.id), '[]'::jsonb)
      from public.services s where s.profile_id in (select id from propios)),
    'musica', (select coalesce(jsonb_agg(to_jsonb(m) order by m.id), '[]'::jsonb)
      from public.music_feed m where m.profile_id in (select id from propios)),
    'comentarios_musica', (select coalesce(jsonb_agg(to_jsonb(c) order by c.id), '[]'::jsonb)
      from public.feed_comments c where c.user_id = v_actor),
    'comentarios_publicaciones', (select coalesce(jsonb_agg(to_jsonb(c) order by c.id), '[]'::jsonb)
      from public.feed_post_comments c where c.user_id = v_actor),
    'bloqueos', (select coalesce(jsonb_agg(to_jsonb(b) order by b.blocked_profile_id), '[]'::jsonb)
      from public.user_blocks b where b.blocker_user_id = v_actor),
    'membresias', (select coalesce(jsonb_agg(to_jsonb(m) order by m.id), '[]'::jsonb)
      from public.band_members m where m.member_user_id = v_actor),
    'creditos_solicitados', (select coalesce(jsonb_agg(to_jsonb(c) order by c.id), '[]'::jsonb)
      from public.credit_requests c where c.requester_profile_id in (select id from propios)),
    'licencias', (select coalesce(jsonb_agg(to_jsonb(l) order by l.id), '[]'::jsonb)
      from public.licenses l where l.profile_id in (select id from propios)),
    'certificados', (select coalesce(jsonb_agg(to_jsonb(c) order by c.id), '[]'::jsonb)
      from public.author_certificates c where c.profile_id in (select id from propios))
  ) into v_resultado;
  return v_resultado;
end;
$$;

revoke execute on function public.exportar_mis_datos() from public, anon;
grant execute on function public.exportar_mis_datos() to authenticated;
commit;
