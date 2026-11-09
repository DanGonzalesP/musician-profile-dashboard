## Estado vigente — despliegue privado (2026-11-09)

Worker `vibe-staging`, cuenta `5b647e532f3d4996206529d5595295f3`, creado 2026-11-09T22:37:01.587252Z. Versión `b2660d02-d870-437e-b67f-16ebd185df3d`, despliegue `0e3dcb46-9388-4f81-bf10-053091484c35`. OpenNext dry run y despliegue Linux exitosos; `workers_dev=false`, `preview_urls=false`, API confirma `enabled=false`, `previews_enabled=false`, `routes=[]` (2026-11-09T22:44:33.537Z); sin HTTP remoto. Startup 23 ms, 109 assets, dos entradas de caché R2 y esquema D1 creados. Metadata confirma `DOQueueHandler` y bindings ASSETS/R2/D1/self/DO; export y binding `DOQueueHandler` confirmados; instanciación remota pendiente.

Seis nombres de secretos instalados con `scripts/instalar-secretos-staging.ps1` (exit0); runtime remoto pendiente. Auth configurado y confirmado por GET: origen `https://vibe-staging.vibemusicprofile.workers.dev`; allow-list sólo `/login` y `/nueva-contrasena`, registro cerrado, confirmación obligatoria, anónimos desactivados. SMTP no acreditado. CORS aplicado al bucket `vibe-staging-artist-media` para origen exacto, PUT, Content-Type/If-None-Match, ETag expuesto, maxAge 600; GET remoto confirmó exactamente esa regla.

0071 ya estaba aplicada; no se reaplicó en esta operación; 0 usuarios/perfiles. Zero Trust Free seleccionado con autorización, pero checkout y autorización de cargos por exceso no aceptados; sin plan activo ni cargo nuevo. Origen exacto configurado; Access y validación integrada real pendientes. Balance 1/27 completo, sólo el cierre 15 completo; otros 26 sin acreditar.
# Staging — Vibe

## Operaciones repetibles del estado actual

```powershell
# Captura cifrada nueva; no restaura ni modifica el proyecto.
powershell -NoProfile -File scripts/respaldar-staging.ps1
# Consulta sin descifrar los valores de los secretos.
powershell -NoProfile -File scripts/instalar-secretos-staging.ps1 -SoloVerificar
# Consulta los retornos y mantiene el registro cerrado.
powershell -NoProfile -File scripts/preparar-auth-staging.ps1
# Lectura de la política efectiva; no crea credenciales administrativas S3.
pnpm exec wrangler r2 bucket cors list vibe-staging-artist-media --config wrangler.staging.jsonc --profile vibe
```

Para una aplicación deliberada de los retornos exactos, usar
`preparar-auth-staging.ps1 -Aplicar`. Para reponer la política de subidas:
`pnpm exec wrangler r2 bucket cors set vibe-staging-artist-media --file scripts/r2-cors.staging.json --config wrangler.staging.jsonc --profile vibe`.
Estos pasos no activan Access, el registro ni las rutas del Worker. CORS no
concede acceso público al bucket: el PUT sigue requiriendo su firma temporal.
Consultar [la referencia de R2](https://developers.cloudflare.com/r2/buckets/cors/)
y [la configuración Auth](https://supabase.com/docs/reference/api/v1-update-auth-service-config).

El build desplegado se hizo en la copia Linux aislada, con URL/clave pública
`anon` del proyecto staging, origen exacto y `APP_VERSION=5d0f59211a213585e36dabbcceb045020d920a25`
inyectados antes de compilar. La configuración raíz no contiene la clave pública
ni sustituye ese paso: no ejecutar un despliegue directo desde ella sin preparar
las variables de build y runtime del entorno. Los secretos se instalan por stdin,
sin archivos de texto. Registros locales de esta ejecución, ignorados por Git:
`.wrangler/auditoria/continuacion-codex-2026-11-09/staging-linux-build.log`,
`staging-remote-deploy.log` y `staging-remote-metadata.json`.

> Historial: las menciones posteriores a configuración pendiente reflejan estados anteriores.

Nota de continuidad 2026-11-09: el aplicador
`scripts/aplicar-migracion-staging.ps1` ahora prepara SQL e historial en una sola
transacción mediante `scripts/preparar-migracion-staging.mjs`, sin credenciales
durante la preparación. Un bloqueo transaccional y una guarda interna exigen la
versión inmediatamente anterior. Si falla SQL o historial, nada se confirma.
Cinco pruebas en PostgreSQL efímero verifican también dos aplicadores simultáneos.
Esto mejora el procedimiento; **el aplicador no se ejecutó contra staging en esta operación**.
La consulta posterior confirmó que 0071 ya estaba aplicada.
Conservar las comprobaciones de destino, respaldo y gates antes de ejecutarlo.

Actualización 2026-11-06. Preparación del cierre 20, **no acreditado**.
Se crearon los tres buckets R2 y la D1 exclusiva de staging el 2026-11-06;
Supabase staging se creó después y recibió las migraciones `0000`–`0070`. No hay
Worker staging desplegado. La copia local
en `:3070` y los fixtures no sustituyen la integración remota.

## Aislamiento obligatorio

Durante la preparación, Auth staging tiene `disable_signup=true`,
`mailer_autoconfirm=false` y `external_anonymous_users_enabled=false`.
Se aplicaron mediante PATCH y se confirmaron con GET el 2026-11-06; evidencia
no secreta en `.wrangler/staging-schema/auth-preparacion.json`. No se modificó
Auth de producción. Antes de los recorridos de registro, definir el origen
exacto, callbacks y acceso restringido de staging; habilitar el registro sólo
en esa ventana controlada. No desactivar la confirmación de correo para
simular que la entrega SMTP funciona.

Staging usa datos ficticios y recursos propios. No copiar perfiles, correos,
DNIs, archivos privados ni respaldos de producción para sembrarlo. Verificar
cuenta empresarial y propiedad antes de crear o modificar recursos. No cambiar
planes ni facturación; si la capacidad disponible exige un gasto, se necesita
decisión del titular antes de contratarlo.

| Recurso | Destino de staging | Estado |
|---|---|---|
| Worker | `vibe-staging` | desplegado con OpenNext desde Linux; creado 2026-11-09T22:37:01.587252Z. Versión `b2660d02-d870-437e-b67f-16ebd185df3d`, despliegue `0e3dcb46-9388-4f81-bf10-053091484c35`; sin rutas, `workers_dev=false`, `preview_urls=false`, sin HTTP remoto. Startup 23 ms; 109 assets. Metadata confirma `DOQueueHandler` y bindings ASSETS/R2/D1/self/DO; export y binding `DOQueueHandler` confirmados; instanciación remota pendiente. |
| Supabase Auth/Postgres | `Vibe Music Staging`, `iyppeurjtbuydhjtraxf` | 0071 ya estaba aplicada; 0 usuarios/perfiles; registro cerrado; no se reaplicó en esta operación |
| R2 de artistas | `vibe-staging-artist-media` | creado; sin archivos subidos ni acceso público habilitado en esta operación |
| R2 de caché | `vibe-staging-cache-incremental` | creado; dos entradas pobladas durante el despliegue |
| R2 de WASM | `vibe-staging-static-assets` | creado; `ffmpeg-core.wasm` subido; lectura desde Worker pendiente |
| D1 de etiquetas | `vibe-staging-cache-etiquetas` | `37f4a26b-5d19-4143-a632-c52a2aba7dd5`; esquema creado |
| Durable Object | export y binding `DOQueueHandler` | confirmados en metadata; instanciación runtime remota pendiente |
| Origen HTTPS | `https://vibe-staging.vibemusicprofile.workers.dev` | configurado en build/Auth/CORS; publicación y protección Access pendientes. El dominio definitivo del producto sigue sin elegir |

La [plantilla de Wrangler](../wrangler.staging.jsonc.example) incluye los
bindings del adaptador actual y autorreferencia a `vibe-staging`. El UUID D1
es deliberadamente inválido hasta identificar el recurso real. No pasar la
plantilla directamente a un despliegue ni sustituir el UUID con el de producción.
`workers_dev` y `preview_urls` quedan deshabilitados; no se publica una entrada
por defecto. Definir explícitamente el acceso al origen antes de habilitarlo.

La [configuración concreta](../wrangler.staging.jsonc) ya referencia los recursos
creados. La sesión `whoami --json` confirmó la cuenta empresarial del titular;
los comandos de creación terminaron con código0. Se aplicó
`scripts/cache-etiquetas-d1.sql` sólo a la D1 staging mediante `--config
wrangler.staging.jsonc --profile vibe --remote`. No se modificaron planes,
configuración de producción, CORS, secretos ni rutas públicas. Esto acredita
aprovisionamiento, no funcionamiento de la aplicación ni aislamiento probado.

El 2026-11-06 se subió `public/ffmpeg/ffmpeg-core.wasm` mediante `r2 object put`
con `--remote --config wrangler.staging.jsonc --profile vibe`, tipo
`application/wasm`. Wrangler terminó con código 0 y `Upload complete.`. Antes
de subirlo, su SHA-256 coincidió con el archivo del paquete instalado
`@ffmpeg/core/dist/esm/ffmpeg-core.wasm`:
`9F57947A5BD530D8F00C5B3F2CB2A3492FAA7E5D823315342D6A8656D0A6B7B7`.
No se habilitó acceso público. Falta comprobar su lectura mediante el binding
del Worker y la conversión en navegador durante la verificación final.

## Configuración antes del build

El 2026-11-06 `scripts/preparar-claves-staging.ps1` terminó con código 0:
registró un par HMAC exclusivo para recibos de medios y otro independiente
para límites anónimos en las tablas privadas de staging. El material local
queda cifrado con DPAPI en `.wrangler/supabase-empresa/staging-hmac.dpapi`.
El script comprueba proyecto/organización, conserva las claves en reintentos
y aborta si un identificador existente corresponde a otro secreto. No muestra
valores ni respuestas de error que puedan contener SQL sensible.
Esas claves y la credencial R2 ya se instalaron como los seis secretos del Worker
staging el 2026-11-09, por stdin. Presencia confirmada; comprobación en runtime
remoto pendiente. El mantenimiento sigue desactivado.

La API de administración confirmó la organización `gojxsdxguggjmcbkwbhb`
(`Vibe`) en plan `free` y sólo el proyecto de producción antes de crear staging.
La creación del proyecto independiente terminó con código 0 el 2026-11-06.
Se solicitó explícitamente el plan gratuito, sin cambio de suscripción, y no se
copiaron datos. La contraseña nueva se generó aleatoriamente y se guardó sólo
cifrada con DPAPI en la carpeta local ignorada de credenciales empresariales;
no está en esta documentación ni en configuración de la aplicación.
El inventario no secreto quedó en
`.wrangler/supabase-empresa/staging-project.json`.

Se comprobó la identidad del proyecto y que tenía 0 usuarios y 0 tablas públicas.
Se copiaron únicamente las migraciones a `.wrangler/staging-schema`, con una
configuración mínima propia. La CLI instalada terminó con código 0 al ejecutar
`db push --project-ref iyppeurjtbuydhjtraxf --workdir .wrangler/staging-schema
--skip-vault --yes`: aplicó `0000`–`0070`, sin semillas ni roles adicionales.
La contraseña y el token se pasaron en el entorno del proceso, sin guardarlos
en la configuración. No se enlazó el repositorio principal a staging.
No restaurar producción ni apuntar el baseline `0000` al proyecto
`yiexwdqgaqoqlfqihsfr`. La instalación no acredita todavía RLS, autenticación
ni conexión con Cloudflare; esas pruebas siguen pendientes para el final.

Referencias oficiales consultadas:
[creación por API](https://supabase.com/docs/reference/api/v1-create-a-project)
y [alcance del plan gratuito](https://supabase.com/docs/guides/platform/billing-on-supabase).

Trabajar en una copia aislada, sin `.env` heredados ni artefactos `.next` o
`.open-next` de otro entorno. Copiar la plantilla como `wrangler.staging.jsonc`
en la raíz de esa copia y completar únicamente recursos verificados de staging.
En este repositorio ya existe la configuración concreta: conservarla al preparar
la copia, sin sobrescribirla con la plantilla de UUID inválido.

- `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`: proyecto staging,
  iguales en build y ejecución. No usar service role.
- `NEXT_PUBLIC_SITE_URL`: origen HTTPS exacto de staging; configurar ese mismo
  origen y sus callbacks en Supabase Auth, sin comodines hacia producción.
- `R2_ACCOUNT_ID`, `R2_ENDPOINT`, `R2_BUCKET_NAME`: cuenta empresarial y bucket
  staging de artistas. Endpoint disponible también durante build para CSP.
- `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`: par exclusivo con permisos mínimos
  sobre el bucket staging. CORS sólo para el origen de staging necesario para PUT.
- `NEXT_PUBLIC_R2_PUBLIC_URL`: sólo si los datos ficticios tienen un origen
  histórico que deba reconocerse; nunca activar acceso público al bucket para
  rellenarlo. Medios servidos mediante `/api/media`.
- Pares `MEDIA_RECEIPT_KEY`/`_KEY_ID` y `ANONYMOUS_RATE_LIMIT_KEY`/`_KEY_ID`:
  independientes de producción y entre sí, registrados en la base de staging
  (hecho) y secretos del Worker (pendiente). Sin ellos las rutas correspondientes quedan cerradas.
- Roles en `private.platform_roles`, con identidad de prueba comprobada;
  `ADMIN_USER_IDS` no concede permisos.
- Together y Meta: vacíos si no se necesita probar la integración. No reutilizar
  claves personales ni activar consumo facturable sin autorización.

Mantenimiento se configura aparte según [su plantilla](../workers/media-maintenance.env.example).
La [configuración staging de mantenimiento](../wrangler.media-maintenance.staging.jsonc)
apunta únicamente al proyecto y bucket staging, sin cron y con el interruptor
apagado. Su tercer par de firma independiente se generó y registró en
`private.media_maintenance_keys` el 2026-11-06 (operación con salida 0).
El material está cifrado en `.wrangler/supabase-empresa/staging-maintenance.dpapi`;
falta instalarlo en el Worker de mantenimiento, que no está desplegado.
No apuntar su Worker o cron a producción. No activar mantenimiento programado
antes de verificar manualmente el aislamiento y la recuperación de staging.

Acceso R2 pendiente: el inventario del navegador del 2026-11-06 sólo permitió
controlar perfiles Daniel y Canodent, sin la sesión empresarial de Vibe. Se pidió
abrir Cloudflare en el perfil Vibe y habilitar su extensión de control; no se
creó credencial en otra cuenta. No reutilizar la credencial de producción ni
ampliar sus permisos para cubrir staging. La nueva debe limitarse al bucket
`vibe-staging-artist-media`.

Paso preparado (2026-11-09): tras crear la credencial en Cloudflare, ejecutar
`powershell -File scripts/guardar-credencial-r2-staging.ps1` desde la raíz. Pide los
dos valores ocultos, los guarda cifrados en
`.wrangler/credenciales-empresa/r2-staging-runtime.dpapi` y verifica acceso de objeto
sólo en el bucket de staging (objeto ficticio creado y borrado) y rechazo401/403 en
producción y en los buckets de caché/estáticos. `-SoloVerificar` repite la prueba.

La configuración principal ya fija URL de Supabase, endpoint y bucket R2 de
staging, cuota en modo rechazo y validación estricta de bloques. Replicar las
variables necesarias al build; `vars` no sustituye ese entorno. No se requiere
`NEXT_PUBLIC_R2_PUBLIC_URL` en un entorno sin archivos históricos: las nuevas
subidas finalizan con rutas `/api/media/`. La corrección de ese requisito y del
resultado de borrado sin origen histórico sigue pendiente de pruebas finales.

## Preparación y promoción

1. Inventariar recursos reales y capacidad disponible; confirmar aislamiento y
   registrar identificadores no secretos. Conservar credenciales fuera de Git.
2. Aplicar migraciones forward-only al proyecto staging identificado. Sembrar
   únicamente fixtures ficticios; nunca ejecutar un reset sobre producción.
3. Preparar D1 con el esquema requerido por el adaptador instalado, subir el WASM
   oficial verificado al bucket estático y mantener privados los tres buckets.
4. Superar gates locales en la copia de verificación. Después compilar el
   artefacto staging con sus variables propias y configuración explícita:

   ```powershell
   pnpm exec opennextjs-cloudflare build --config wrangler.staging.jsonc
   pnpm exec opennextjs-cloudflare deploy --config wrangler.staging.jsonc
   ```

   Son comandos para la fase autorizada de integración, **no ejecutados** al
   preparar esta guía. Revisar la configuración generada y bindings de destino
   antes del segundo comando. El build no reutiliza los valores de producción.
5. Ejecutar smoke y recorridos reales: sesión, recuperación por correo, subida,
   finalización, publicación, reproducción, permisos, moderación, suspensión,
   enlaces antiguos, D1/R2 e invalidación; registrar resultados por versión.
   Smoke por sí solo no acredita esos recorridos.
6. Promover a producción deliberadamente tras gates, respaldo y plan compatible
   de vuelta atrás. No renombrar y desplegar el bundle staging: las variables
   públicas están incorporadas al build y requieren un artefacto de producción.

Existen workflows de CI y disponibilidad; el monitor requiere habilitación
explícita. No hay deploy automático a staging ni workflow `staging.yml` implementado.
Prepararlo sólo después de identificar recursos y configurar el entorno GitHub
con permisos y secretos propios. No hacer que un merge publique por sorpresa.

Si aún no se pueden disponer recursos aislados, continuar con Supabase local y
Worker local; conservar el cierre remoto como pendiente. No usar Vercel ni
exponer la base local a Internet como sustitución improvisada.

Referencia: [CLI oficial de OpenNext](https://opennext.js.org/cloudflare/cli)
para selección explícita de configuración. Revisar siempre la versión instalada
y el artefacto generado antes de ejecutar operaciones remotas.
