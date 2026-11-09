# Decisiones vigentes del titular — 2026-11-05

La migración empresarial y el despliegue en Cloudflare después de los controles
ya están autorizados. No volver a pedir esa autorización ni tratar las acciones
técnicas históricas de abajo como pendientes exclusivamente humanos. Estado
actual de recursos/rotaciones: `docs/cierres-2026-11.md` y `docs/migracion-empresa-vibe.md`.

El titular confirmó Perú, sin formalización ni dominio, y desea permitir menores
si resulta viable. Prefiere conservar **Vibe** y rechazó los dominios propuestos.
Revisar antecedentes y viabilidad de marca antes de comprar; no hay autorización
de gastos. Pasos y fuentes: `docs/preparacion-legal-peru.md`.

Pendientes materiales: identificar persona/entidad titular y contacto legal;
elegir nombre/dominio tras revisar marca; aprobar alcance/edad y consentimientos
para menores; definir retención y monetización antes de habilitarlas; obtener
revisión profesional de los documentos. Preparar e implementar el resto sigue
siendo trabajo del agente, no una exigencia de intervención del titular.

## Acción pendiente concreta — credencial R2 de staging (2026-11-09)

1. En Chrome con la cuenta de Vibe: Cloudflare (cuenta `5b647e532f3d4996206529d5595295f3`)
   → R2 Object Storage → Manage API tokens → Create API token.
2. Nombre `vibe-staging-artistas-runtime`; permiso **Object Read & Write**; bucket
   específico **sólo** `vibe-staging-artist-media`; vigencia seis meses. Crear.
3. Sin copiar los valores a ningún chat ni archivo, ejecutar en la raíz del repo:
   `powershell -File scripts/guardar-credencial-r2-staging.ps1` y pegar los dos
   valores cuando los pida (no se muestran). Debe terminar con
   `authorizedBucket: vibe-staging-artist-media` y cinco buckets denegados.
Desbloquea: secretos S3 del Worker staging, CORS exacto y la validación de subidas
de staging (cierres 17, 19 y 20). No ampliar la credencial de producción.

## Decisión sobre el equipo — Smart App Control (2026-11-09)

Windows bloquea `supabase.exe` y `workerd.exe` en esta laptop. Recomendación:
**no desactivarlo**; validar base de datos y Worker en el CI de GitHub (Linux), que
ya tiene esos trabajos. Alternativa: desactivar Smart App Control en Seguridad de
Windows → Control de aplicaciones y navegador; según la versión de Windows puede no
poder reactivarse sin reinstalar, así que es decisión tuya, no del agente.

## Historial de acciones — 2026-10-04

Sólo decisiones/accesos/operación que este encargo no autoriza ejecutar. El
trabajo técnico pendiente está en `ESTADO_PLAN.md`; completar esta lista no
elimina esos riesgos ni certifica producción. No pegar secretos en el chat.

## P0 — Rotar la credencial S3 de R2

- **Bloquea:** usar con confianza las subidas/borrados remotos. El traspaso
  registra una exposición anterior; esta sesión no leyó ni probó esa clave.
- **Cuenta:** cuenta personal de Cloudflare de Vibe, identificada por
  `account_id` en `wrangler.jsonc`; nunca la cuenta de otro proyecto.
- **Ruta:** Cloudflare → R2 Object Storage → Overview → Account Details →
  API Tokens → Manage → Create Account API token (o User API token según tus
  permisos) → Permissions: **Object Read & Write** → Specific buckets.
- **Valor:** seleccionar únicamente el bucket que realmente guarda medios de
  Vibe y corresponde a `R2_BUCKET_NAME`. Confirmar ese nombre en el inventario;
  no asumir que un bucket de nombre parecido pertenece al proyecto. Guardar
  Access Key ID y Secret Access Key en el gestor de secretos.
- **Aplicación:** Workers & Pages → `vibe` → Settings → Variables and Secrets →
  Add → Secret: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`. Revocar el token
  expuesto desde Manage API Tokens; no dejar ambas claves activas indefinidamente.
- **Comprobar:** en una ventana de operación autorizada, upload firmado de un
  archivo ficticio, lectura y borrado del mismo; comprobar que el token antiguo
  falla y que el nuevo no accede a los buckets de caché/estáticos.
- **Después:** puede ejecutarse el smoke S3/CORS remoto. Caché y WASM utilizan
  bindings `NEXT_INC_CACHE_R2_BUCKET` y `VIBE_STATIC_ASSETS`, no esta clave.

Referencia de campos/permisos: [Cloudflare R2 Authentication](https://developers.cloudflare.com/r2/api/tokens/).

## P0 — Confirmar configuración de Vibe y autorizar una ventana de staging

- **Bloquea:** verificación remota; no hace falta recrear los recursos declarados.
- **Cloudflare:** Workers & Pages → `vibe` → Settings → Build → Variables:
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `NEXT_PUBLIC_R2_PUBLIC_URL`, `NEXT_PUBLIC_SITE_URL`; versión mediante
  `WORKERS_CI_COMMIT_SHA` o `APP_VERSION`. En Settings → Variables and Secrets
  (Text): `R2_ENDPOINT`, `R2_BUCKET_NAME`, `TRUSTED_PROXY` según el runbook.
  Los valores públicos salen del proyecto Supabase y del bucket de **Vibe**;
  ninguna service role va a la aplicación.
- **Bindings:** Worker → Settings → Bindings: ASSETS; R2 caché y estáticos; D1
  `vibe-cache-etiquetas`; DO `DOQueueHandler`; service `WORKER_SELF_REFERENCE`
  apuntando a `vibe`. Comparar con `wrangler.jsonc` sin crear duplicados.
- **Comprobar D1:** comando de lectura
  `pnpm wrangler d1 execute vibe-cache-etiquetas --remote --command "PRAGMA table_info(revalidations)"`.
  Debe contener `tag`, `revalidatedAt`, `stale`, `expire`. Si falta algo, entregar
  sólo el esquema sin datos para preparar la reparación dirigida. `cf:deploy`
  inicializa caché con OpenNext; `wrangler deploy` directo no lo sustituye.
- **CORS:** R2 → bucket de artistas → Settings → CORS policy. Autorizar el
  origen exacto de staging/dominio, PUT y headers necesarios; comprobar OPTIONS
  y PUT desde navegador. No ampliar a todos los orígenes para ocultar un fallo.
- **WASM:** R2 → `vibe-static-assets` → Objects → `ffmpeg-core.wasm`: comparar
  tamaño/hash con el archivo local y mantener bucket privado. El comando de
  carga existente en `docs/cloudflare.md` requiere autorización remota.
- **Después:** el agente puede verificar build/runtime remoto, CSP, sesión,
  publicación, invalidación y recuperación. No se hizo despliegue en este encargo.

## P0 — Autorizar comparación/aplicación de migraciones remotas

- **Bloquea:** el editor nuevo necesita 0020 y las subidas nuevas 0022.
- **Cuenta/proyecto:** Supabase Dashboard → organización correcta → proyecto
  Vibe → Database → Migrations / SQL Editor. Confirmar Project Settings →
  General → Reference ID antes de vincular la CLI; no copiar claves al chat.
- **Pasos:** backup verificable; `pnpm exec supabase migration list --linked`
  y `pnpm exec supabase db push --dry-run` en una sesión autorizada del proyecto
  correcto. Comparar con `supabase/migrations/`; el último estado remoto del
  historial no demuestra el estado de hoy. Revisar 0018–0019 si faltan y toda
  la serie **0020–0024**, en orden. No ejecutar el baseline sobre una base viva.
- **Comprobar:** historial consistente, privilegios/RLS y smoke con usuario
  ficticio; no dejar el despliegue detenido en 0023 (0024 conserva lectura anon).
  Coordinar migraciones y cliente: 0022 rechaza keys antiguas nuevas, y 0020 es
  prerrequisito del editor. Mantener una ventana controlada sin nuevas subidas.
- **Después:** puede verificarse la integración remota y prepararse el despliegue
  del cliente. Rollback de aplicación no revierte datos; un cliente antiguo de
  uploads no es compatible con 0022, por lo que hace falta build de rollback
  que conserve el namespace. Nunca eliminar filas o relajar RLS como rollback.

## P1 — Identidad administrativa y distribución de contenido suspendido

- **Bloquea:** moderación operable con permisos DB y revocación efectiva de medios.
- **Decisión escrita:** quién administra Vibe, cómo se asigna/revoca ese rol en
  Postgres y cómo se audita. `ADMIN_USER_IDS` en runtime no demuestra un rol DB.
  No se creó una superficie administrativa nueva ni se inventaron claims.
- **Decisión de medios:** definir si la suspensión debe cortar URLs R2 ya
  conocidas y cómo conservar enlaces tras la mediación de acceso. La actual
  distribución pública no puede retirar copias ya descargadas.
- **Lugar:** registrar la decisión en `docs/` antes de preparar DDL/políticas;
  no tocar un panel de permisos por ensayo. Entregar identificadores por un
  canal privado sólo cuando se autorice aplicar la política.
- **Después:** el agente puede implementar roles/RPC y el protocolo de acceso,
  con pruebas negativas de usuarios, cache y URLs anteriores.

## P1 — Correo, recuperación y evidencia visual

- **Supabase Vibe → Authentication → URL Configuration:** Site URL del entorno
  correcto y Redirect URLs exactas para `/nueva-contrasena`. Authentication →
  Email/SMTP: confirmar remitente y proveedor ya elegido, sin cambiar proveedor.
  Probar recuperación con cuenta ficticia, enlace vencido y uso único. Después
  puede completarse el smoke de correo real; la suite local ya cubre el flujo.
- **Capturas:** revisar referencias por sistema operativo generadas mediante
  `pnpm test:visual:update` en entorno ficticio. Aprobar cada PNG antes de
  versionarlo. Actualmente pasaron ARIA; 24 casos de píxeles se omiten porque
  no hay baseline Linux aprobado. No se actualizó ninguna referencia para
  hacer pasar pruebas.

## P1 — Operación y publicación futura

Confirmar entorno staging, responsable de alertas y ventana de recuperación.
GitHub → repositorio Vibe → Settings → Rules → Rulesets / Branches: verificar
los gates requeridos, incluyendo Cloudflare, sin quitar los existentes.
Autorizar por separado un despliegue después de cerrar los P0 técnicos de
`ESTADO_PLAN.md`. El agente podrá ejecutar smoke/rollback y registrar evidencia;
esta autorización no está incluida en el encargo actual.
