-- Preparada, no aplicada. El catálogo también invalida la versión del editor.
begin;

create function private.catalog_changes_profile_version() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_profiles uuid[]; v_profile uuid;
begin
  if TG_OP = 'INSERT' then
    select array_agg(distinct coalesce(to_jsonb(r)->>'seller_id',to_jsonb(r)->>'profile_id')::uuid)
      into v_profiles from new_catalog_rows r;
  elsif TG_OP = 'DELETE' then
    select array_agg(distinct coalesce(to_jsonb(r)->>'seller_id',to_jsonb(r)->>'profile_id')::uuid)
      into v_profiles from old_catalog_rows r;
  else
    select array_agg(distinct profile_id) into v_profiles from (
      select coalesce(to_jsonb(r)->>'seller_id',to_jsonb(r)->>'profile_id')::uuid profile_id from old_catalog_rows r
      union
      select coalesce(to_jsonb(r)->>'seller_id',to_jsonb(r)->>'profile_id')::uuid from new_catalog_rows r
    ) affected;
  end if;
  -- Una actualización por perfil y sentencia, no por cada artículo del lote.
  -- El lock de profiles serializa con save_profile_draft/publish_profile_complete.
  for v_profile in select id from unnest(v_profiles) id where id is not null order by id loop
    update public.profiles set content_version = content_version + 1 where id = v_profile;
  end loop;
  return null;
end;
$$;
revoke all on function private.catalog_changes_profile_version() from public, anon, authenticated;

create trigger catalog_version_insert after insert on public.products
referencing new table as new_catalog_rows for each statement execute function private.catalog_changes_profile_version();
create trigger catalog_version_update after update on public.products
referencing old table as old_catalog_rows new table as new_catalog_rows for each statement execute function private.catalog_changes_profile_version();
create trigger catalog_version_delete after delete on public.products
referencing old table as old_catalog_rows for each statement execute function private.catalog_changes_profile_version();
create trigger catalog_version_insert after insert on public.services
referencing new table as new_catalog_rows for each statement execute function private.catalog_changes_profile_version();
create trigger catalog_version_update after update on public.services
referencing old table as old_catalog_rows new table as new_catalog_rows for each statement execute function private.catalog_changes_profile_version();
create trigger catalog_version_delete after delete on public.services
referencing old table as old_catalog_rows for each statement execute function private.catalog_changes_profile_version();

-- Mantiene contrato, RLS y validación previos. Devuelve la versión FINAL,
-- incluyendo los incrementos causados por sustituir el catálogo publicado.
create or replace function public.publish_profile_complete(
  p_profile_id uuid, p_blocks jsonb, p_products jsonb, p_services jsonb,
  p_expected_version integer, p_expected_revision integer
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_version integer; v_revision integer;
begin
  if auth.uid() is null or coalesce(public.get_profile_role(p_profile_id), '') not in ('owner', 'admin') then
    raise exception 'perfil_no_autorizado' using errcode = '42501';
  end if;
  select content_version into v_version from public.profiles where id = p_profile_id for update;
  select draft_revision into v_revision from public.profile_private where profile_id = p_profile_id;
  if p_expected_version is null or p_expected_revision is null
     or v_version is distinct from p_expected_version
     or coalesce(v_revision, 0) <> p_expected_revision then
    raise exception 'conflicto_de_version' using errcode = 'PT409';
  end if;
  if jsonb_typeof(p_products) is distinct from 'array' or jsonb_typeof(p_services) is distinct from 'array'
     or pg_column_size(p_products) + pg_column_size(p_services) > 4194304 then
    raise exception 'catalogo_invalido' using errcode = '23514';
  end if;

  -- Un borrador anterior (o sin procedencia) no recibe permiso implícito para
  -- reemplazar un catálogo más reciente al volver a abrir el editor.
  if exists(select 1 from public.profile_private where profile_id = p_profile_id
    and draft_content is not null
    and (draft_content->>'catalog_base_version') is distinct from v_version::text) then
    raise exception 'catalogo_borrador_desactualizado' using errcode = 'PT409';
  end if;

  -- Reutiliza la validación y el bloqueo existentes dentro de ESTA transacción.
  -- Un error posterior revierte también los bloques, la versión y el borrador.
  v_version := public.publish_profile(p_profile_id, p_blocks, p_expected_version);
  delete from public.products where seller_id = p_profile_id;
  delete from public.services where profile_id = p_profile_id;
  insert into public.products(seller_id,type,title,price,images_urls,stock_quantity,position_index,
    description,category,product_kind,currency,variants,purchase_url,is_active,is_featured)
  select p_profile_id,'merch',x.title,x.price,x.images_urls,x.stock_quantity,x.position_index,
    x.description,x.category,x.product_kind,x.currency,x.variants,x.purchase_url,x.is_active,x.is_featured
  from jsonb_to_recordset(p_products) as x(title text,price numeric,images_urls text[],stock_quantity integer,
    position_index integer,description text,category text,product_kind text,currency text,variants jsonb,
    purchase_url text,is_active boolean,is_featured boolean);
  insert into public.services(profile_id,title,price,currency,description,position_index,category,price_unit,
    modality,duration,duration_unit,delivery_time,features,booking_url,image_url,is_active,is_featured)
  select p_profile_id,x.title,x.price,x.currency,x.description,x.position_index,x.category,x.price_unit,
    x.modality,x.duration,x.duration_unit,x.delivery_time,x.features,x.booking_url,x.image_url,x.is_active,x.is_featured
  from jsonb_to_recordset(p_services) as x(title text,price numeric,currency text,description text,
    position_index integer,category text,price_unit text,modality text,duration text,duration_unit text,
    delivery_time text,features jsonb,booking_url text,image_url text,is_active boolean,is_featured boolean);
  select draft_revision into v_revision from public.profile_private where profile_id = p_profile_id;
  select content_version into v_version from public.profiles where id = p_profile_id;
  return jsonb_build_object('content_version', v_version, 'draft_revision', coalesce(v_revision, 0));
end;
$$;
revoke all on function public.publish_profile_complete(uuid,jsonb,jsonb,jsonb,integer,integer) from public, anon;
grant execute on function public.publish_profile_complete(uuid,jsonb,jsonb,jsonb,integer,integer) to authenticated;


notify pgrst, 'reload schema';
commit;
