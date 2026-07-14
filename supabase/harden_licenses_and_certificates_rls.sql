-- Cierra las políticas "Always True" de INSERT en licenses/author_certificates.
--
-- Antes: cualquiera (incluso anon) podía insertar una fila con CUALQUIER
-- profile_id — el Security Advisor lo marca porque no hay ninguna
-- restricción real (with check (true)).
--
-- Ahora que License Express y Certificado de Autoría viven exclusivamente en
-- /perfil/legal (ruta que ya exige login), no hace falta permitir inserts
-- anónimos: solo el dueño autenticado del perfil (o el perfil semilla
-- PROFILE_ID para pruebas locales sin cuenta real) puede insertar.

drop policy if exists "licenses_insert_anyone" on licenses;
create policy "licenses_insert_owner"
on licenses for insert
to authenticated
with check (
  profile_id = '00000000-0000-0000-0000-000000000000'
  or profile_id in (select id from profiles where user_id = auth.uid())
);

drop policy if exists "author_certificates_insert_anyone" on author_certificates;
create policy "author_certificates_insert_owner"
on author_certificates for insert
to authenticated
with check (
  profile_id = '00000000-0000-0000-0000-000000000000'
  or profile_id in (select id from profiles where user_id = auth.uid())
);

-- Diagnóstico: corre esto después para ver TODAS las políticas de TODAS las
-- tablas del proyecto (no solo profiles/profile_blocks) y detectar cuáles de
-- las 6 advertencias siguen abiertas. Cualquier fila con qual = "true" o
-- with_check = "true" en una tabla que no deba ser pública es sospechosa.
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, cmd;
