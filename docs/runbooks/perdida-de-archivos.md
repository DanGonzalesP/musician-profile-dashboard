# Runbook — Un usuario reporta contenido borrado

**Síntoma típico:** "se borraron mis fotos/mi audio". La limpieza tiene
protecciones en aplicación, pero no hay una recuperación de R2 confirmada.

## 1. Rastrear qué pasó

El inventario `media_assets` ata cada objeto de R2 a su dueño y su fecha. Con el
`request_id` de los logs (F12) y el `audit_log` (0008) se reconstruye la
secuencia:

1. Buscar en `media_assets` las filas del perfil afectado (`owner_user_id`).
   ¿Siguen? ¿Con qué `created_at`?
2. Buscar en los logs estructurados eventos de `api/cleanup-orphaned-files` o
   `api/eliminar-cuenta` cercanos a la fecha del reporte (filtrar por
   `request_id`, nunca por PII — no está en los logs).
3. Cruzar con `audit_log`: ¿hubo una acción administrativa?

## 2. Descartar que sea el comportamiento correcto endurecido

Tras F2, la limpieza **no** borra:
- archivos referenciados sólo en borradores (`profile_private.draft_content`),
- archivos con fila en `media_assets` de menos de 7 días,
- nada, si no pudo leer alguna fuente del haystack (aborta con 409).

Si el archivo cae en uno de esos casos, no se borró por la limpieza.

## 3. Evaluar recuperación

- Comprobar si existe una copia independiente del objeto y si fue probada; no
  asumir que un `DELETE` dejó una versión recuperable. Cloudflare documenta el
  borrado de R2 como irreversible y lifecycle como expiración/transición, no
  como backup. Referencias y estado: [`../backups.md`](../backups.md).
- Si existe copia, restaurar primero en un destino aislado, comprobar clave,
  contenido y metadatos, y asociar la fila de `media_assets` correcta antes de
  hacerla visible. La recuperación queda pendiente si no existe copia válida.

## 4. Cerrar

- Confirmar con el usuario si se recuperó; no afirmar restauración hasta
  verificar el objeto servido y la fila de propiedad.
- Si la causa fue un bug, abrir el arreglo con una prueba que lo fije.
- Registrar el incidente y el tiempo de recuperación.

## Prevención ya implementada

- Ventana de gracia de 7 días + haystack completo + aborto ante lectura parcial
  (F2).
- Cuotas (F11) y alertas de gasto acotan el volumen.
- Copia independiente y prueba de restauración de R2 siguen pendientes;
  versioning/delete markers no se consideran una capacidad disponible.
