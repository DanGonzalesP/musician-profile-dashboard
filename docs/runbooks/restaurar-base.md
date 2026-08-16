# Runbook — Restaurar la base de datos

**Cuándo:** corrupción de datos, borrado masivo accidental, o migración que dejó
la base inconsistente y el rollback de código no basta.

**Quién:** persona con acceso a la consola de Supabase. **No** se usa service
role desde la app para esto.

## A. Restauración completa

1. **Contener.** Poner la app en mantenimiento si el daño sigue creciendo
   (variable de entorno o promover un deploy anterior en Vercel).
2. **Elegir el punto de restauración.** Supabase → Database → Backups. Anotar la
   fecha/hora del backup elegido (es el RPO real de este incidente).
3. **Restaurar a un proyecto de destino.** Preferir un proyecto **vacío** para
   verificar antes de sobrescribir producción. Nunca restaurar "a ciegas"
   encima de la base viva.
4. **Verificar** contra el destino:
   - `pnpm smoke <url-destino>` (health, 401 de cleanup, 400 de image-proxy).
   - Contar filas de `profiles`, `profile_blocks`, `music_feed` y compararlas
     con lo esperado.
5. **Promover.** Repuntar la app al proyecto restaurado (o restaurar sobre
   producción una vez verificado el destino).
6. **Registrar** en [`../backups.md`](../backups.md): fecha, qué se restauró,
   tiempo (RTO real), resultado.

## B. Restaurar un solo perfil

Cuando sólo se perdió/corrompió un perfil, no toda la base:

1. Restaurar el backup a un proyecto de destino (pasos A.2–A.3).
2. Localizar las filas del perfil por `username` o `user_id`:
   `profiles`, `profile_blocks`, `music_feed`, `products`, `services`,
   `media_assets`.
3. Exportar esas filas del destino e insertarlas en producción, respetando el
   orden de FKs (`profiles` primero).
4. Para los archivos, ver [`perdida-de-archivos.md`](perdida-de-archivos.md).
5. Verificar el perfil en el navegador. Registrar.

## Notas

- El **esquema** siempre está en Git (`supabase/migrations/`): una restauración
  de datos no debe traer un esquema viejo. Si el backup es anterior a una
  migración, aplicar las migraciones faltantes tras restaurar.
- Toda restauración se **prueba** al menos trimestralmente aunque no haya
  incidente (ver `backups.md`).
