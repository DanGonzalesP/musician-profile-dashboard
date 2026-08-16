# Backups y restauración — Vibe

Cierra **P-25**. Un backup que nunca se restauró no es un backup: es una
esperanza. Este documento define qué se respalda, con qué frecuencia, dónde
vive, cuánto se retiene, y **el registro fechado de cada prueba de
restauración**.

## Qué se respalda

| Fuente | Qué contiene | Mecanismo | Frecuencia | Retención |
|---|---|---|---|---|
| **Postgres (Supabase)** | perfiles, bloques, catálogo, moderación, auditoría | Backups automáticos de Supabase (según plan) | diario | ≥ 7 días (subir a 30 si el plan lo permite) |
| **R2 (Cloudflare)** | imágenes, audio, video de los perfiles | Object versioning + lifecycle | continuo | versiones ≥ 30 días |
| **Migraciones** | el esquema como código | Git (`supabase/migrations/`) | cada commit | permanente |

`media_assets` es el inventario que ata cada objeto de R2 a su dueño: es la
pieza que hace **rastreable** una restauración parcial (ver runbook
[`perdida-de-archivos.md`](runbooks/perdida-de-archivos.md)).

## Por qué R2 necesita versioning (crítico)

`/api/eliminar-cuenta` y `/api/cleanup-orphaned-files` **borran objetos de R2**.
F2 endureció la limpieza (ventana de gracia de 7 días, aborta ante lectura
parcial), pero un `eliminar-cuenta` legítimo pero equivocado, o un bug futuro,
borra sin red. **Object versioning + lifecycle en R2** es esa red: un `DELETE`
crea un marcador, no destruye el objeto, y se puede recuperar dentro de la
ventana de retención.

Sin versioning, un borrado es irreversible. Con él, es recuperable. Es la
diferencia entre "perdimos las fotos de un artista" y "las restauramos en 10
minutos".

## RTO y RPO declarados

- **RPO (Recovery Point Objective):** ≤ 24 h para Postgres (backup diario),
  ≤ 0 para el esquema (está en Git). Objetivo a mejorar con PITR si el plan de
  Supabase lo ofrece.
- **RTO (Recovery Time Objective):** ≤ 2 h para una restauración completa,
  medido en la prueba de restauración (abajo). Se ajusta con la cifra real.

## Prueba de restauración — registro fechado

**Un backup no probado no cuenta.** Procedimiento: tomar un backup, restaurarlo
en un proyecto **vacío**, levantar la app contra él, medir el tiempo.

| Fecha | Qué se restauró | Destino | Tiempo | Resultado | Quién |
|---|---|---|---|---|---|
| _(pendiente)_ | backup completo Postgres | proyecto vacío | — | — | — |

> **Acción humana #14.** Esta prueba requiere acceso a la consola de Supabase y
> crear un proyecto de destino. No se puede ejecutar desde el repositorio. La
> tabla se llena la primera vez que se corre y se repite trimestralmente.

## Checklist de estado

- [x] Documentado (este archivo).
- [ ] Backups automáticos de Supabase confirmados activos — **humano**.
- [ ] Object versioning + lifecycle en R2 — **acción humana #15**.
- [ ] **Al menos una restauración completa ejecutada y fechada** — **humano**.
- [ ] RTO/RPO validados con cifras reales — tras la primera restauración.

Runbooks relacionados: [`restaurar-base.md`](runbooks/restaurar-base.md),
[`perdida-de-archivos.md`](runbooks/perdida-de-archivos.md).
