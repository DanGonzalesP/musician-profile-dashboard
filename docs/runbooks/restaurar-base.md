# Runbook — Restaurar la base de datos

**Cuándo:** corrupción de datos, borrado masivo accidental, o migración que dejó
la base inconsistente y el rollback de código no basta.

**Quién:** operador autorizado con acceso de administración a Supabase y
al respaldo. No se usa service role desde la app para esto.

## A. Restauración completa

1. **Contener.** Detener las escrituras que agravan el incidente. El destino
   autorizado es Cloudflare. Una versión anterior sólo puede promoverse si
   respeta las migraciones y protocolos actuales; no basta con que compile.
2. **Elegir el punto de restauración.** Supabase → Database → Backups. Anotar la
   fecha/hora del backup elegido (es el RPO real de este incidente).
3. **Restaurar a un destino aislado.** Usar una base **vacía** para
   verificar antes de sobrescribir producción. Nunca restaurar "a ciegas"
   encima de la base viva.
4. **Verificar** contra el destino:
   - `pnpm smoke <url-destino>` (health, 401 de cleanup, 400 de image-proxy).
   - Comparar esquema, roles, cantidades y huellas del contenido de las tablas
     respaldadas. Incluir Auth, permisos y referencias de medios.
   - Restaurar y comprobar los bytes de los archivos: restaurar sus filas de
     inventario no los recupera.
5. **Promover.** Repuntar la app al proyecto restaurado (o restaurar sobre
   producción una vez verificado el destino).
6. **Registrar** en [`../backups.md`](../backups.md): fecha, qué se restauró,
   tiempo (RTO real), resultado.

## B. Restaurar un solo perfil

Cuando sólo se perdió/corrompió un perfil, no toda la base:

1. Restaurar el backup a un destino aislado (pasos A.2–A.3).
2. Localizar las filas del perfil por `username` o `user_id`:
   `profiles`, `profile_blocks`, `music_feed`, `products`, `services`,
   `media_assets`.
3. Exportar esas filas del destino e insertarlas en producción, respetando el
   orden de FKs (`profiles` primero).
4. Para los archivos, ver [`perdida-de-archivos.md`](perdida-de-archivos.md).
5. Verificar el perfil en el navegador. Registrar.

## Notas

- Restaurar primero el esquema compatible con el respaldo. Si éste es anterior
  a la versión que se recuperará, aplicar después las migraciones faltantes
  en orden y verificar compatibilidad antes de conectar la aplicación.
- Ensayo local del 2026-11-05: base exclusiva con TCP desactivado antes de
  importar, 58 tablas cotejadas por SHA-256 y posterior aplicación0018–0037.
  Ver evidencia y límites en `../backups.md`; no representa aún recuperación
  de archivos ni del servicio completo.
- Toda restauración se **prueba** al menos trimestralmente aunque no haya
  incidente (ver `backups.md`).
