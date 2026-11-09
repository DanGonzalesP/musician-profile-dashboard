-- Preparada, no aplicada. Mantiene services.id bigint y conserva recibos de
-- solicitudes incluso si el servicio se retira: un reintento no lo resucita.
begin;

create table private.service_creation_requests (
  actor_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null,
  payload_digest bytea not null,
  service_id bigint not null,
  primary key (actor_id, profile_id, request_id)
);
revoke all on private.service_creation_requests from public, anon, authenticated;

create function public.create_service_once(p_profile_id uuid, p_request_id uuid, p_service jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_digest bytea;
  v_previous private.service_creation_requests%rowtype;
  v_service public.services%rowtype;
  v_id bigint;
begin
  if v_actor is null or p_profile_id is null or p_request_id is null then
    raise exception 'autenticacion_requerida' using errcode = '42501';
  end if;
  -- Mismo contrato owner/admin de services_insert_by_role. Se repite la
  -- autorización en cada reintento, sin confiar en el recibo antiguo.
  if public.get_profile_role(p_profile_id) is null or
     public.get_profile_role(p_profile_id) not in ('owner', 'admin') then
    raise exception 'perfil_no_autorizado' using errcode = '42501';
  end if;
  perform private.assert_account_writable(v_actor);
  if p_service is null or jsonb_typeof(p_service) <> 'object' or
     octet_length(p_service::text) > 65536 or
     (p_service - array['title','price','currency','description','position_index',
       'category','price_unit','modality','duration','duration_unit','delivery_time',
       'features','booking_url','image_url','is_active','is_featured']) <> '{}'::jsonb then
    raise exception 'servicio_invalido' using errcode = '22023';
  end if;
  v_digest := sha256(convert_to(p_service::text, 'UTF8'));
  -- assert_account_writable mantiene el lock de la cuenta hasta commit, por
  -- tanto dos llamadas del mismo actor no pueden pasar a la vez este punto.
  select * into v_previous from private.service_creation_requests
    where actor_id = v_actor and profile_id = p_profile_id and request_id = p_request_id;
  if found then
    if v_previous.payload_digest <> v_digest then
      raise exception 'solicitud_reutilizada_con_cambios' using errcode = 'PT409';
    end if;
    if not exists(select 1 from public.services where id = v_previous.service_id and profile_id = p_profile_id) then
      raise exception 'servicio_creado_ya_retirado' using errcode = 'PT409';
    end if;
    return jsonb_build_object('id', v_previous.service_id::text, 'replayed', true);
  end if;
  v_service := jsonb_populate_record(null::public.services, p_service);
  if nullif(btrim(v_service.title), '') is null or v_service.price is null or
     v_service.price < 0 or v_service.price::text in ('NaN','Infinity','-Infinity') then
    raise exception 'servicio_invalido' using errcode = '22023';
  end if;
  insert into public.services(profile_id,title,price,currency,description,position_index,
    category,price_unit,modality,duration,duration_unit,delivery_time,features,
    booking_url,image_url,is_active,is_featured)
  values(p_profile_id,btrim(v_service.title),v_service.price,v_service.currency,
    v_service.description,coalesce(v_service.position_index,0),v_service.category,
    v_service.price_unit,v_service.modality,v_service.duration,v_service.duration_unit,
    v_service.delivery_time,v_service.features,v_service.booking_url,v_service.image_url,
    v_service.is_active,v_service.is_featured)
  returning id into v_id;
  -- Los triggers existentes siguen comprobando congelación del titular del
  -- perfil, permisos de medios y referencias; no se desactiva ninguno.
  insert into private.service_creation_requests values(v_actor,p_profile_id,p_request_id,v_digest,v_id);
  return jsonb_build_object('id', v_id::text, 'replayed', false);
end;
$$;
revoke all on function public.create_service_once(uuid,uuid,jsonb) from public, anon;
grant execute on function public.create_service_once(uuid,uuid,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
