-- Un marcador vacío sigue siendo un objeto R2: conservar su fila de propiedad.
-- La supresión final de cuenta/retención se integra antes del corte de runtime.
begin;
create function private.guard_reserved_media_inventory() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_row private.media_upload_intents;
begin
  -- Administración local de fixtures/restauración; no hay esa identidad en app.
  if auth.uid() is null then
    if TG_OP = 'DELETE' then return old; else return new; end if;
  end if;
  select * into v_row from private.media_upload_intents where key = old.key;
  if not found then
    if TG_OP = 'DELETE' then return old; else return new; end if;
  end if;
  if TG_OP = 'DELETE' then
    raise exception 'inventario_reservado' using errcode = '42501';
  end if;
  if new.profile_id is distinct from old.profile_id or new.folder is distinct from old.folder
    or new.content_type is distinct from old.content_type or new.created_at is distinct from old.created_at
    or (new.bytes is distinct from old.bytes and not coalesce(v_row.state = 'retired' and new.bytes = 0,false)) then
    raise exception 'inventario_reservado' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_reserved_media_inventory() from public, anon, authenticated;
create trigger media_protocol_inventory before update or delete on public.media_assets
for each row execute function private.guard_reserved_media_inventory();

create or replace function public.retire_media_upload(p_payload text, p_signature text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v jsonb; v_row private.media_upload_intents; v_state text;
begin
  v := private.verify_media_receipt(p_payload,p_signature,'retire');
  perform private.lock_media_account();
  select state into v_state from private.media_lifecycle where key = v->>'key' for update;
  select * into v_row from private.media_upload_intents where key = v->>'key';
  if not found or v_row.owner_user_id <> auth.uid() or v_state <> 'deleting'
    or v->>'bytes' is distinct from '0' or not coalesce(length(v->>'etag') between 1 and 200,false) then
    raise exception 'retirada_invalida' using errcode = 'PT409';
  end if;
  update private.media_upload_intents set state = 'retired' where key = v_row.key;
  -- Mantener propiedad aun cuando el contenido se sustituyó por cero bytes.
  -- La key continúa tombstoned y no puede reutilizarse ni publicarse.
  update public.media_assets set bytes = 0 where key = v_row.key and owner_user_id = auth.uid();
  if not found then raise exception 'inventario_ausente' using errcode = 'PT409'; end if;
  return true;
end;
$$;
notify pgrst, 'reload schema';
commit;
