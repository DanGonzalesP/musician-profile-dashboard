# Integridad del ciclo de vida de medios — 2026-11-05

## Estado vigente

La base local llega a 0037. Las reservas y retiradas requieren un recibo
verificado y la identidad real del usuario. El inventario ya no admite escritura
directa de clientes, incluso sobre filas propias o históricas; sólo lectura bajo
RLS. El cierre de cuenta congela escrituras y procesa lotes recuperables.
La retirada sustituye bytes por un marcador vacío en R2 y conserva la fila de
propiedad; no elimina físicamente la key. Ver [protocolo vigente](protocolo-subidas-2026-11.md)
y [resultados por versión](../RESULTADOS_PRUEBAS.md).

0036 incorpora mantenimiento sin sesión, acreditado en Worker/R2 local con
Supabase real: recuperación tras fallo parcial, retirada de reserva vencida,
PUT tardío rechazado y cierre de21 objetos en dos tandas sin afectar otra cuenta.
Log lectura-0037-mantenimiento-final.log. Se corrigió redirect:error (no admitido
por workerd) por manual, rechazando respuestas3xx sin seguirlas.
0037 incorpora lectura revocable, descrita a continuación, probada también en
Worker40/40. Persisten drenaje histórico, retención, corte de URLs antiguas/cachés
y validación remota. No confundir estas pruebas locales con el cierre global.
Los bloques siguientes documentan el diseño y evidencia anteriores a 0031;
sus descripciones de rutas no representan la implementación vigente.

## Lectura revocable — 0037

`GET` y `HEAD /api/media/[...key]` consultan `resolve_media_read` en cada
petición, con anon o el JWT real de la sesión SSR/Bearer. No usan service role,
no redirigen a una URL firmada y no almacenan autorización en caché. El objeto
debe estar inventariado, activo, finalizado y con tipo/tamaño coincidentes en R2.
Una cuenta en cierre deja de poder leerlo, incluido su propietario.

La base distingue referencias públicas de borradores, bloques ocultos y catálogo
inactivo. Copiar una key ajena a otro perfil no concede permiso. Una referencia
pública válida permite lectura anónima, salvo suspensión del perfil autorizado;
el propietario/administrador conserva gestión privada durante suspensión. Las
reservas del editor incluyen profileId para atribuir correctamente medios de grupos.

Audio/vídeo aceptan un único rango de bytes validado; los rangos no revelan tamaño
antes de autorizar. Respuestas con `no-store` para navegador/CDN, `nosniff` y CSP
restrictiva. HEAD no descarga el cuerpo. El handler calcula Content-Length, pero
Next16.4.5 lo filtra al escribir HTTP (`next/dist/server/send-response.js`).
Su presencia es opcional en HEAD según [RFC9110 §8.6](https://www.rfc-editor.org/rfc/rfc9110.html#section-8.6).
El E2E exige estado, tipo, rangos, ausencia de cuerpo y no-store; si el runtime
conserva el tamaño debe ser exacto. El test unitario exige el tamaño del handler.

`media-url.ts` reconoce sólo el origen histórico configurado y keys válidas;
transforma bloques, catálogo, borradores, feed y metadatos sociales. Finalización
emite `/api/media/...`. La limpieza compara por key para no retirar el mismo
archivo al cambiar de URL. `image-proxy` y la imagen social usan la misma entrega
autorizada; no conservan un fetch alternativo al origen antiguo.

Evidencia local: DB186 y auth40 aprobadas, incluyendo lectura privada previa,
publicación, GET íntegro, rango206, HEAD y suspensión/restauración sobre la misma
URL en escritorio y móvil. El fixture de almacenamiento no valida firmas S3 ni
CORS real; el resto de gates se registra en RESULTADOS_PRUEBAS.

**El punto3 sigue parcial.** Antes del corte remoto hay que reconciliar históricos
con media_assets, aplicar migraciones con respaldo, verificar clientes y desactivar
los orígenes públicos anteriores con purga de cachés. Cambiar URLs en el render no
revoca enlaces públicos ya conocidos. No borrar archivos ni deshabilitar el origen
antes de verificar que el destino puede servir el inventario completo. Tampoco se
pueden retirar copias que un visitante ya haya descargado fuera de Vibe.

## Historial de estado y alcance — 0026–0030

El trabajo local de las migraciones 0026–0030 establece un ledger privado de
referencias y reclamaciones de borrado. Es evidencia parcial para los cierres 1 y
5; no cierra la eliminación global de cuentas ni el ciclo completo de subida.
Las migraciones remotas 0018–0030 siguen pendientes de un corte coordinado.

Se protegen las seis fuentes que pueden contener referencias: `profiles`,
`profile_blocks`, `profile_private` (borradores), `products`, `services` y
`music_feed`. Los triggers transaccionales mantienen `private.media_references`
y bloquean las keys afectadas en orden estable. `claim_media_deletion` toma el
mismo row lock que esas escrituras, valida `auth.uid()` contra el propietario
real y solo reclama keys sin referencias. No usa service role en el runtime.
El tombstone queda en `private.media_lifecycle` incluso después de retirar la
fila de `media_assets`, por lo que la key no se puede volver a registrar ni
referenciar.

Las dos rutas reclamantes son `/api/delete-file` y
`/api/cleanup-orphaned-files`. Ambas llaman `deleteOwnedMedia`, que primero
reclama en la base y luego borra de R2 y confirma la eliminación del inventario.
Si falla un paso posterior, el tombstone permite reintentar de forma segura.
La exploración previa de limpieza solo propone candidatas; la decisión atómica
de la base vuelve a comprobar todas las referencias.

## Normalización y límites

El extractor reconoce URLs internas y externas de forma conservadora: una
coincidencia adicional puede impedir una eliminación, nunca habilitarla. Incluye
normalización de barras inversas, caracteres de control, escapes porcentuales
ASCII y segmentos `.`/`..`. La reclamación rechaza keys históricas fuera de la
gramática canónica (`images/`, `audio/`, `video/`) para revisión explícita.

0026 instaló el ledger, los triggers y el backfill transaccional. La lectura de
esa migración identificó una referencia histórica posible a una key sin fila de
inventario; no se presenta como un fallo de prueba. 0027 corrige forward-only la
normalización y el cambio de clave primaria en el sincronizador; 0028 limita la
reclamación a keys canónicas; 0029 reconstruye solo el ledger de referencias y
aborta si encuentra una referencia a una key tombstoned, evitando resucitar un
objeto que quizá ya no exista en R2. 0030 corrige forward-only los avisos de lint
del normalizador SQL (tipos explícitos de arrays, elimina variable redundante y
declara volatilidad `STABLE`); se aplicó localmente y el lint de esquemas public y
private terminó con exit 0.

Siguen pendientes la congelación y drenaje de firmas/reintentos en la antigua
eliminación de cuenta, PUT firmado tardío, finalización de subida y la integración
de cuotas. También están pendientes R2 privada en runtime y la integración de la
ruta de eliminación de cuentas: todavía borra objetos antes de coordinar sus
referencias, por lo que este bloque no se debe desplegar aisladamente. Las pruebas
auth contra 0030 pasaron; la validación remota sigue pendiente. La vista local
`http://127.0.0.1:3070` continúa;
no implica verificación de staging.

## Evidencia ejecutada

- `.wrangler/auditoria/qa-media-0028-final.log`: 342/342 pruebas, 32 archivos,
  21 warnings, 0 errores, exit 0.
- `.wrangler/auditoria/db-media-0030.log`: 143/143 pruebas, 12 archivos,
  exit 0.
- `db:verify` para 0028: pasó. La aplicación local de 0029 se hizo sin reset.
- `build-media-0029.log`: compilación Next aprobada, exit 0. Después solo cambió
  SQL y la cobertura de esquemas de `verify-db`, no el código de aplicación.
- `db-reconstruccion-0030.log`: reconstrucción 0000–0030 y lint public/private
  aprobados, exit 0. El contenedor auxiliar fue detenido conservando su volumen.
- `auth-media-0030.log`: 34/34, escritorio/móvil, sesión real, subidas y WAV real;
  `visual-auth-media-0030.log`: 4/4 ARIA. Ambos exit 0. Estas ejecuciones usan Next
  local y los servicios de prueba, no certifican el Worker remoto ni R2 empresarial.
- Las pruebas pasaron de 331 a 342 unitarias y de 131 a 143 DB. Los píxeles
  siguen sin referencia aprobada. El Worker compilado tiene evidencia anterior
  con 0025; aún no se repitió con 0030.

La primera forma de una aserción de clave primaria de la prueba DB usó UUID aunque
la PK de `profile_blocks.id` es `bigint`; se corrigió antes de la ejecución final.
No se cuenta como fallo final ni se usa como evidencia de regresión.
