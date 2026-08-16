# Runbook — Un usuario reporta contenido borrado

**Síntoma típico:** "se borraron mis fotos/mi audio". Es el incidente que este
proyecto ya vivió (el bug de las 1000 filas de PostgREST en el cleanup) y el que
más red de seguridad tiene ahora.

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

## 3. Recuperar

- **Con object versioning en R2** (ver [`../backups.md`](../backups.md)): el
  `DELETE` dejó un marcador, no destruyó el objeto. Restaurar la versión previa
  desde la consola de Cloudflare dentro de la ventana de retención.
- **Sin versioning:** si el objeto no está en R2 y no hay versión, sólo se
  recupera desde un backup de R2 si existe. Este es el escenario que el
  versioning está para evitar — priorizar activarlo (acción humana #15).
- Restaurar además la fila de `media_assets` si se borró, para que el objeto
  vuelva a tener dueño y no sea candidato a una futura limpieza.

## 4. Cerrar

- Confirmar con el usuario que el contenido volvió.
- Si la causa fue un bug, abrir el arreglo con una prueba que lo fije.
- Registrar el incidente y el tiempo de recuperación.

## Prevención ya implementada

- Ventana de gracia de 7 días + haystack completo + aborto ante lectura parcial
  (F2).
- Cuotas (F11) y alertas de gasto acotan el volumen.
- Object versioning en R2 (pendiente, humano) es la última red.
