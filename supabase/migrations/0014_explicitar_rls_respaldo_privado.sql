-- ═══════════════════════════════════════════════════════════════════════════
-- 0014_explicitar_rls_respaldo_privado.sql — Cierra el último INFO de RLS.
--
-- 0013 sacó `_backup_profiles_20260805` del esquema expuesto y revocó todos
-- sus privilegios. El Security Advisor revisa también esquemas privados y, de
-- forma correcta, pide que el deny-all de una tabla con RLS sea explícito.
--
-- No cambia acceso ni datos: documenta en la propia base el cierre que ya
-- existía por ausencia de políticas y privilegios.
--
-- Idempotente. Correr DESPUÉS de 0013.
-- ═══════════════════════════════════════════════════════════════════════════

drop policy if exists "backup_profiles_deny_direct_access"
  on private._backup_profiles_20260805;

create policy "backup_profiles_deny_direct_access"
on private._backup_profiles_20260805
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

revoke all on table private._backup_profiles_20260805 from public, anon, authenticated;

-- Verificación de solo lectura: una fila, RESTRICTIVE, false/false.
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'private'
  and tablename = '_backup_profiles_20260805'
  and policyname = 'backup_profiles_deny_direct_access';
