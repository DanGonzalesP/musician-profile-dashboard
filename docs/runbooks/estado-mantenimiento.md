# Supervisar cierres y reservas vencidas

La vista `/admin/mantenimiento` consulta `media_maintenance_overview()` de0058.
Sólo owner/maintenance con auth.uid() real pueden ejecutarla; moderator, usuario
común y anon no reciben el resumen. No se conceden permisos sobre tablas privadas.
No muestra propietarios, claves de archivos, tokens, firmas ni configuración.

Muestra cierres pendientes y su fecha más antigua, reservas pendientes cuya firma
venció, trabajos con lease vigente/vencido, bloqueados, esperando reintento y
cierres aún sin trabajo. Las categorías pueden coincidir: no sumar columnas.
Excluye leases históricos de cuentas cerradas o sin trabajo pendiente. La
consulta es de sólo lectura: no reclama trabajos ni desbloquea inventarios.

Ante bloqueo o lease vencido, revisar logs del ejecutor y sus bindings/secretos
en el entorno correspondiente sin copiarlos al chat. Un lease vigente no prueba
que el ejecutor siga vivo; cero pendientes no demuestra cron/alertas configurados.
No se elige un SLA ni una retención legal a partir de estas cifras.

Actualizar es manual; no genera sondeo continuo. Cambiar cuenta elimina el
resumen, fija cada consulta al JWT observado y descarta resultados anteriores.
Si falta permiso o migración muestra error, nunca ceros inventados. El enlace
a limpieza manual conserva su alcance propio y no permite forzar cierres ajenos.

Pendiente al final: anon/usuario/moderador/maintenance/owner y revocación; colas
vacías, cierres sin lease, vencimiento, bloqueados/reintento, cuentas cerradas,
reservas completadas; cambio de cuenta/respuesta tardía, teclado/axe y referencias
visuales. Aplicar0058 no sustituye estas pruebas. Alertas externas, responsables
y operación real del Worker siguen pendientes de aceptación.

## Diagnóstico del ejecutor

El Worker registra cada invocación con un `requestId` aleatorio, sin identificadores
de personas, claves de objetos ni contenido de respuestas. Una invocación con el
interruptor apagado deja `estado: disabled`; no equivale a una ejecución correcta.
Con el interruptor encendido registra inicio y después `idle` (sin tarea disponible)
o `completed` (lote finalizado). `idle` no garantiza que toda la cola esté vacía:
pueden existir trabajos aún no elegibles.

Los fallos indican `fase`: `configuration` (configuración incompleta o inválida),
`claim` (solicitud o respuesta de asignación), `blocked` (inventario bloqueado),
`storage` (marcador de retirada en R2), `retire` (confirmación en la base) o
`finish` (finalización del lote). Las cantidades `archivosPrevistos` y
`archivosRetirados` describen sólo ese lote; retirados cuenta confirmaciones
recibidas, no intentos ni todo el historial. Un error de red puede ocurrir después
de que la base haya aceptado una operación. No repetir retiradas manualmente
basándose sólo en estos contadores; conservar el mecanismo de leases y reintentos.

Inicio sin resultado final requiere revisar la ejecución en Cloudflare: una
interrupción del proceso puede impedir registrar el fallo. La ausencia de registros
no demuestra que no haya pendientes. Estos registros facilitan el diagnóstico,
pero **no configuran alertas externas ni un monitor de ausencia de ejecuciones**.
El interruptor del archivo de despliegue sigue apagado.

Casos añadidos para la etapa final de pruebas: apagado, configuración ausente,
cola sin tarea, bloqueo, fallo de asignación/R2/confirmación/finalización, lote
parcial y lote vacío; correlación inicio/resultado y ausencia de datos privados.
El observador opcional de progreso no altera el contrato `Promise<void>` ni debe
interrumpir el trabajo si falla.

## Recuperación de borrados interrumpidos —0066

Implementación pendiente de validación. El mantenimiento también selecciona
reclamaciones de borrado persistidas hace más de cinco minutos: estado deleting,
propiedad coincidente entre lifecycle e inventario, key canónica del propietario,
sin referencias y sin retirada ya confirmada a cero bytes. No busca objetos
sueltos en R2 ni deduce propiedad de nombres históricos.

El propósito retirement usa los mismos leases y lotes de20, marcador vacío y
confirmación firmada. Un fallo parcial puede retomarse después del lease; el
estado durable sobrevive al cierre del navegador. La reclamación autenticada
adopta orden de bloqueos cuenta→lifecycle. Los cierres ya iniciados conservan
prioridad por cuenta y su procedimiento completo; no se reabren cuentas.

El panel suma borrados elegibles como “Borrados interrumpidos recuperables”.
No incluye solicitudes que nunca llegaron a reclamarse ni objetos de propiedad
ambigua, y no prueba que el cron esté activo. La implantación remota debe llevar
0066 antes de esta versión del panel, que rechaza resúmenes incompletos.

Pendientes al final: fallo entre claim/PUT/retire, lease vencido, dos ejecutores,
reintento tras respuesta perdida, referencia concurrente, propietario diferente,
key histórica ambigua, cuenta cerrándose y exclusión de retiradas confirmadas.
