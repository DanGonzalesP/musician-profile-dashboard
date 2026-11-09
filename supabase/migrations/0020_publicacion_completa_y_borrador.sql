-- F3/F7: bloques, catálogo y borrador se confirmaban en peticiones separadas.
-- Un fallo del catálogo podía borrar lo publicado después de consumir el borrador.
-- Se conserva el formato del editor; sólo se añade revisión optimista al borrador.
-- Aditiva e idempotente, después de 0019. Aplicar antes del cliente nuevo.
-- La firma antigua de publish_profile sigue disponible para clientes anteriores.
-- Rollback de código: la columna/RPC nuevas pueden quedarse; no eliminar datos.

alter table public.profile_private add column if not exists draft_revision integer not null default 0;

create or replace function private.revisar_borrador()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if TG_OP = 'INSERT' then
    new.draft_revision := case when new.draft_content is null then 0 else 1 end;
  else
    new.draft_revision := old.draft_revision + case
      when new.draft_content is distinct from old.draft_content then 1 else 0 end;
  end if;
  return new;
end;
$$;
revoke all on function private.revisar_borrador() from public, anon, authenticated;
drop trigger if exists revisar_borrador on public.profile_private;
create trigger revisar_borrador before insert or update on public.profile_private
for each row execute function private.revisar_borrador();

create or replace function public.read_profile_editor(p_profile_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'content_version', p.content_version,
    'draft_revision', coalesce(d.draft_revision, 0),
    'draft_content', d.draft_content
  ) from public.profiles p
  left join public.profile_private d on d.profile_id = p.id
  where p.id = p_profile_id and auth.uid() is not null
    and public.get_profile_role(p.id) in ('owner', 'admin');
$$;
revoke all on function public.read_profile_editor(uuid) from public, anon;
grant execute on function public.read_profile_editor(uuid) to authenticated;

create or replace function public.save_profile_draft(
  p_profile_id uuid, p_draft jsonb, p_expected_revision integer, p_expected_version integer
) returns integer language plpgsql security invoker set search_path = '' as $$
declare v_version integer; v_revision integer; v_block jsonb;
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
  if jsonb_typeof(p_draft) is distinct from 'object' or pg_column_size(p_draft) > 4194304
     or jsonb_typeof(p_draft->'blocks') is distinct from 'array'
     or jsonb_typeof(p_draft->'products') is distinct from 'array'
     or jsonb_typeof(p_draft->'services') is distinct from 'array' then
    raise exception 'borrador_invalido' using errcode = '23514';
  end if;
  if jsonb_array_length(p_draft->'blocks') > 200 then
    raise exception 'borrador_invalido' using errcode = '23514';
  end if;
  for v_block in select * from jsonb_array_elements(p_draft->'blocks') loop
    if jsonb_typeof(v_block) is distinct from 'object'
       or coalesce(v_block->>'type', '') not in ('hero','single','crowdfunding','tracks','credits','merch','service','legado','publicaciones','embeds')
       or jsonb_typeof(v_block->'data') is distinct from 'object'
       or pg_column_size(v_block->'data') > 524288 then
      raise exception 'bloques_invalidos' using errcode = '23514';
    end if;
  end loop;
  insert into public.profile_private(profile_id, draft_content, updated_at)
    values(p_profile_id, p_draft, now())
  on conflict(profile_id) do update set draft_content = excluded.draft_content, updated_at = now()
  returning draft_revision into v_revision;
  return v_revision;
end;
$$;
revoke all on function public.save_profile_draft(uuid,jsonb,integer,integer) from public, anon;
grant execute on function public.save_profile_draft(uuid,jsonb,integer,integer) to authenticated;

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
  return jsonb_build_object('content_version', v_version, 'draft_revision', coalesce(v_revision, 0));
end;
$$;
revoke all on function public.publish_profile_complete(uuid,jsonb,jsonb,jsonb,integer,integer) from public, anon;
grant execute on function public.publish_profile_complete(uuid,jsonb,jsonb,jsonb,integer,integer) to authenticated;

-- Verificación (sólo lectura):
-- select proname, prosecdef from pg_proc where proname in
-- ('read_profile_editor','save_profile_draft','publish_profile_complete');
-- select column_name from information_schema.columns
-- where table_name='profile_private' and column_name='draft_revision';
notify pgrst, 'reload schema';
