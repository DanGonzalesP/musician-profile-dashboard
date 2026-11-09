# Migración de Vibe a la organización empresarial

Migración parcial, 2026-11-04. El repositorio y el proyecto Supabase ya se
transfirieron a las cuentas empresariales. El proyecto Supabase ahora se llama
`Vibe Music`, conserva la referencia `yiexwdqgaqoqlfqihsfr` y la misma región.
La comprobación posterior coincide con el baseline: 3 usuarios, 2 perfiles,
14 bloques, 63 objetos Storage, 0 `media_assets` y 18 migraciones. La cuenta
personal temporal Developer se retiró con confirmación explícita del titular;
la UI muestra un miembro (`vibemusicprofile@gmail.com`, Owner). Antes se
respaldaron y verificaron los 80 snippets privados únicos con DPAPI local. Al
retirar el miembro, los snippets del panel se eliminaron; no se eliminaron la
base de datos ni archivos. Antes de la copia del 2026-11-04 no se habían
copiado archivos. La copia empresarial de R2 ya está verificada (67 objetos);
no se ha desplegado.

## Inventario confirmado

Actualización 2026-11-05: identidades empresariales revalidadas; Supabase sigue
en 0017 y no hubo aplicación remota de migraciones. Un respaldo nuevo se
restauró localmente y coincidieron las 58 tablas; 0018–0037 se ensayaron después
sobre esa copia aislada. Ver [restauración](backups.md).

LIST/HEAD actuales verificaron 67 objetos R2 y 124.720.470 bytes frente al
inventario previo. Por MIME hay 15 audios, 50 imágenes y 2 `text/plain`;
la descripción histórica «15 audios y 52 imágenes» no reflejaba estos últimos.
Hay 35 candidatos vinculados a perfiles, 32 sin referencia preservados y
1 audio referenciado que falta también en el origen (HTTP 404). La atribución
basada en referencias no acredita por sí sola la autoría de la subida.
En la copia restaurada se registraron los 35 candidatos y su consulta de
lectura anónima los autorizó. Esto no verifica todavía el servicio HTTP remoto.
No se cambiaron las URLs originales ni se borró ningún objeto.

- GitHub: `vibemusicprofile-oss/musician-profile-dashboard`, repo ID `1297962278`;
  transferido desde `DanGonzalesP/musician-profile-dashboard`.
- Vercel: `musician-profile-dashboard-iqu5.vercel.app`.
- Supabase: proyecto actual `Vibe Music` (`yiexwdqgaqoqlfqihsfr`), organización
  destino `gojxsdxguggjmcbkwbhb`, misma región; migraciones 18. Nombre anterior:
  `decima`, renombrado el 2026-11-04. Se conservan la referencia y los datos.
- Cloudflare empresarial `5b647e532f3d4996206529d5595295f3`: R2 activo;
  `vibe-artist-media` contiene la copia verificada descrita abajo. Los buckets
  privados incluyen `vibe-cache-incremental` vacío y `vibe-static-assets` con
  `ffmpeg-core.wasm` verificado. D1
  `vibe-cache-etiquetas` (`02051ecd-e52a-4b5f-8e81-f5d44b63a03f`) tiene el
  esquema esperado y 0 filas. No se ha desplegado; falta completar la
  configuración de runtime y los gates/corte.
- Revisión previa de auditoría: 27 alertas high y 5 critical; grupos visibles
  incluyen Next.js, proxy-addr, DOMPurify, undici, brace-expansion, sharp,
  MCP SDK, Vite, zod, body-parser y systeminformation. Consultar el log antes
  de fijar versiones o comandos de actualización.

## Estado verificado 2026-11-04 (actualización)

- Wrangler usa un perfil `vibe` empresarial autorizado y asociado únicamente a
  este repositorio. El perfil global y Bancary permanecen intactos. Supabase CLI
  empresarial está aislada; su token está protegido con DPAPI. `projects list`
  muestra únicamente `Vibe Music` (`yiexwdqgaqoqlfqihsfr`), `ACTIVE_HEALTHY`.
- El dry-run de las migraciones pendientes `0018`–`0024` se inspeccionó, pero no
  se aplicó nada: `0022` es incompatible con rutas antiguas y requiere un corte
  coordinado.
- D1 empresarial está inicializada con `revalidations(tag,revalidatedAt,stale,
  expire)` y unicidad de `tag`; tiene 0 filas.
- WASM destino: 32,232,419 bytes, SHA-256
  `9F57947A5BD530D8F00C5B3F2CB2A3492FAA7E5D823315342D6A8656D0A6B7B7`, cotejado
  con la descarga verificada.
- La copia de `derias-assets` (cuenta personal `9c0f6d18a6ec1c93a65b8a475a1b3246`)
  a `vibe-artist-media` (empresarial `5b647e532f3d4996206529d5595295f3`)
  terminó: 67 objetos, 124,720,470 bytes (15 audios y 52 imágenes). SHA-256,
  metadatos e inventarios coinciden; el origen sigue intacto. Evidencia ignorada
  por Git: `.wrangler/migracion-empresa-2026-11-04/r2-copia-verificada.json`.
- El bucket destino sigue privado. `media_assets` tiene 0 filas, no se cambiaron
  URLs antiguas y no hubo deploy. La caché está vacía.
- Credencial de runtime: `vibe-music-artistas-runtime`, cifrada con DPAPI en
  `.wrangler/credenciales-empresa/r2-runtime.dpapi`; la carpeta tiene ACL para
  el usuario actual y SYSTEM. La primera clave se mostró accidentalmente en un
  diagnóstico al cerrar la página y se rotó de inmediato, con el mismo alcance.
  La sustituta se verificó con listado de 67 objetos/124,720,470 bytes y HEAD
  correcto; el acceso a buckets de caché/estáticos se deniega. La primera clave
  revocada devuelve 403; la credencial sustituta vence el 2027-05-04. La clave personal antigua, una
  credencial distinta, devuelve 401. No publicar valores ni IDs de claves.
- GitHub `main`, sus seis checks y protecciones fueron verificados sin cambios.

Este avance no cierra la migración. El despliegue autorizado sigue sujeto a los
gates y a un corte seguro; no se ha desplegado.

## Preflight (sin mutaciones)

### Destino comprobado y avances de esta sesión

- Identidad empresarial: `vibemusicprofile@gmail.com`, Chrome de Vibe separado.
- Cloudflare creado mediante Google; account ID `5b647e532f3d4996206529d5595295f3`.
- Estado al inicio del preflight, antes de inicializar D1 y copiar R2: D1 vacía
  y los tres buckets R2 privados vacíos. Estado actual: D1 tiene esquema
  `revalidations(tag,revalidatedAt,stale,expire)`, `tag` único y 0 filas;
  `vibe-artist-media` contiene la copia verificada de 67 objetos, mientras que
  la caché sigue vacía y estáticos contiene el WASM verificado. Aún no hay deploy.
- `wrangler.jsonc` apunta al account ID y D1 nuevos. La copia R2 y la autorización
  aislada ya se completaron; ejecutar deploy tras los gates y el corte seguro.
  No se cambió el login global CLI.
- GitHub: repo transferido a `vibemusicprofile-oss/musician-profile-dashboard`,
  mismo repo ID `1297962278`. `main` y nueve ramas `codex` conservaron sus hashes;
  dos ramas Dependabot se actualizaron automáticamente. `origin` apunta al destino;
  no se hicieron push ni commits.
- Supabase: organización destino Vibe, slug `gojxsdxguggjmcbkwbhb`, plan Free,
  proyecto transferido y renombrado `Vibe Music`; owner `vibemusicprofile@gmail.com`.
  Se retiró el miembro temporal Developer con confirmación explícita; la UI muestra
  un miembro Owner.
- Cloudflare (estado de este preflight inicial): cuenta empresarial
  `5b647e532f3d4996206529d5595295f3`, R2 activo y recursos recién creados.
- Exportación remota Supabase (esquema, roles, datos y migrations-data):
  `auth.users` 3, `profiles` 2, `storage.objects` 63, `media_assets` 0.
  Copia cifrada DPAPI CurrentUser: `.wrangler/migracion-empresa-2026-11-04/supabase-pretransferencia.zip.dpapi`,
  71,558 bytes, SHA-256 `255E4647560338D928457E0BF84D295DD152DDC844040151A238B52FD8A58A97`;
  cinco entradas verificadas tras descifrar. Solo recuperable con el perfil
  Windows actual; no hay backup independiente ni restore de DB verificado, y no
  contiene archivos de Storage/R2. `conteos.json` se conserva; cuatro SQL
  temporales en texto plano fueron borrados.
- Antes de retirar el miembro temporal se respaldaron y verificaron 80 snippets
  únicos: `.wrangler/migracion-empresa-2026-11-04/snippets-cifrados/manifest.json`;
  80 verificados, 141340 bytes de texto plano total. Cifrado DPAPI local; al retirar
  el miembro se eliminaron los snippets del panel. No implica copia de BD ni archivos.
- El fallo de auth correspondió a una copia anidada sin raíz Git; original intacto.
  `preparar-verificacion` ahora tiene Git inicializado sin remoto. Reintentos
  aislados: E2E auth 32 passed y visual auth 4 passed (ARIA), exit 0 en ambos.
  No se aprueban baselines de píxeles ni se declara fase completa.
- Respaldo `historial.bundle` en `.wrangler/cierre-2026-11-04-inicial/` comprobado
  con `git bundle verify`; incluye el historial local. No incluye base ni medios.
- QA 331 pruebas y DB 129 aprobadas. Build con variables de relleno del CI
  aprobado (exit 0); esto no valida las conexiones del futuro despliegue.

### Comprobaciones antes de transferir

1. Congelar cambios durante la ventana; definir responsables/propietarios y
   plan empresarial, cuotas, facturación y acceso MFA en las cuentas destino.
2. Registrar en bóveda (nunca en Git/documentos) secretos y configuración
   necesarios para reponer integraciones. Exportar inventarios sin valores.
3. GitHub: confirmar permiso de transferencia y crear-repo en organización;
   guardar reglas de ramas/rulesets, Actions, environments, webhooks, deploy
   keys, Pages/Packages y colaboradores. Tras transferir se conservan historial,
   PRs e issues; verificar explícitamente protecciones y checks en destino.
4. Supabase: invitar al operador como miembro de la organización destino;
   revisar preflight de transferencia. Desconectar primero GitHub Integration,
   project-scoped roles y log drains si existen. Confirmar plan, región, addons,
   dominio, Auth URLs/SMTP, extensiones, backups y migraciones antes de aceptar.
5. Cloudflare destino: crear/autorizar cuenta empresarial; revisar bindings y
   secretos necesarios del Worker en [cloudflare.md](cloudflare.md). Inventariar
   todos los buckets y metadatos, incluyendo confirmar dueño y contenido de
   `derias-assets`. Sin secretos visibles en logs.

## Secuencia propuesta y aceptación

1. GitHub: transferencia completada. Validar aún URL, ramas/tags, historial,
   PR/issues, Actions, variables (sin exponerlas), protecciones, permisos y remoto.
   `main` y nueve ramas `codex` conservaron hashes; dos ramas Dependabot se
   actualizaron automáticamente. `origin` apunta al destino; no hubo push/commits.
2. Proyecto Supabase transferido y renombrado `Vibe Music`; el miembro temporal
   fue retirado tras respaldo de snippets. Confirmar integraciones y efectuar
   pruebas no destructivas de login/lectura, backups y migraciones.
3. En Cloudflare empresarial, configurar Worker/bindings sobre D1 y buckets ya
   creados; el Worker
   se publica desde configuración versionada. D1 ya está inicializada; verificar
   esquema/conteos y comparar con lo esperado. La copia R2 fue cotejada en hash,
   metadatos e inventarios; validar WASM y medios con `media_assets` antes del
   corte. Reconfigurar build/runtime/secrets de forma segura y ejecutar los gates.
4. Reasociar GitHub↔Vercel y Supabase GitHub si se requiere; inspeccionar
   proyecto, dominios, variables, hooks y permisos en destino. El hostname
   Vercel listado no prueba quién posee la cuenta ni qué alias/custom domains
   deben moverse.
5. Aceptar sólo tras `pnpm qa`, `pnpm build`, `pnpm cf:build`, pruebas aplicables,
   smoke HTTP de producción y validación de login, publicación, subidas y medios.
   Cambiar DNS/rutas al final, con ventana y responsable humano.

## Rollback y bloqueos humanos

Conservar cuentas/recursos fuente intactos hasta validar destino y acordar
retención. Ante fallo antes del corte: volver a configuración/credenciales de
origen; tras el corte, revertir DNS/rutas y secretos previos, revisar escrituras
realizadas en ambos lados y evitar split-brain. No asumir sincronización inversa.
Pendiente: validar bindings/CORS y el flujo integrado con `media_assets`; gates,
Vercel ownership y estrategia de dominio; backup/restauración de DB y medios;
inventario de configuración y ventana de corte coordinada. La credencial
empresarial vigente quedó verificada y limitada al bucket de artistas; la primera
clave de esa credencial fue revocada y probada (403). GitHub `main`, seis checks
y protecciones se verificaron sin modificación. No aplicar `0018`–`0024` hasta
resolver la incompatibilidad de `0022` con rutas antiguas y coordinar el corte.

## Referencias oficiales

- [GitHub: transferencia de repositorios](https://docs.github.com/en/repositories/creating-and-managing-repositories/transferring-a-repository)
- [GitHub: ramas protegidas](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [Supabase: transferencia de proyectos](https://supabase.com/docs/guides/platform/project-transfer)
- [Supabase: clonar/restaurar a proyecto nuevo](https://supabase.com/docs/guides/platform/clone-project)
- [Cloudflare D1: exportar/importar](https://developers.cloudflare.com/d1/best-practices/import-export-data/)
- [Cloudflare R2: S3 API](https://developers.cloudflare.com/r2/api/s3/api/) y [rclone](https://developers.cloudflare.com/r2/examples/rclone/)
- [Cloudflare Wrangler: configuración](https://developers.cloudflare.com/workers/wrangler/configuration/)
