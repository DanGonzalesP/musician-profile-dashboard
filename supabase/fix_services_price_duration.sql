-- Campos nuevos del editor de servicios (2026-07-22):
--   * currency      → moneda del precio, igual que en products (merch).
--   * duration_unit → unidad de la duración numérica (min, horas, por clase...).
--
-- La columna `duration` ya existía como texto y ahora guarda solo el valor
-- numérico (ej. "60"); la unidad se guarda aparte en `duration_unit`. Los
-- servicios viejos con `duration` de texto libre siguen mostrándose tal cual.
--
-- Seguro de correr varias veces (idempotente). Mientras no se corra, la app
-- degrada sola: catalog.ts reintenta con el payload legacy si falta la columna.

alter table services add column if not exists currency text default 'USD';
alter table services add column if not exists duration_unit text;
