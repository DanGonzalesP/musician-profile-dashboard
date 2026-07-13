-- Historial de licencias emitidas por el Generador de Licencias Express.
-- Guarda solo los datos en texto/jsonb (no el PDF binario): el PDF se puede
-- regenerar de forma idéntica en cualquier momento a partir de estas mismas
-- columnas, así que no hace falta un bucket de Storage para esta feature.

-- Ya existía una tabla "licenses" vacía (solo id/created_at, creada antes
-- por error) — se borra primero para recrearla completa. No hay pérdida de
-- datos: está vacía.
drop table if exists licenses cascade;

create table licenses (
  id bigint generated always as identity primary key,
  profile_id uuid not null references profiles(id) on delete cascade,
  artist_name text not null,
  artist_legal_name text,
  artist_dni text,
  organizer_name text not null,
  event_date date not null,
  event_end_date date,
  songs jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index licenses_profile_id_idx on licenses (profile_id);

alter table licenses enable row level security;

-- Cualquiera puede registrar una licencia generada (incluye al organizador
-- anónimo generándola desde la página pública del artista) — el registro es
-- justamente la prueba de que se emitió, sin importar quién la generó.
create policy "licenses_insert_anyone"
on licenses for insert
to anon, authenticated
with check (true);

-- Pero el historial solo lo puede LEER el dueño del perfil (o el perfil
-- semilla PROFILE_ID que usa este proyecto como fallback de demo).
create policy "licenses_select_owner"
on licenses for select
to anon, authenticated
using (
  profile_id = '00000000-0000-0000-0000-000000000000'
  or profile_id in (select id from profiles where user_id = auth.uid())
);

-- Sin políticas de update/delete a propósito: el historial queda como un
-- log de solo-lectura una vez insertado (append-only).
