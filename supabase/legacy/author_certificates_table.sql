-- Certificados de autoría (marcado de tiempo) — registra el hash SHA-256 de
-- cada pista subida junto con el momento oficial en que quedó registrado en
-- Supabase. El PDF del certificado se genera bajo demanda a partir de estos
-- mismos datos, así que no se guarda ningún archivo binario aquí.

create table if not exists author_certificates (
  id bigint generated always as identity primary key,
  profile_id uuid not null references profiles(id) on delete cascade,
  song_title text not null,
  file_hash text not null,
  created_at timestamptz not null default now(),
  unique (profile_id, file_hash)
);

create index if not exists author_certificates_profile_id_idx on author_certificates (profile_id);

alter table author_certificates enable row level security;

-- Igual que en "licenses": el registro ocurre desde el propio editor del
-- artista, autenticado (o con el perfil semilla PROFILE_ID como fallback de
-- demo) — el insert queda atado al dueño real del perfil.
create policy "author_certificates_insert_owner"
on author_certificates for insert
to authenticated
with check (
  profile_id = '00000000-0000-0000-0000-000000000000'
  or profile_id in (select id from profiles where user_id = auth.uid())
);

-- Solo el dueño del perfil (o el perfil semilla PROFILE_ID) puede ver sus
-- propios certificados.
create policy "author_certificates_select_owner"
on author_certificates for select
to anon, authenticated
using (
  profile_id = '00000000-0000-0000-0000-000000000000'
  or profile_id in (select id from profiles where user_id = auth.uid())
);

-- Sin políticas de update/delete a propósito: es un registro de solo-lectura
-- una vez insertado (append-only), igual que "licenses".
