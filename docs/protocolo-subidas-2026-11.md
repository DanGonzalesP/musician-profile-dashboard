# Protocolo de reservas, finalización y retirada — noviembre 2026

Estado: protocolo conectado a los clientes actuales para las nuevas subidas.
`/api/upload-url` reserva espacio; el cliente compartido `lib/upload-protocol`
realiza PUT condicional, y la finalización verifica HEAD y emite el recibo antes
de devolver la URL. El editor y el catálogo usan el mismo protocolo. Esto no
cierra la eliminación de cuenta ni las escrituras directas heredadas.

## Decisiones implementadas

### Recuperación en el cliente preparada el 6 de noviembre (sin validar)

El editor y los formularios de catálogo conservan en memoria el intento de subida:
archivo preparado, identificador de reserva y cuenta. El editor separa además
perfil y calidad de audio. Reintentar reutiliza esos bytes y esa reserva; no
recomprime ni cambia de identificador por un fallo de red. Cambiar de cuenta
impide continuar el intento anterior. No persiste archivos ni tokens en disco.

Si el PUT se confirmó, el siguiente intento repite HEAD/finalización. Si se perdió
su respuesta, primero intenta esa misma confirmación: sólo devuelve la URL cuando
el servidor verifica el objeto y la URL coincide con la key esperada. Un 404/409
permite volver a solicitar la misma reserva; errores de conexión, permisos, 429
o 5xx no se interpretan como ausencia del archivo. Nunca sobrescribe el objeto:
PUT conserva `If-None-Match: *`.

Las peticiones API tienen un plazo de 30 segundos que incluye leer su respuesta;
cada PUT tiene un plazo de 5 minutos. El reintento automático sigue limitado a
dos intentos por paso. Estos plazos no representan un máximo para toda la
publicación, que puede incluir conversión, varios archivos y varios pasos. Un
timeout aborta la espera del navegador, no garantiza que el servidor haya parado.
Por eso se conserva la reserva y se verifica el resultado antes de repetir.

El editor transmite su señal de cancelación a la preparación de imágenes y
audio, la reserva, el PUT y la finalización. Un cambio de cuenta o desmontaje
interrumpe la espera y evita nuevos reintentos automáticos y confirmaciones de
ese envío. No revierte lo que el servidor ya recibió. La reserva y los bytes
preparados permanecen en el intento mientras siga referenciado; una nueva
ejecución con una señal vigente consulta la misma reserva. La cancelación de
compresión no se convierte en una subida del original. Estas rutas están
implementadas, pendientes de las pruebas finales.

Cerrar o recargar la página pierde esta recuperación en memoria. Si la reserva
venció y el archivo no llegó, es necesario seleccionar el archivo de nuevo; el
cliente no prolonga el vencimiento ni crea otra reserva silenciosamente. Los
ensayos de timeout, respuesta perdida, CORS, cambio de sesión, caducidad y
publicación parcial quedan para la etapa final: **código preparado, no evidencia
de cierre de los puntos 1/4**.

Las migraciones 0031–0032 añaden reservas persistentes por key, separadas del inventario
visible. 0032 conserva la fila de propiedad de los marcadores vacíos y protege
las reservas frente a cambios/borrados directos del inventario. La suma y la creación de una reserva se serializan con un bloqueo por
cuenta. Una reserva pendiente cuenta para la cuota. Borrar directamente su fila
en `media_assets` no libera su espacio. Los archivos históricos también se suman;
en modo estricto, un tamaño histórico desconocido impide una nueva reserva.
El modo observación conserva su comportamiento y devuelve el exceso medido.

Cada operación combina el JWT real del propietario con un recibo HMAC emitido
por el servidor. El recibo incluye actor, propósito, key, metadata, identificador
de clave y fecha. Postgres verifica la firma y una ventana de 60 segundos. La
clave queda en una tabla privada sin permisos de cliente; no es una service role.
Sin una clave provisionada, el protocolo falla cerrado. Se admiten identificadores
distintos para rotación y para pruebas efímeras sin sobrescribir claves existentes.
Las claves no forman parte de las migraciones ni se imprimen en las pruebas.

También se corrigió el cliente S3: ahora no calcula un checksum opcional sobre
un cuerpo ausente al firmar una subida directa. Una prueba con el presigner real
reprodujo el parámetro CRC32 del cuerpo vacío antes de la corrección. La validación
final del cuerpo corresponde a HEAD y al protocolo. Referencia del SDK:
[checksums S3](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/s3-checksums.html).

`reserve_media_upload` conserva el vencimiento original al reintentarse.
`finalize_media_upload` exige recibo del objeto verificado, tamaño/tipo iguales
a la reserva y un ETag estable. Los triggers de las seis fuentes de referencias
rechazan publicar reservas pendientes. La adquisición atómica de la key evita
que una publicación concurrente se interponga entre comprobarla y reservarla.

`begin_media_account_closure` impide nuevas reservas/finalizaciones del protocolo
y se puede reintentar. `retire_media_upload` solo libera la reserva después de
una reclamación de borrado y un recibo del servidor que confirma cero bytes en R2.

## Congelación y supresión recuperable — migración 0034

`0034_congelacion_y_supresion_recuperable.sql` está aplicada localmente. Al
iniciar el cierre, congela escrituras `INSERT`/`UPDATE`/`DELETE` de las tablas
de perfil, bloques, contenido, catálogo, feed, membresías, preguntas, solicitudes,
licencias, certificados, bloqueos, reportes e inventario de medios enumeradas
por `guard_account_writes`. La cuenta pasa a `closing`, el perfil se suspende y
sus archivos quedan reclamados para eliminación. Los intentos de escritura se
rechazan mientras dure el cierre, incluidos los cambios asociados a perfiles
compartidos.

La eliminación es por tandas de hasta 25 keys. `lib/account-media.ts` pide el
lote a `get_media_account_closure_batch`, retira cada objeto y vuelve a consultar
el estado. `retire_media_upload` verifica el recibo firmado y registra hora y
ETag; deja `media_assets` como marcador de cero bytes, conservando la fila de
propiedad, y mantiene el recibo de retirada. El inventario no se borra para
simular la eliminación del objeto. La RPC final solo se invoca cuando el lote
no está bloqueado y no quedan archivos pendientes; de otro modo el proceso puede
reanudar en una petición posterior.

Los históricos sin reserva siguen bloqueados mientras no haya evidencia operativa
de que las credenciales antiguas no pueden escribir y las escrituras en vuelo ya
se drenaron. No se ha acreditado ese drenaje; por tanto no se habilita su
supresión por esta migración. El cierre 2 sigue incompleto: faltan un ejecutor
sin sesión, una política de retención definida, resolver cachés y URLs antiguas,
y evidencia remota de almacenamiento.

## Transporte R2 y siguiente integración

Para nuevas subidas, firmar `If-None-Match: *`, tipo y longitud. El navegador envía
el encabezado condicional y finaliza mediante el servidor después del PUT. El
servidor verifica HEAD y el recibo antes de devolver la URL; el recibo no se envía
al navegador.
Cloudflare documenta evaluación atómica de condiciones de PUT al confirmar la
escritura: [compatibilidad S3](https://developers.cloudflare.com/r2/api/s3/api/).
No confundir una prueba con mocks con evidencia de ese comportamiento en R2 real.

Tras reclamar una key, sustituir el contenido por un marcador vacío, en vez de
dejar la key inexistente: así un PUT condicional que llegue tarde no puede reponer
el archivo. La API de entrega deberá denegar contenido retirado. La política de
retención de estos marcadores (sus keys contienen UUID) y la eliminación física
final requieren cerrarse con la retención operativa/legal. No prometer supresión
total de datos personales solamente por escribir cero bytes.

## Corte de escrituras directas — migración 0035

Aplicada localmente después de 0034. Revoca los permisos directos de escritura
del inventario para visitantes y usuarios, y elimina las políticas permisivas
de INSERT/DELETE. El usuario conserva SELECT privado bajo RLS. Las RPC de
reserva y retirada mantienen sus validaciones de JWT, recibo y bloqueo de cuenta;
no necesitan duplicarse ni habilitar otro contexto de escritura.

No cambia ni elimina filas históricas. Los clientes antiguos reciben denegación
en lugar de poder crear inventario sin reservar, reducir bytes o borrar filas
para liberar cuota. Los fixtures históricos se preparan administrativamente en
la base local; las aserciones de permisos, cuota y exportación usan JWT reales.
La aplicación remota exige el corte coordinado con clientes y respaldo previo.

Trabajo aún pendiente, en orden:

1. Reconciliar tamaños históricos y limpiar reservas abandonadas con retirada
   verificada. 0035 cierra las escrituras directas; no acredita estos otros pasos
   ni activa por sí sola el modo estricto de cuota en producción.
2. Con 0034 aplicada, completar la operativa recuperable: definir un ejecutor
   sin sesión personal ni service role en el runtime, y acreditar el drenaje de
   credenciales antiguas y operaciones en vuelo antes de desbloquear históricos.
   Cierre 2 no está completado.
3. Provisionar el entorno empresarial, actualizar CORS para `If-None-Match`
   y verificar el protocolo en R2 real. El Worker local con claves efímeras
   ya pasó la suite 0034; esa evidencia no sustituye la verificación remota.

Las rutas de subida y retirada individual llaman al protocolo.
El transporte compartido hace como máximo dos intentos por etapa ante fallo de
red o HTTP 5xx, con una espera de 250 ms. Reutiliza el identificador y cuerpo de
reserva, el PUT condicional y la key de finalización. No reintenta automáticamente
4xx (incluidos permisos, cuota y límite); un 412 de PUT sigue requiriendo HEAD y
confirmación SQL. Esto cubre el reintento dentro de esa llamada, no la recuperación
tras cerrar la pestaña ni la limpieza de reservas que agoten ambos intentos.
`delete-file` y cleanup usan marcadores vacíos, y retire firmado se aplica a
casos históricos. La ruta de eliminación de cuenta y `lib/account-media.ts` ya
integran el cierre recuperable de 0034. Los gates de navegador y Worker local
pasaron38/38 cada uno, incluido el cierre y la continuación202. Faltan entrega privada y
revocación de URLs antiguas, limpieza de reservas abandonadas, retención y
mediciones de rendimiento/coste.

## Verificación

Para 0034, la base local reportó 166 pruebas / 14 archivos con exit 0
(`avance-0034-db-final.log`); la reconstrucción desde 0000 hasta 0034 terminó
con exit 0 (`avance-0034-reconstruccion.log`). Estos resultados acreditan esos
dos comandos locales solamente; no acreditan credenciales antiguas drenadas,
operación remota, ejecutor de reintentos, retención ni resolución de cachés/URLs.
Además, QA392/392, build Next, auth38/38, Worker38/38 con WAV real y D1/R2,
público112/112, visualauth4ARIA y visualpúblico24ARIA terminaron exit0;
24 capturas de píxeles se omitieron. Ver `RESULTADOS_PRUEBAS.md` para comandos
y logs de esta versión; no son pruebas de staging remoto.

La primera reconstrucción detectó un error de sintaxis en una expresión CASE.
La transacción falló, sin aplicar 0031; se corrigió antes de su primera aplicación
exitosa. Después la migración se aplicó en reconstrucción aislada y base local,
y el lint de esquemas public/private no detectó errores ni advertencias.

La evidencia histórica de 0033 incluye QA, DB, auth y visual-auth con
respectivamente 366/38 archivos, 159/13, 34 y 4 instantáneas ARIA; esos gates
pasaron para ese estado anterior, no para 0034. OpenNext Worker autenticado
pasó 34/34 en 2.8 minutos, incluidas conversión WAV real, cuatro etiquetas de
perfil invalidadas en D1 y comprobación de caché R2
(`avance-0033-worker.log`, exit 0). Es evidencia histórica de 0033 y no valida
el cierre 0034. El fixture
HTTPS local soporta PUT/HEAD y condiciones, pero no valida firmas S3 ni CORS real;
no acredita comportamiento en R2 remoto o staging. Las aserciones DB
utilizan usuarios efímeros con JWT real;
el acceso de administración solo provisiona/retira su propia clave efímera y usuarios.
