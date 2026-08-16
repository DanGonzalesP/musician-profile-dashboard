-- ═══════════════════════════════════════════════════════════════════════════
-- 0013_endurecer_advisors_supabase.sql — Cierra avisos de Security Advisor.
--
-- PROBLEMAS QUE RESUELVE
-- 1. `citext` vivía en `public`, el esquema expuesto por la Data API.
-- 2. Un trigger heredado no fijaba su search_path.
-- 3. Tres RPC `security definer` eran invocables directamente por usuarios.
-- 4. Seis tablas cerradas por RLS no expresaban el deny-all con una política.
-- 5. Un respaldo con borradores y datos legales seguía en el esquema público.
--
-- El contador distribuido conserva su contrato de producto (upload 120/h e
-- image-generation 10/h), pero el cliente deja de elegir límite y ventana.
-- Las implementaciones privilegiadas viven en `private`, que PostgREST no
-- expone; `public` conserva wrappers SECURITY INVOKER con la misma finalidad.
--
-- Idempotente. Correr DESPUÉS de 0012.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1) Esquemas no expuestos y extensión ────────────────────────────────

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Los wrappers públicos necesitan resolver únicamente las funciones que se
-- les conceden de forma explícita. USAGE no concede acceso a tablas.
grant usage on schema private to authenticated;

create schema if not exists extensions;

do $$
begin
  if exists (
    select 1
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'citext' and n.nspname = 'public'
  ) then
    alter extension citext set schema extensions;
  end if;
end $$;


-- ─── 2) Trigger de username con resolución de nombres inmutable ──────────

create or replace function public.check_username_not_reserved()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.username is not null
     and exists (
       select 1
       from public.reserved_usernames r
       where r.name = new.username
     ) then
    raise exception 'El nombre de usuario "%" está reservado', new.username
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- Es una función de trigger, no una RPC.
revoke all on function public.check_username_not_reserved() from public, anon, authenticated;


-- ─── 3) Rate limit distribuido: política fijada en la base ───────────────

create or replace function private.consume_authenticated_rate_limit(p_bucket text)
returns table (is_allowed boolean, retry_after integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_limit integer;
  v_window_seconds integer;
  now_at timestamptz := pg_catalog.now();
  v_started_at timestamptz;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  -- Lista cerrada: quien llama no puede reducir la ventana ni aumentar el
  -- cupo para reiniciar o eludir su propio contador.
  case p_bucket
    when 'upload' then
      v_limit := 120;
      v_window_seconds := 3600;
    when 'image-generation' then
      v_limit := 10;
      v_window_seconds := 3600;
    else
      raise exception 'unknown rate limit bucket';
  end case;

  insert into public.rate_limit_windows as w (bucket, user_id, started_at, request_count)
  values (p_bucket, v_uid, now_at, 1)
  on conflict (bucket, user_id) do update
    set started_at = case
          when w.started_at <= now_at - pg_catalog.make_interval(secs => v_window_seconds) then now_at
          else w.started_at
        end,
        request_count = case
          when w.started_at <= now_at - pg_catalog.make_interval(secs => v_window_seconds) then 1
          else w.request_count + 1
        end
  returning w.started_at, w.request_count into v_started_at, v_count;

  if v_count <= v_limit then
    return query select true, 0;
  else
    return query
      select false,
             pg_catalog.greatest(
               1,
               pg_catalog.ceil(
                 extract(epoch from (
                   v_started_at
                   + pg_catalog.make_interval(secs => v_window_seconds)
                   - now_at
                 ))
               )::integer
             );
  end if;
end;
$$;

revoke all on function private.consume_authenticated_rate_limit(text) from public, anon;
grant execute on function private.consume_authenticated_rate_limit(text) to authenticated;

create or replace function public.consume_authenticated_rate_limit(p_bucket text)
returns table (is_allowed boolean, retry_after integer)
language sql
security invoker
set search_path = ''
as $$
  select * from private.consume_authenticated_rate_limit(p_bucket);
$$;

revoke all on function public.consume_authenticated_rate_limit(text) from public, anon;
grant execute on function public.consume_authenticated_rate_limit(text) to authenticated;

-- La firma heredada permitía que el cliente eligiera el límite y la ventana.
-- Se conserva temporalmente para no hacer DDL destructivo, pero queda
-- inejecutable; una migración futura puede retirarla tras el despliegue.
revoke all on function public.consume_authenticated_rate_limit(text, integer, integer)
  from public, anon, authenticated;


-- ─── 4) Eliminación de cuenta: privilegio fuera del esquema expuesto ─────

create or replace function private.eliminar_mi_cuenta_impl()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Se necesita una sesion activa';
  end if;

  insert into public.audit_log (actor_user_id, action, target_table, target_id, metadata)
  values (
    v_uid,
    'cuenta_eliminada',
    'auth.users',
    v_uid::text,
    pg_catalog.jsonb_build_object('solicitado_en', pg_catalog.now())
  );

  -- El esquema heredado sólo tenía FK con cascada para owner_user_id (bandas),
  -- no para user_id (perfil individual). El borrado explícito evita dejar un
  -- perfil huérfano y hace real el contrato de supresión documentado.
  delete from public.profiles
  where user_id = v_uid or owner_user_id = v_uid;

  delete from auth.users where id = v_uid;
end;
$$;

revoke all on function private.eliminar_mi_cuenta_impl() from public, anon;
grant execute on function private.eliminar_mi_cuenta_impl() to authenticated;

create or replace function public.eliminar_mi_cuenta()
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.eliminar_mi_cuenta_impl();
$$;

revoke all on function public.eliminar_mi_cuenta() from public, anon;
grant execute on function public.eliminar_mi_cuenta() to authenticated;


-- ─── 5) Auditoría: no existe un caso de uso cliente ──────────────────────

-- Ninguna ruta ni componente llama esta RPC. Mantenerla abierta permitía a
-- cualquier cuenta llenar audit_log con acciones y metadata inventadas. Se
-- conserva para llamadas internas del dueño de la base, con nombres fijados.
create or replace function public.registrar_auditoria(
  p_action text,
  p_target_table text default null,
  p_target_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_log (actor_user_id, action, target_table, target_id, metadata)
  values (auth.uid(), p_action, p_target_table, p_target_id, p_metadata);
end;
$$;

revoke all on function public.registrar_auditoria(text, text, text, jsonb)
  from public, anon, authenticated;


-- ─── 6) RLS deny-all explícita para tablas internas/heredadas ────────────

do $$
declare
  v_table text;
  v_policy text;
begin
  foreach v_table in array array[
    'audit_log',
    'donations',
    'rate_limit_windows',
    'reserved_usernames',
    'write_rate_limit_windows'
  ] loop
    if pg_catalog.to_regclass('public.' || v_table) is not null then
      v_policy := v_table || '_deny_direct_access';
      execute pg_catalog.format('drop policy if exists %I on public.%I', v_policy, v_table);
      execute pg_catalog.format(
        'create policy %I on public.%I as restrictive for all to anon, authenticated using (false) with check (false)',
        v_policy,
        v_table
      );
      execute pg_catalog.format('revoke all on table public.%I from anon, authenticated', v_table);
    end if;
  end loop;
end $$;


-- ─── 7) El respaldo sensible sale de la Data API, sin borrar datos ───────

do $$
begin
  if pg_catalog.to_regclass('public._backup_profiles_20260805') is not null
     and pg_catalog.to_regclass('private._backup_profiles_20260805') is null then
    alter table public._backup_profiles_20260805 set schema private;
  end if;
end $$;

revoke all on table private._backup_profiles_20260805 from public, anon, authenticated;


-- ─── 8) Verificación de solo lectura ─────────────────────────────────────

select
  n.nspname as schema,
  p.proname as funcion,
  p.prosecdef as security_definer,
  p.proconfig as configuracion,
  pg_catalog.has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.proname in (
  'check_username_not_reserved',
  'consume_authenticated_rate_limit',
  'eliminar_mi_cuenta',
  'eliminar_mi_cuenta_impl',
  'registrar_auditoria'
)
order by n.nspname, p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid);

select schemaname, tablename, policyname, permissive, roles
from pg_policies
where schemaname = 'public'
  and tablename in (
    'audit_log',
    'donations',
    'rate_limit_windows',
    'reserved_usernames',
    'write_rate_limit_windows'
  )
order by tablename;
