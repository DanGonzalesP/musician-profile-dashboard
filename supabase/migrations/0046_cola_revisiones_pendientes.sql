-- Bandeja de solicitudes sin respuesta, independiente del estado del reporte.
begin;
create index moderation_appeals_pending on private.moderation_appeals(report_id,created_at)
 where outcome is null;

create function public.pending_moderation_reviews(p_offset integer default 0)
returns setof public.content_reports
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.has_platform_permission('moderation') then
  raise exception 'operacion_no_permitida' using errcode='42501';
 end if;
 if p_offset is null or p_offset<0 or p_offset>10000 then
  raise exception 'consulta_invalida' using errcode='22023';
 end if;
 -- Un expediente por fila, aunque tenga solicitudes de distintas versiones.
 -- No filtrar sólo aceptados: una restitución ajena puede dejar respuesta pendiente.
 return query select r.* from public.content_reports r
 join (select a.report_id,min(a.created_at) as oldest
       from private.moderation_appeals a where a.outcome is null group by a.report_id) pending
 on pending.report_id=r.id
 order by pending.oldest,r.id limit 50 offset p_offset;
end;
$$;
revoke all on function public.pending_moderation_reviews(integer) from public,anon,authenticated;
grant execute on function public.pending_moderation_reviews(integer) to authenticated;
commit;
