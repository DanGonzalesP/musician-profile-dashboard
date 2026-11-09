# Observabilidad — Vibe

Estado de implementación local, 6 de noviembre de 2026. Este documento sustituye
las afirmaciones históricas de despliegue y pruebas de esta guía. El cierre23
sigue abierto: configuración en archivos no acredita recepción de registros o
alertas en producción. Las pruebas recientes están diferidas por el titular.

## Registros de aplicación

`lib/log.ts` emite una línea JSON con `nivel`, `ruta`, `mensaje`, `ts` y campos
operativos opcionales, incluidos `requestId`, `duracionMs` y `resultado`.
Los mensajes deben ser constantes; no pasar texto del usuario ni respuestas de
proveedores como mensaje. La redacción de campos limita profundidad, longitud,
arrays y claves sensibles; no reconoce cualquier dato personal en texto libre.

`logError` omite el error original y conserva únicamente un código con formato
SQLSTATE/PostgREST reconocido, además de `omitido: true`. No registra su mensaje,
detalles ni pila. Esta garantía corresponde a `logError`, no a pasar un objeto
Error arbitrario a otros campos del logger.

`idDePeticion` acepta `cf-ray` hexadecimal con sufijo de centro de datos opcional,
o `x-request-id` con formato UUID; genera uno si los valores no son válidos.
Las cabeceras no acreditan identidad ni autorización. El formato acotado evita
copiar texto arbitrario del cliente al campo de correlación.

El contrato actual admite `userId`. Debe tratarse como identificador vinculable
a una cuenta, no como dato anónimo. No añadir correos, nombres, documentos,
contenido de perfiles, prompts, cookies, tokens, claves ni URLs firmadas.
Limitar acceso a registros y aplicar la política de retención aprobada; no
exportar registros reales a incidencias públicas.

## Salud del servicio

`GET /api/health` comprueba una lectura de Supabase y HeadBucket de R2. Devuelve
200 con estado `ok` si ambas responden correctamente, o503 con `degradado`.
No acredita inicio de sesión, recuperación, reproducción, subida ni publicación.
La respuesta contiene versión y estados, sin nombres de buckets ni URL interna.
Usa `Cache-Control: no-store`.

Cada consulta de dependencia tiene límite3s y señal de cancelación; el timer se
limpia al terminar. Antes se evalúa el rate limit anónimo distribuido, que puede
responder429 o503 si no puede autorizar la consulta. No interpretar todas las
respuestas no200 como la misma avería ni eludir el límite para monitorizar.

El monitor de portada+health está preparado en
`scripts/comprobar-disponibilidad.mjs` y `.github/workflows/disponibilidad.yml`.
Está desactivado hasta configurar expresamente las variables del repositorio.
Consultar [activación y respuesta a fallos](runbooks/disponibilidad.md).
No se ha acreditado ejecución programada ni recepción de avisos.

## Cuotas y mantenimiento

La ruta de reservas registra `reserva por encima de cuota en observación` con
`requestId` y `modo`. El comportamiento se obtiene de `modoCuota()` y de la
reserva atómica en Postgres. Sin modo válido se exige la cuota; observar sólo
se activa con el valor explícito `observar` y no equivale a imponer un límite.
No afirmar el modo remoto a partir del valor por defecto del código.
La cuota no es un límite de gasto del proveedor ni controla toda transferencia.

El Worker de mantenimiento registra inicio, resultado y fase de fallo mediante
el mismo logger, sin contenido de archivos. Su configuración local no demuestra
que esté desplegado o ejecutándose. Véanse
[estado de mantenimiento](runbooks/estado-mantenimiento.md) y
[limpieza manual](runbooks/limpieza-manual.md).

## Pendientes de operación

- Verificar en el Worker empresarial la llegada de registros estructurados,
  versión desplegada, permisos de lectura y retención efectiva.
- Designar responsable y suplente; preparar alertas de errores sostenidos,
  disponibilidad y gasto dentro de recursos autorizados y límites existentes.
- Ejecutar fallos controlados al final, acreditar recepción y respuesta, y
  comprobar recuperación y funcionamiento del propio monitor.
- Documentar límites de entrega, periodos de consulta y umbrales acordados.
  No habilitar nuevos planes, destinos de logs ni aumentos de facturación.

`observability.enabled` en `wrangler.jsonc` es configuración preparada, no
prueba de ingestión remota. No hay evidencia vigente que permita afirmar que
Logpush, un agregador externo o alertas de gasto estén activos.
Retención y procedimientos: [retención de datos](retencion-de-datos.md).
