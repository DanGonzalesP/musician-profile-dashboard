-- ═══════════════════════════════════════════════════════════════════════════
-- 0006_username.sql — Identidad real y única para cada perfil.
--
-- PROBLEMA QUE RESUELVE
-- La URL pública resolvía así (app/[username]/page.tsx):
--
--    slug "nova-reyes" → "nova reyes" → .ilike("display_name", ...) → maybeSingle()
--
-- Cinco fallas en una línea:
--   1. display_name NO es único. Dos "Nova Reyes" hacen que maybeSingle()
--      devuelva error PGRST116 y AMBOS perfiles quedan inalcanzables. No es
--      hipotético: es inevitable al crecer.
--   2. ilike interpreta comodines. Los caracteres % y _ llegan crudos desde la
--      URL: visitar /%25 hace match con un perfil arbitrario, y /a%25 permite
--      enumerar perfiles por prefijo.
--   3. Sin palabras reservadas: alguien se registra como "dashboard", "login"
--      o "api" y su perfil es inalcanzable para siempre (gana la ruta de Next).
--   4. Renombrarse rompe TODOS los enlaces ya compartidos: los QR impresos,
--      los links en Instagram y las tarjetas PDF quedan muertos.
--   5. El slug es lossy: "Nova-Reyes", "Nova Reyes" y "nova reyes" colapsan.
--
-- Idempotente. Correr DESPUÉS de 0005.
-- ═══════════════════════════════════════════════════════════════════════════

-- citext = texto case-insensitive. Hace que "NovaReyes" y "novareyes" sean el
-- mismo username a nivel de índice único, sin depender de que la app
-- recuerde normalizar.
create extension if not exists citext;


-- ─── 1) La columna ────────────────────────────────────────────────────────

alter table profiles add column if not exists username citext;

do $$ begin
  alter table profiles add constraint profiles_username_format
    check (username is null or username ~ '^[a-z0-9_]{3,30}$');
exception when duplicate_object then null;
end $$;


-- ─── 2) Palabras reservadas ───────────────────────────────────────────────
-- Cualquier username que choque con una ruta real de la app dejaría el perfil
-- inalcanzable. Se bloquean en la base, no solo en el formulario: la base es
-- el único lugar por el que pasan TODAS las escrituras.

create table if not exists reserved_usernames (name citext primary key);

insert into reserved_usernames (name) values
  ('api'), ('dashboard'), ('login'), ('logout'), ('registro'), ('signup'),
  ('perfil'), ('profile'), ('grupo'), ('grupos'), ('banda'), ('legal'),
  ('cleanup'), ('admin'), ('administrador'), ('soporte'), ('support'),
  ('ayuda'), ('help'), ('config'), ('settings'), ('tienda'), ('store'),
  ('feed'), ('explorar'), ('buscar'), ('search'), ('vibe'), ('vibra'),
  ('www'), ('mail'), ('correo'), ('static'), ('assets'), ('public'),
  ('null'), ('undefined'), ('me'), ('yo'), ('nuevo'), ('new')
on conflict (name) do nothing;

create or replace function public.check_username_not_reserved()
returns trigger
language plpgsql
as $$
begin
  if new.username is not null
     and exists (select 1 from reserved_usernames r where r.name = new.username) then
    raise exception 'El nombre de usuario "%" está reservado', new.username
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_username_not_reserved on profiles;
create trigger trg_username_not_reserved
  before insert or update of username on profiles
  for each row execute function public.check_username_not_reserved();


-- ─── 3) Backfill desde display_name, resolviendo colisiones ───────────────
-- Se normaliza a [a-z0-9_], y si dos perfiles colapsan al mismo valor, el
-- segundo y siguientes reciben un sufijo numérico. Los perfiles más antiguos
-- (created_at más viejo) se quedan con el nombre limpio.

do $$
declare
  fila record;
  base text;
  candidato text;
  n int;
begin
  for fila in
    select id, display_name
    from profiles
    where username is null
    order by created_at nulls last, id
  loop
    -- minúsculas, espacios y guiones → "_", fuera todo lo demás
    base := lower(coalesce(fila.display_name, ''));
    base := translate(base, 'áéíóúüñ', 'aeiouun');
    base := regexp_replace(base, '[\s\-]+', '_', 'g');
    base := regexp_replace(base, '[^a-z0-9_]', '', 'g');
    base := regexp_replace(base, '_+', '_', 'g');
    base := trim(both '_' from base);

    -- Mínimo 3 caracteres; si el nombre no da, se usa un genérico.
    if base is null or length(base) < 3 then
      base := 'artista';
    end if;
    base := left(base, 26);

    candidato := base;
    n := 1;
    while exists (select 1 from profiles p where p.username = candidato)
          or exists (select 1 from reserved_usernames r where r.name = candidato) loop
      n := n + 1;
      candidato := left(base, 26) || n::text;
    end loop;

    update profiles set username = candidato where id = fila.id;
  end loop;
end $$;


-- ─── 4) Recién ahora: único y obligatorio ─────────────────────────────────
-- El índice se crea DESPUÉS del backfill, para que no falle a mitad de camino.

create unique index if not exists profiles_username_unique on profiles (username);

alter table profiles alter column username set not null;


-- ─── 5) Historial: renombrarse no debe romper los enlaces compartidos ─────
-- Un QR impreso o un link en Instagram tiene que seguir funcionando después
-- de que el artista cambie su username. La app consulta esta tabla cuando no
-- encuentra el username actual y responde con un redirect.

create table if not exists username_history (
  old_username citext primary key,
  profile_id uuid not null references profiles(id) on delete cascade,
  changed_at timestamptz not null default now()
);

create index if not exists username_history_profile_idx on username_history (profile_id);

alter table username_history enable row level security;

drop policy if exists "username_history_select_public" on username_history;
create policy "username_history_select_public"
on username_history for select
to anon, authenticated
using (true);

-- Solo la base escribe acá, vía el trigger de abajo.
create or replace function public.record_username_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.username is distinct from new.username and old.username is not null then
    -- Si alguien vuelve a un username que ya tuvo, se libera del historial
    -- para no chocar con el índice único.
    delete from username_history where old_username = new.username;

    insert into username_history (old_username, profile_id)
    values (old.username, new.id)
    on conflict (old_username) do update
      set profile_id = excluded.profile_id, changed_at = now();
  end if;
  return new;
end;
$$;

revoke execute on function public.record_username_change() from public, anon, authenticated;

drop trigger if exists trg_record_username_change on profiles;
create trigger trg_record_username_change
  after update of username on profiles
  for each row execute function public.record_username_change();


-- ─── 6) anon necesita poder leer username ─────────────────────────────────
-- 0003 restringió por columna lo que anon puede leer de profiles; hay que
-- sumar la columna nueva o el perfil público deja de resolver.

do $$
declare
  columnas_publicas text[] := array[
    'id', 'username', 'display_name', 'bio', 'profile_type', 'unified_profile',
    'accent_color', 'musician_roles', 'musician_category', 'created_at'
  ];
  lista text;
begin
  select string_agg(quote_ident(column_name), ', ')
  into lista
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'profiles'
    and column_name = any (columnas_publicas);

  execute 'revoke select on profiles from anon';
  execute format('grant select (%s) on profiles to anon', lista);
  raise notice 'anon ahora puede leer: %', lista;
end $$;


-- ─── 7) Verificación ──────────────────────────────────────────────────────
-- Revisa que cada perfil tenga su username y que no haya duplicados.
select id, display_name, username from profiles order by created_at nulls last;
