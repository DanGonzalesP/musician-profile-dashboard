-- Reportes sin cuenta: solo el runtime puede acreditar red y contenido.
begin;
revoke insert on public.content_reports from anon;
drop policy content_reports_insert_any on public.content_reports;
create policy content_reports_insert_authenticated on public.content_reports for insert to authenticated
with check (
  (reason <> 'derechos_de_autor' or copyright_sworn_statement)
  and (reporter_user_id is null or reporter_user_id=auth.uid())
  and status='pendiente' and moderator_notes is null and resolved_at is null
);

create function public.submit_anonymous_report(p_payload text,p_signature text)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare
 v jsonb; r jsonb; k text; expected bytea; given bytea; diff integer:=0;
 subject text; issued numeric;
begin
 if p_payload is null or octet_length(p_payload)>16384 or p_signature is null
   or p_signature !~ '^[0-9a-fA-F]{64}$' then
   raise exception 'reporte_invalido' using errcode='42501';
 end if;
 begin v:=p_payload::jsonb; exception when invalid_text_representation then
   raise exception 'reporte_invalido' using errcode='42501'; end;
 select secret_hex into k from private.anonymous_gateway_keys where key_id=v->>'keyId';
 if k is null then raise exception 'servicio_no_disponible' using errcode='PT503'; end if;
 expected:=extensions.hmac(convert_to(E'vibe-anonymous-report\n'||p_payload,'UTF8'),decode(k,'hex'),'sha256');
 given:=decode(p_signature,'hex');
 for i in 0..31 loop diff:=diff | (get_byte(expected,i) # get_byte(given,i)); end loop;
 if diff<>0 or v->>'version' is distinct from '1'
   or not coalesce(v->>'issuedAt' ~ '^[0-9]{1,12}$',false)
   or not coalesce(v->>'subject' ~ '^[0-9a-f]{64}$',false) then
   raise exception 'reporte_invalido' using errcode='42501';
 end if;
 issued:=(v->>'issuedAt')::numeric;
 if abs(extract(epoch from clock_timestamp())-issued)>30 then
   raise exception 'reporte_vencido' using errcode='42501';
 end if;
 subject:=v->>'subject'; r:=v->'report';
 if jsonb_typeof(r) is distinct from 'object' then
   raise exception 'reporte_invalido' using errcode='22023';
 end if;
 if r - array['reportedProfileId','targetType','targetId','reason','details','swornStatement','reporterEmail'] <> '{}'::jsonb
   or jsonb_typeof(r->'reportedProfileId') is distinct from 'string'
   or not coalesce(r->>'reportedProfileId' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',false)
   or jsonb_typeof(r->'details') is distinct from 'string'
   or char_length(trim(r->>'details')) not between 10 and 2000
   or not coalesce(r->>'reason' in ('derechos_de_autor','suplantacion','contenido_sexual','violencia_o_odio','spam_o_estafa','acoso','otro'),false)
   or not coalesce(r->>'targetType' in ('perfil','bloque','pista','publicacion','comentario','producto','servicio'),false)
   or jsonb_typeof(r->'swornStatement') is distinct from 'boolean'
   or (r->>'reason'='derechos_de_autor' and r->>'swornStatement'<>'true')
   or (r ? 'targetId' and (jsonb_typeof(r->'targetId')<>'string' or char_length(r->>'targetId')>200))
   or (r ? 'reporterEmail' and (jsonb_typeof(r->'reporterEmail')<>'string' or char_length(r->>'reporterEmail')>320
     or r->>'reporterEmail' !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')) then
   raise exception 'reporte_invalido' using errcode='22023';
 end if;
 -- Techo global primero: no crece una fila por red tras agotar la cola diaria.
 -- Los comprobantes repetidos consumen cuota; no permiten escrituras ilimitadas.
 if not public.check_write_rate_limit('reportes_gateway_global','global',300,86400) then
   return jsonb_build_object('accepted',false,'retry_after',86400);
 end if;
 if not public.check_write_rate_limit('reportes_gateway',subject,15,3600) then
   return jsonb_build_object('accepted',false,'retry_after',3600);
 end if;
 insert into public.content_reports(reporter_user_id,reporter_email,reported_profile_id,target_type,target_id,reason,details,copyright_sworn_statement)
 values(null,r->>'reporterEmail',(r->>'reportedProfileId')::uuid,r->>'targetType',r->>'targetId',r->>'reason',trim(r->>'details'),(r->>'swornStatement')::boolean);
 return jsonb_build_object('accepted',true,'retry_after',0);
end;
$$;
revoke all on function public.submit_anonymous_report(text,text) from public,anon,authenticated;
grant execute on function public.submit_anonymous_report(text,text) to anon;
commit;
