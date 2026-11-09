-- Preparada, NO APLICADA. Depende de0052. Version5 añade solicitudes propias
-- de creación sin exponer recibos de otros administradores del mismo perfil.
begin;

create or replace function public.export_my_account_data()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_result jsonb;
begin
 if v_actor is null then raise exception 'sesion_requerida' using errcode='42501'; end if;
 select jsonb_build_object(
  'cuenta', (select coalesce(jsonb_agg(jsonb_build_object(
   'id',u.id,'correo',u.email,'telefono',u.phone,'creada_en',u.created_at,
   'ultimo_acceso_en',u.last_sign_in_at)),'[]'::jsonb)
   from auth.users u where u.id=v_actor),
  'lecturas_moderacion', (select coalesce(jsonb_agg(jsonb_build_object(
   'reporte',r.report_id,'version_decision',r.decision_version,
   'respuesta_en',r.response_at,'leido_en',r.read_at) order by r.read_at,r.report_id),'[]'::jsonb)
   from private.moderation_notice_reads r where r.user_id=v_actor),
  'solicitudes_creacion_servicios', (select coalesce(jsonb_agg(jsonb_build_object(
    'solicitud',r.request_id,'perfil',r.profile_id,'servicio',r.service_id::text,
    'huella_contenido',encode(r.payload_digest,'hex'))
    order by r.profile_id,r.request_id),'[]'::jsonb)
    from private.service_creation_requests r where r.actor_id=v_actor)
 ) into v_result;
 return v_result;
end;
$$;
revoke all on function public.export_my_account_data() from public,anon,authenticated;
grant execute on function public.export_my_account_data() to authenticated;

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
    'version_formato', 5,
    'exportado_en', now(),
    'alcance', jsonb_build_object(
      'completa', false,
      'binarios_incluidos', false,
      'criterio', 'Titularidad propia y filas permitidas por RLS',
      'pendientes', jsonb_build_array('reportes anonimos no vinculados a una cuenta', 'revision de metadatos de proveedores de autenticacion', 'archivos binarios', 'revision de retencion y registros historicos')
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
   ) || public.export_my_moderation_data() || public.export_my_account_data()
    || jsonb_build_object(
      'preguntas_enviadas', (select coalesce(jsonb_agg(jsonb_build_object(
        'id',q.id,'perfil_destino',q.profile_id,'nombre_aportado',q.asker_display_name,
        'tipo_bloque',q.block_type,'etiqueta_bloque',q.block_label,'mensaje',q.message,
        'estado',q.status,'creada_en',q.created_at) order by q.created_at,q.id),'[]'::jsonb)
        from public.profile_questions q where q.asker_user_id=v_actor),
      'preguntas_recibidas', (select coalesce(jsonb_agg(jsonb_build_object(
        'id',q.id,'perfil_destino',q.profile_id,'nombre_aportado',q.asker_display_name,
        'tipo_bloque',q.block_type,'etiqueta_bloque',q.block_label,'mensaje',q.message,
        'estado',q.status,'creada_en',q.created_at) order by q.created_at,q.id),'[]'::jsonb)
        from public.profile_questions q join public.profiles p on p.id=q.profile_id
        where p.user_id=v_actor)
    ) into v_resultado;
  return v_resultado;
end;
$$;

revoke execute on function public.exportar_mis_datos() from public, anon;
grant execute on function public.exportar_mis_datos() to authenticated;
commit;

