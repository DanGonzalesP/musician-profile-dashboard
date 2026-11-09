-- Copia propia de reportes y revisiones, sin notas internas ni datos de terceros.
-- Preparada sin aplicar: necesita0043,0044 y0045.
begin;
create function public.export_my_moderation_data()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_result jsonb;
begin
 if v_actor is null then raise exception 'sesion_requerida' using errcode='42501'; end if;
 select jsonb_build_object(
  'reportes_enviados', (select coalesce(jsonb_agg(jsonb_build_object(
   'id',r.id,'perfil_reportado',r.reported_profile_id,'tipo',r.target_type,'referencia',r.target_id,
   'motivo',r.reason,'detalle',r.details,'correo_aportado',r.reporter_email,
   'declaracion_titularidad',r.copyright_sworn_statement,'estado',r.status,
   'creado_en',r.created_at,'resuelto_en',r.resolved_at) order by r.created_at,r.id),'[]'::jsonb)
   from public.content_reports r where r.reporter_user_id=v_actor),
  'decisiones_perfiles_propios', (select coalesce(jsonb_agg(jsonb_build_object(
   'reporte',r.id,'perfil',p.id,'motivo',r.reason,'estado',r.status,
   'version',r.moderation_version,'resuelto_en',r.resolved_at) order by r.resolved_at,r.id),'[]'::jsonb)
   from public.content_reports r join public.profiles p on p.id=r.reported_profile_id
   where p.user_id=v_actor and r.status in ('aceptado','rechazado')),
  'solicitudes_revision', (select coalesce(jsonb_agg(jsonb_build_object(
   'id',a.id,'reporte',a.report_id,'version_decision',a.decision_version,
   'solicitud',a.message,'creada_en',a.created_at,'resultado',a.outcome,
   'respuesta',a.public_response,'respondida_en',a.resolved_at) order by a.created_at,a.id),'[]'::jsonb)
   from private.moderation_appeals a where a.requester_user_id=v_actor)
 ) into v_result;
 return v_result;
end;
$$;
revoke all on function public.export_my_moderation_data() from public,anon,authenticated;
grant execute on function public.export_my_moderation_data() to authenticated;

-- La función principal se conserva como SECURITY INVOKER para el resto de tablas.
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
    'version_formato', 3,
    'exportado_en', now(),
    'alcance', jsonb_build_object(
      'completa', false,
      'binarios_incluidos', false,
      'criterio', 'Titularidad propia y filas permitidas por RLS',
      'pendientes', jsonb_build_array('preguntas', 'reportes anonimos no vinculados a una cuenta', 'datos de autenticacion', 'archivos binarios', 'revision de retencion y registros historicos')
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
  ) || public.export_my_moderation_data() into v_resultado;
  return v_resultado;
end;
$$;

revoke execute on function public.exportar_mis_datos() from public, anon;
grant execute on function public.exportar_mis_datos() to authenticated;
commit;

