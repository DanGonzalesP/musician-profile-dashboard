-- ═══════════════════════════════════════════════════════════════════════════
-- 0008_moderacion_y_cumplimiento.sql — Reportes, bloqueos, DMCA y derecho al
-- borrado.
--
-- PROBLEMA QUE RESUELVE
-- Las páginas legales (/legal/copyright, /legal/comunidad, /legal/privacidad)
-- prometen procesos que NO existían en el producto:
--   • No había forma de reportar contenido ni de bloquear a un usuario.
--   • No había flujo de takedown por derechos de autor, ni contranotificación,
--     ni suspensión de cuentas. Una plataforma que aloja música subida por
--     terceros sin proceso de takedown es un objetivo legal fácil.
--   • No había borrado de cuenta ni exportación de datos — obligatorios bajo
--     la Ley 29733 (Perú) y el GDPR, y especialmente graves porque la app
--     almacena DNIs.
--   • No había registro de auditoría de quién cambió qué.
--
-- Idempotente. Correr DESPUÉS de 0007.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1) Reportes de contenido ─────────────────────────────────────────────

create table if not exists content_reports (
  id uuid primary key default gen_random_uuid(),
  -- Quién reporta. Nullable: se admiten reportes de copyright sin cuenta,
  -- porque el titular de los derechos casi nunca es usuario de la plataforma.
  reporter_user_id uuid references auth.users(id) on delete set null,
  reporter_email text,

  -- Qué se reporta. Se guarda el perfil y, opcionalmente, el elemento
  -- concreto (bloque, pista, comentario) con su tipo.
  reported_profile_id uuid not null references profiles(id) on delete cascade,
  target_type text not null check (target_type in ('perfil', 'bloque', 'pista', 'publicacion', 'comentario', 'producto', 'servicio')),
  target_id text,

  reason text not null check (reason in (
    'derechos_de_autor',   -- DMCA / Ley de derechos de autor
    'suplantacion',
    'contenido_sexual',
    'violencia_o_odio',
    'spam_o_estafa',
    'acoso',
    'otro'
  )),
  details text not null check (char_length(details) between 10 and 2000),

  -- Declaración jurada: obligatoria para los reportes de derechos de autor,
  -- es lo que le da validez legal a la notificación de takedown.
  copyright_sworn_statement boolean not null default false,

  status text not null default 'pendiente'
    check (status in ('pendiente', 'en_revision', 'aceptado', 'rechazado')),
  moderator_notes text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists content_reports_status_idx on content_reports (status, created_at desc);
create index if not exists content_reports_profile_idx on content_reports (reported_profile_id);

alter table content_reports enable row level security;

drop policy if exists "content_reports_insert_any" on content_reports;
drop policy if exists "content_reports_select_own" on content_reports;

-- Cualquiera puede reportar, con o sin sesión (ver arriba: los titulares de
-- derechos rara vez tienen cuenta). Se exige la declaración jurada cuando el
-- motivo es de derechos de autor.
create policy "content_reports_insert_any"
on content_reports for insert
to anon, authenticated
with check (
  (reason <> 'derechos_de_autor' or copyright_sworn_statement = true)
  and (reporter_user_id is null or reporter_user_id = auth.uid())
);

-- Quien reporta puede ver el estado de SU reporte. Nadie ve los ajenos:
-- exponer quién reportó a quién invita a represalias.
create policy "content_reports_select_own"
on content_reports for select
to authenticated
using (reporter_user_id = auth.uid());


-- ─── 2) Bloqueo entre usuarios ────────────────────────────────────────────

create table if not exists user_blocks (
  blocker_user_id uuid not null references auth.users(id) on delete cascade,
  blocked_profile_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_user_id, blocked_profile_id)
);

alter table user_blocks enable row level security;

drop policy if exists "user_blocks_select_own" on user_blocks;
drop policy if exists "user_blocks_insert_own" on user_blocks;
drop policy if exists "user_blocks_delete_own" on user_blocks;

create policy "user_blocks_select_own"
on user_blocks for select to authenticated using (blocker_user_id = auth.uid());

create policy "user_blocks_insert_own"
on user_blocks for insert to authenticated with check (blocker_user_id = auth.uid());

create policy "user_blocks_delete_own"
on user_blocks for delete to authenticated using (blocker_user_id = auth.uid());


-- ─── 3) Suspensión de perfiles (resultado de un takedown aceptado) ────────

alter table profiles add column if not exists is_suspended boolean not null default false;
alter table profiles add column if not exists suspended_reason text;
alter table profiles add column if not exists suspended_at timestamptz;

-- Un perfil suspendido deja de ser visible públicamente. Se aplica sobre
-- profile_blocks, que es de donde sale todo el contenido de la página.
drop policy if exists "profile_blocks_select_public" on profile_blocks;
create policy "profile_blocks_select_public"
on profile_blocks for select
to anon, authenticated
using (
  not exists (
    select 1 from profiles p
    where p.id = profile_blocks.profile_id and p.is_suspended = true
  )
);


-- ─── 4) Registro de auditoría ─────────────────────────────────────────────
-- Sin esto, cuando alguien dice "se borró mi contenido" no hay con qué
-- reconstruir qué pasó.

create table if not exists audit_log (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_table text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_actor_idx on audit_log (actor_user_id, created_at desc);
create index if not exists audit_log_action_idx on audit_log (action, created_at desc);

alter table audit_log enable row level security;
-- Sin políticas de lectura: solo el service role (backoffice) lo consulta.
-- Sin políticas de escritura desde el cliente: lo escriben triggers y
-- funciones security definer.

create or replace function public.registrar_auditoria(
  p_action text,
  p_target_table text default null,
  p_target_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into audit_log (actor_user_id, action, target_table, target_id, metadata)
  values (auth.uid(), p_action, p_target_table, p_target_id, p_metadata);
end;
$$;

revoke execute on function public.registrar_auditoria(text, text, text, jsonb) from public, anon;
grant execute on function public.registrar_auditoria(text, text, text, jsonb) to authenticated;


-- ─── 5) Exportación de datos (derecho de acceso) ──────────────────────────
-- Ley 29733 art. 19 y GDPR art. 15/20: la persona puede pedir una copia de
-- sus datos en formato reutilizable.

create or replace function public.exportar_mis_datos()
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_resultado jsonb;
begin
  if auth.uid() is null then
    raise exception 'Se necesita una sesion activa';
  end if;

  select jsonb_build_object(
    'exportado_en', now(),
    'perfiles', (
      select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
      from profiles p
      where p.user_id = auth.uid() or p.owner_user_id = auth.uid()
    ),
    'datos_privados', (
      select coalesce(jsonb_agg(to_jsonb(pp)), '[]'::jsonb)
      from profile_private pp
      where pp.profile_id in (
        select id from profiles where user_id = auth.uid() or owner_user_id = auth.uid()
      )
    ),
    'bloques', (
      select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb)
      from profile_blocks b
      where b.profile_id in (
        select id from profiles where user_id = auth.uid() or owner_user_id = auth.uid()
      )
    ),
    'archivos', (
      select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb)
      from media_assets m
      where m.owner_user_id = auth.uid()
    )
  ) into v_resultado;

  return v_resultado;
end;
$$;

revoke execute on function public.exportar_mis_datos() from public, anon;
grant execute on function public.exportar_mis_datos() to authenticated;


-- ─── 6) Borrado de cuenta (derecho de supresión) ──────────────────────────
-- Ley 29733 art. 20 y GDPR art. 17. Es especialmente importante acá porque la
-- app almacena DNIs en profile_private.
--
-- Borra la fila de auth.users; el resto cae solo por los ON DELETE CASCADE
-- que ya declaran las tablas. Los archivos de R2 NO se borran desde SQL —
-- eso lo hace la ruta de la app, que sí puede hablar con R2; media_assets
-- queda como el inventario de qué borrar.

create or replace function public.eliminar_mi_cuenta()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Se necesita una sesion activa';
  end if;

  -- Se deja constancia ANTES de borrar: después el actor ya no existe.
  insert into audit_log (actor_user_id, action, target_table, target_id, metadata)
  values (v_uid, 'cuenta_eliminada', 'auth.users', v_uid::text,
          jsonb_build_object('solicitado_en', now()));

  delete from auth.users where id = v_uid;
end;
$$;

revoke execute on function public.eliminar_mi_cuenta() from public, anon;
grant execute on function public.eliminar_mi_cuenta() to authenticated;


-- ─── 7) Verificación ──────────────────────────────────────────────────────
select 'content_reports' as tabla, count(*) from content_reports
union all select 'user_blocks', count(*) from user_blocks
union all select 'audit_log', count(*) from audit_log;
