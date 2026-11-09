# Cierres pendientes de Vibe

## Avance del 9 de noviembre de 2026 (2) — edad y constancia legal en el registro

- Cierre24 (parte técnica) y seguridad: `0071_aceptacion_legal_y_edad.sql` guarda en
  `private.legal_acceptances` la versión de Términos/Privacidad y la declaración de
  mayoría de edad copiadas UNA vez desde el alta (trigger en `auth.users`), y rechaza
  con42501 crear perfiles a cuentas creadas después de la migración sin constancia.
  RPC `read_my_legal_acceptances` sólo devuelve las propias. Interfaz: segunda casilla
  obligatoria "Tengo 18 años o más" (`app/login/page.tsx`), versiones visibles en
  Términos/Privacidad, constancias en la exportación de datos. Política provisional
  18+ hasta decisión sobre menores (ver `preparacion-legal-peru.md`).
- Aplicada sólo en la base local con respaldo `.wrangler/auditoria/actualizacion-local-0071-*`
  (psql + registro en `schema_migrations`, por la CLI bloqueada). Staging y
  producción no la tienen. Verificar en producción si existe un trigger
  `handle_new_user` sobre `auth.users`: crearía perfiles sin JWT de usuario y la
  segunda capa no aplicaría a ese perfil automático.
- Evidencia local: `aceptacion-legal.test.ts` + `rls-perfiles.test.ts` contra
  Supabase local real **18/18**; unitarias `legal-acceptance` 4/4 y
  `moderation-export` 4/4; alta real en la vista3070: sin declarar edad no envía
  (foco a la casilla), con teclado llega a `/dashboard`, constancia y perfil creados;
  cuenta ficticia retirada. Lint y tsc limpios. Arneses de prueba declaran la
  aceptación ficticia. Referencia ARIA de Términos ya estaba desfasada antes de este
  cambio: se regenera y revisa en la validación final.
- `test:db` sí puede correr en esta laptop con `scripts/supabase-local.mjs`; sólo
  `db:verify` (reset/lint) necesita la CLI bloqueada.

## Avance del 9 de noviembre de 2026 — lint a cero, tipos y borrado fail-closed

Árbol: HEAD `be58ef6` + cambios locales sin commitear (rama `codex/cierre-integridad-media`).
Comprobaciones dirigidas sobre este árbol, no la suite completa (queda para la validación final):

- Cierre15: las13 advertencias medidas hoy se corrigieron sin desactivar reglas
  ni añadir excepciones (reinicio por cambio de props al renderizar, `useEffectEvent`,
  `useSyncExternalStore`, alias de contadores de generación en limpiezas).
  `npx eslint .` en el checkout principal: **0 problemas**. Techo `--max-warnings=0`.
- `npx tsc --noEmit`: pasó de **20 errores a0**. Eran del trabajo sin validar:
  `.abortSignal()` tras `.single()/.maybeSingle()` (postgrest-js2.118 ya no lo expone
  ahí; se movió antes, misma señal), estrechamiento perdido de `safeExt`, copia
  exacta de bytes para la huella de recuperación y constructor del editor con dueño.
- Cierres1/4: `/api/delete-file` ahora responde503 sin las cuatro variables S3 antes
  de consultar propiedad o reservar borrados (las rutas de subida ya lo hacían). Nueva
  prueba de ruta: borrado por `/api/media` sin origen histórico, enlace https antiguo
  ignorado sin base configurada y reconocido con base exacta, ajeno/en uso omitido,
  fallo de R2 sin detalle interno, sesión y lista inválida. `r2-config.test` habla de
  cuatro variables y prueba que la URL pública no es necesaria ni sustituye a S3.
- Editor: `editor-persistence.test` usa la cuenta propietaria y verifica que cada
  escritura lleva el JWT de esa cuenta y que una sesión de otra cuenta bloquea la cola.
- Vitest dirigido: `lib/editor-persistence.test.ts`, `lib/r2-config.test.ts`,
  `app/api/delete-file/route.test.ts` → **27/27**. Sin `pnpm qa`/build/E2E todavía.
- Cierre17/20: `scripts/guardar-credencial-r2-staging.ps1` guarda la credencial
  exclusiva de staging con DPAPI (entrada oculta, sin texto plano) y
  `scripts/verificar-r2-staging.mjs` prueba list/put/head/get/delete en
  `vibe-staging-artist-media` y denegación en los otros cinco buckets. Sin ejecutar:
  la credencial sigue sin crearse (confirmación humana pendiente en Cloudflare).
- Bloqueo de entorno: Smart App Control de Windows bloquea `supabase.exe` y
  `workerd.exe` (esbuild sí corre). No se tocó la seguridad del sistema. Respaldo
  `scripts/supabase-local.mjs` (conexión desde contenedores, verificada contra la
  API local) y vista local sin workerd. Vista `http://127.0.0.1:3070` restaurada,
  copia607 archivos, `GET /` 200. Sin CLI/workerd siguen bloqueados aquí
  `db:verify`, `cf:test` y preview del Worker: acreditarlos en el trabajo
  `base-de-datos`/Worker del CI (Linux) o con decisión del titular sobre el equipo.

## Cuota por defecto — implementación 6 de noviembre de 2026

Cierre6 sigue abierto. Ante modo ausente/inválido, la aplicación ahora exige
cuota; observar requiere configuración explícita. Límites que no producen un
entero positivo seguro en bytes caen al límite técnico existente de5GiB.
La reserva SQL existente rechaza exceso e inventario desconocido en modo rechazo.
El corte remoto requiere reconciliación previa, no relajar la protección para
hacer pasar las subidas. Sin pruebas nuevas ni cambios de entorno remoto.


## Avance de integridad de colaboraciones — 6 de noviembre de 2026

Implementación local, aún sin gates ni nuevos cierres acreditados:

- Seguimiento0065: sección de solicitudes enviadas paginada y retirada explícita
  con confirmación; conserva historial y sólo permite retirar pendientes propias.
  La carrera con aceptación se resuelve mediante UPDATE condicional y trigger.
  Base local hasta0065, respaldo `actualizacion-local-1793985249905`. Sin pruebas.
  Editar un borrador no retira automáticamente solicitudes del perfil publicado.

- Solicitudes con identificador estable para reintentos y verificación del
  contenido recuperado; respuestas tardías del editor actualizan por identidad.
- 0062 conserva datos de solicitud y limita decisiones a pendiente → aceptada
  o rechazada. 0063 consulta aprobaciones de créditos publicados; perfil público
  coteja identidad completa fuera de la caché, también en fallback de navegador.
- 0064 calcula estado al guardar bloques desde la solicitud real. Cambiar rol
  invalida el vínculo en el editor; refrescar no acepta una solicitud distinta.
- Base local aplicada hasta0064 con respaldo previo
  `.wrangler/auditoria/actualizacion-local-1793985050136`. Aplicación no acredita
  pruebas, restauración ni despliegue; remoto no actualizado en este avance.
- Implementada conciliación manual de solicitudes antiguas al cambiar/eliminar
  crédito. Pendientes casos de concurrencia, RLS, publicación, caché, sesión,
  paginación, retirada y accesibilidad; no equivale a acreditación funcional.

## Implementación local adicional — 6 de noviembre de2026

Sin nuevos cierres acreditados: por instrucción del titular, las pruebas de los
cambios recientes quedan para la etapa final. Los resultados históricos de abajo
no acreditan este árbol de trabajo. Se mantiene pendiente el despliegue remoto.

- Cierre8: centro `/admin`, gestión de roles `/admin/roles`, directorio y escritura
  condicionada0059, historial paginado con RPC0039. Sólo owner asigna/revoca;
  no se cambió ningún rol durante la implementación. Falta aceptación de sesión,
  concurrencia, auditoría y permisos. Ver `runbooks/permisos-equipo.md`.
- Operación: `/admin/mantenimiento` con agregados0058, limpieza manual con
  consulta previa y logs del Worker por fase/resultado. No se activó el Worker
  ni se configuraron notificaciones externas. Ver `runbooks/estado-mantenimiento.md`
  y `runbooks/limpieza-manual.md`.
- Correo: recuperación/confirmación y plantillas preparadas; remitente, dominio
  e instalación remota siguen pendientes. Ver `correo-autenticacion.md`.
- UX/editor: banner generado conectado a vista previa y subida ordinaria;
  preferencias sincronizadas. No se llamó a Together ni se acredita generación.
- Base local:0000–0059 aplicadas, forward-only, con respaldos previos. El log
  `actualizacion-local-1793981556811/migracion.stdout.log` acredita aplicación0059,
  no tests/restauración/operación remota. No sustituye los gates pendientes.

## Implementación adicional pendiente de validar — 2026-11-05

Preparadas consulta independiente /admin/auditoria y migración0042, sin aplicar.
Decisiones visibles a moderadores; actividad histórica sin metadata sólo a owner.
Cola muestra retirada/restitución según estado real del expediente; API limita
lectura del cuerpo y registra fallo de caché sin datos personales. Manual en
runbooks/moderacion.md. Pruebas diferidas por petición del usuario; no se declara
operativo ni cerrado. DB0041 anterior terminó215/215. Auth anterior ejecutó46
casos aprobados, pero falló su limpieza de perfil ficticio: gate NO aprobado.
Balance sin nuevos cierres; no hubo despliegue ni modificaciones remotas.

## Reportes0040 y operación0041 — 2026-11-05

0040: QA477/477, DB207/207, reconstrucción0000–0040, build y Worker42/42
aprobados. Worker incluye reporte real anónimo en escritorio/móvil y rechazos
sin comprobante o con campos administrativos. Logs reportes-0040-*; primer build
sin variables ficticias falló, reintento corregido aprobado. Sin provisión remota.
0041: cola/admin, decisiones con versión, recusación, suspensión/restauración y
registro de decisiones implementados. QA483/483, build y reconstrucción0000–0041
aprobados; DB en curso. UI aún requiere E2E, teclado/axe y referencias visuales.
No declarar moderación operativa completa: faltan notificaciones, contranotificación,
plazos/responsables y aceptación remota. No hay nuevos cierres completos.


## Avance local de permisos — 2026-11-05

**0/27 completos, 18 parciales, 9 pendientes.**
Roles0039: QA464/464 en46 archivos; DB200/200 en18 archivos; build y reconstrucción0000–0039 aprobados. Typecheck posterior al ajuste del helper aprobado. La primera suite DB dio199/200 por AuthSessionMissingError del arnés; la corregida pasó completa (roles-0039-db-corregido.log). Permisos, revocación, auditoría y retirada concurrente verificados con sesiones reales locales. No hay provisión remota ni verificación Worker0039; punto8 parcial, no cerrado. Worker0038 sí pasó40/40 (anonimo-0038-worker-corregido.log).

Los apartados siguientes conservan evidencia anterior.

Objetivo autorizado el 4 de noviembre de 2026. Los tres frentes adicionales
(inventario, entrega/staging e integridad de medios) organizan los mismos 27 cierres.
La autorización actual incluye preparación y despliegue de Vibe después de verificar
los bloqueos críticos. Sustituye la restricción de trabajo exclusivamente local del
encargo de octubre en NEXT_TASK.md. Actualización del titular: ya existe Google
empresarial de Vibe; continuar validando recursos y operación en destino,
conservando los originales hasta validar el destino. No modificar
Bancary, Canodent ni la web personal. Ver `migracion-empresa-vibe.md`.

## Registro de aceptación

### Estado actual — rate limit anónimo 0038, compatibilidad histórica y restauración, 2026-11-05

**0/27 completos, 17 parciales y 10 pendientes.** El punto 7 pasa a parcial:
`lib/anonymous-rate-limit.ts` y la migración 0038 están aplicados solo en local;
health/oEmbed integran el límite compartido. La identidad Cloudflare solo se acepta
en producción con `TRUSTED_PROXY` y contexto `cf`; el comprobante transmite un HMAC, no la IP. Cupos
por identidad: 30/60 y globales 600/3000; sin configuración responde 503. Falta
configurar y validar en remoto/Worker desplegado, por lo que no está cerrado.

QA 451/451 en 44 archivos (14 pruebas obsoletas retiradas y tres de ruta añadidas), DB 193/193 con ejecución secuencial,
reconstrucción 0000–0038 y build aprobados. El primer intento DB concurrente se
invalida por reconstrucción simultánea. E2E público 122/122. Auth40 y visualauth4 ARIA aprobados; Worker0038 aprobado: 40/40 casos locales. Carga adaptada: 6 GET locales, p95 1427 ms; falla el
objetivo de 1000 ms y no acredita capacidad. Detalle en RESULTADOS_PRUEBAS.md.

Compatibilidad histórica restaurada: 14 bloques publicados y 2 borradores pasan
validación; cuatro contactos se preservan. `lib/contact-url.ts` extrae la
resolución ya existente; el sanitizador/validador conserva teléfono, correo y
Telegram. No se sustituyó contenido ni se validó existencia de archivos.

### Estado anterior — inventario y ensayo de restauración, 2026-11-05

**0/27 completos, 16 parciales y 11 pendientes.** Los puntos 10, 18 y 22
ahora tienen evidencia parcial; ninguno satisface todavía su aceptación completa.
Este balance sustituye los recuentos históricos inferiores. No hubo despliegue
ni aplicación remota de migraciones en este ensayo.

- Respaldo cifrado restaurado en una base local aislada, con escucha TCP
  desactivada. Las 58 tablas respaldadas coincidieron con el origen en filas
  y SHA-256 del contenido antes de aplicar migraciones.
- Migraciones 0018–0037 aplicadas sobre esa copia: se conservaron 3 usuarios,
  2 perfiles, 14 bloques y 63 registros de Storage. No equivale a restaurar
  los archivos físicos ni a validar un corte remoto.
- Inventario R2: 67 objetos; 35 candidatos vinculados a perfiles, 32 objetos
  sin referencia conservados sin atribución y 1 audio referenciado ausente
  también en el origen (HTTP 404). LIST/HEAD actuales concuerdan con tamaño
  y ETag de la copia previa; no se recalculó el hash remoto de cada archivo.
- Ensayo local: 35 registros de medios creados y autorizados por la consulta
  anónima. La atribución procede de referencias de perfiles y requiere revisión;
  no acredita por sí sola quién subió originalmente cada archivo.
- El validador existente rechaza enlaces de 2 bloques hero publicados y
  ambos borradores. No se eliminó ni sustituyó contenido para hacerlos pasar.

Evidencia privada, cifrada cuando contiene datos, bajo
`.wrangler/migracion-empresa-2026-11-04/`: `restauracion-cotejo.json`,
`ensayo-migraciones-resumen.json`, `ensayo-inventario-resumen.json`,
`resumen-inventario-2026-11-05.json` y `contenido-restaurado-resumen.json`.
No repetir los gates anteriores por esta actualización documental.
Siguiente aceptación: resolver compatibilidad de contenido histórico sin pérdida,
completar la revisión del inventario y preparar el corte verificable en staging.
Siguen abiertos seguridad anónima/roles, UX integral, operación, legal y producción.

### Corte de estado solicitado por el titular — lectura 0037 y mantenimiento

Balance: **0/27 completos, 13 parciales y 14 pendientes**. No confundir pruebas
aprobadas con cierres completos. No hay despliegue ni migración remota nueva.

La lectura local autoriza cada petición según sesión, publicación y suspensión.
Las nuevas URLs usan /api/media/; los orígenes públicos históricos y sus cachés
siguen pendientes de inventario y corte, por lo que el punto 3 no está cerrado.

Evidencia bajo .wrangler/auditoria/, prefijo lectura-0037:
- QA429/429, 42 archivos, 18 warnings, exit0 (qa-final.log).
- DB186/186 y reconstrucción0000–0037 aprobadas; no repetir sin cambios SQL.
- Auth40/40, público122/122, visual24ARIA y visualauth4ARIA aprobadas.
  Las24 referencias de píxeles siguen omitidas.
- Build Next/OpenNext y Worker40/40 aprobados (worker.log): WAV real,
  invalidación de cuatro etiquetas D1, caché R2 y revocación de enlaces.
- Mantenimiento sin sesión aprobado (mantenimiento-final.log): fallo parcial
  conserva marcador y cuota; reintento libera sólo la reserva vencida; PUT tardío
  rechazado; cierre de21 objetos en dos tandas elimina Auth y conserva atribución,
  sin afectar otra cuenta. Se corrigió redirect:error, no admitido por workerd,
  por manual con rechazo de respuestas no exitosas. Cinco unitarios adicionales
  verifican que redirecciones no se siguen ni provocan escrituras R2.

La prueba de mantenimiento usa Worker/R2 local y Supabase local real; las pruebas
HTTP de la aplicación usan fixture HTTPS de almacenamiento. No certifican firmas
S3, CORS ni operación remota. Próxima aceptación: inventario y preparación del corte
de orígenes empresariales, sin borrar originales. UX integral, operación y legal
siguen pendientes; el trabajo previo de descubrimiento no equivale a rediseño completo.

### Ejecución reanudada — 2026-11-05

Solicitud vigente: finalizar los 27 cierres, migración empresarial y despliegue en
Cloudflare tras los gates. Autoriza mejorar UX/UI sustituyendo explícitamente la
preservación exacta de capturas. Preservar capacidades, contenido y permisos.
El titular confirmó Perú, sin entidad formalizada ni dominio; pide preparar
formalización, opciones de dominio y evaluar participación de menores. No hay
identidad legal ni edad mínima aprobadas, ni autorización de compras.

Secuencia activa: A estado/fallo 0032 → B integridad y seguridad → C UX/UI →
D migración y staging → E recuperación, operación, carga y legal → F CI y producción.
Esta tabla sigue siendo el registro único; enlazar aquí implementación y evidencia,
sin convertir notas históricas en certificación actual.

- A: HEAD `be58ef69ee7e1ccf507b51505f8b2e9801f894ea`, rama
  `codex/cierre-integridad-media`, índice vacío; cambios previos preservados.
  Base local confirmada 0032 y vista `http://127.0.0.1:3070` HTTP 200.
  `media_assets` no tiene política UPDATE: PostgREST devuelve cero filas,
  no 42501. `test/database/media-reservations.test.ts` ahora verifica resultado
  vacío e inventario persistido íntegro después de cada intento, además de cuota.
  No se cambió SQL. `node scripts/probar-supabase-local.mjs test:db` en copia
  aislada: **156/156** (antes 155/156); log `avance-0032-db.log` bajo
  `.wrangler/auditoria/`. Los gates posteriores se registran en el bloque B.
- B: integración local de reserva/PUT condicional/HEAD/finalización en
  `/api/upload-url`, `/api/finalize-upload` y `lib/upload-protocol.ts`, compartida
  por editor y catálogo. Borrado individual y limpieza escriben marcadores vacíos
  y confirman retirada con recibo. 0033 extiende retirada a históricos atribuidos
  y separa el límite de finalización. Cuenta todavía usa protocolo antiguo.
  Evidencia de esta versión: QA **366/366 en 38 archivos**, 21 warnings y cero
  errores; build Next aprobado; DB **159/159 en 13 archivos**; reconstrucción
  **0000–0033** y lint public/private sin errores; editor autenticado **34/34**
  con Supabase real local y fixture HTTPS de almacenamiento; visual autenticado
  **4/4 ARIA**. Logs `avance-0033-{qa,build,db,reconstruccion,auth,visual-auth}.log`
  bajo `.wrangler/auditoria/`. La ejecución OpenNext `avance-0033-worker.log`
  terminó exit0 con 34/34 en 2.8 min, WAV real, cuatro etiquetas D1 invalidadas
  y caché R2 comprobada. El fixture HTTPS no valida firmas S3 ni CORS real, y
  no prueba staging/remoto. No desplegar hasta completar corte.
- Recuperación de subida posterior: un reintento automático por etapa ante red
  o 5xx, con el mismo identificador/cuerpo, PUT condicional y key de finalización.
  QA **366 → 377**, 38 archivos, 21 warnings; build Next aprobado y Worker/editor
  revalidados **34/34** cada uno. Logs `reintentos-0033-*`; resultados completos
  en `../RESULTADOS_PRUEBAS.md`. Recarga de pestaña y reservas abandonadas siguen
  pendientes; el avance no cierra por sí solo el punto 4 ni la cuota global.
- Legal/dominio: [preparación para Perú](preparacion-legal-peru.md), borrador.
  El titular rechazó las propuestas de dominio y prefiere Vibe; primero revisar
  viabilidad de marca y antecedentes en Indecopi. No se ha comprado dominio ni
  realizado búsqueda registral completa; tampoco se han activado controles de menores.
- Supresión0034: ruta y pantalla conectadas al cierre congelado por la base,
  inventario duradero, retirada por lotes25 y recibos; la RPC antigua tampoco
  permite saltar el protocolo. QA392, DB166, reconstrucción0000–0034, auth38 y
  público112 aprobados. Build Next y Worker38 aprobados (WAV real y D1/R2 local);
  visualauth4ARIA y visualpúblico24ARIA aprobadas;24píxeles omitidas. Evidencia y límites actualizados en
  `../RESULTADOS_PRUEBAS.md`; ninguna prueba local acredita drenaje o R2 remoto.

Cada cierre exige pruebas actuales y evidencia del entorno correspondiente.
Un componente implementado localmente no cierra su verificación remota.

Balance de cierres completos al corte 0035: **0 de 27**. Hay avance parcial en
12 (1, 2, 4, 5, 6, 12, 13, 15, 16, 17, 19, 27); los otros 15 siguen pendientes
de cierre. Este recuento no es un porcentaje de esfuerzo ni de producto terminado.
La mejora integral de UX/UI y el despliegue final también permanecen pendientes.
0036 implementa el ejecutor sin sesión y limpieza de reservas: aplicada sólo local,
QA398 y build aprobados. Integración pendiente por errores500/timeouts de Docker;
siete pruebas DB nuevas aún sin ejecutar. No modifica este balance todavía.

Incremento UX posterior: navegación y descubrimiento visibles en3070 y Chrome;
QA398, suite pública122 y visual24ARIA aprobadas,24píxeles omitidas, build exit0.
Advertencias de lint21→18. Hay errores de consola en escenarios de recuperación
que impiden declarar la verificación global limpia. Alcance y evidencia en
[UX de descubrimiento](ux-descubrimiento-2026-11.md) y `../RESULTADOS_PRUEBAS.md`.
No completa el rediseño integral, los cierres27 ni un despliegue.

| Nº | Cierre y evidencia necesaria | Estado |
|---|---|---|
| 1 | Publicación/borrado serializados con referencias persistentes, pruebas de carrera | Parcial local: referencias y reclamación serializadas, PUT condicional, finalización verificada y marcador conservado. Ejecutor sin sesión implementado en workers/media-maintenance.ts y recuperación0066; faltan drenaje histórico, configuración y comprobación remota. |
| 2 | Supresión de cuentas con congelación, drenaje de firmas y reintentos | Parcial0034: congelación DB, lotes25, marcadores/recibos, propiedad duradera y UI202 integrados localmente; DB166 y auth38. Ejecutor sin sesión implementado y0066 completa cierres interrumpidos; faltan activación remota, drenaje histórico, retención, URLs/cachés y evidencia final. |
| 3 | Suspensión efectiva de acceso a medios, incluido enlace anterior conocido | Parcial0037 local: autorización por petición, lecturas privadas/públicas y rangos; DB186 y auth40 aprobadas. Misma URL deja de servir tras suspensión y vuelve al restaurar. Metadatos sociales normalizados. Faltan orígenes antiguos, cachés y prueba remota. |
| 4 | Finalización de subida verifica objeto y registro, reintento seguro | Integrado en editor y catálogo, revalidado localmente hasta0035 con HEAD y recibo antes de emitir URL. Reintento de red/5xx dentro de la llamada verificado; recuperación entre sesiones implementada en lib/upload-recovery.ts, pendiente de pruebas finales; integración R2 remota pendiente. |
| 5 | Todos los editores y clientes antiguos respetan garantías DB y caché | Parcial local: triggers protegen seis fuentes, 0034 congela la cuenta y 0035 deniega escrituras directas del inventario. Faltan drenaje histórico, revisión completa de clientes y cachés/remoto. |
| 6 | Reserva de cuota atómica, errores cerrados, pruebas concurrentes | 0035 cierra INSERT/UPDATE/DELETE directos y UPSERT; DB 172 verifica concurrencia y conservación de cuota. Pendientes: reconciliar históricos, limpiar reservas abandonadas, activar/verificar modo estricto y R2 privado remoto. |
| 7 | Rate limit anónimo compartido con identidad no falsificable | Parcial local 0038: health/oEmbed integrados; identidad CF solo producción + `TRUSTED_PROXY` + contexto `cf`, comprobante HMAC sin transmitir IP, cupos 30/60 por identidad y 600/3000 globales, 503 sin configuración. DB/reconstrucción/build locales aprobados. Reportes anónimos ya usan comprobante HMAC en lib/anonymous-report.ts y migración0040; no reimplementar esa protección. Remoto y Worker desplegado pendientes. |
| 8 | Roles administrativos DB, asignación/revocación y auditoría | Parcial local0039: roles separados, asignación/revocación, auditoría y protección concurrente del último owner. QA464, DB200, build y reconstrucción aprobados. Falta provisión remota y verificación de runtime integrado. |
| 9 | Reportes, suspensión y retirada verificadas extremo a extremo | Implementado localmente sin acreditar: reportes anónimos firmados0040, cola/decisiones/suspensión0041, auditoría0042, solicitudes de revisión0044, avisos/apelaciones y exportación. Faltan E2E/teclado/axe, responsables y plazos del titular, notificaciones reales y prueba remota. |
| 10 | Inventario de contenido histórico y validación estricta segura | Parcial: 67 objetos inventariados; 35 candidatos ensayados localmente, 32 sin referencia preservados y 1 audio ausente. Dos bloques hero y ambos borradores fallan validación de enlaces. Faltan resolver compatibilidad, atribución y corte sin pérdida. |
| 11 | Latencia y coste de consultas de permisos/versiones medidos | Pendiente |
| 12 | WAV real convertido por navegador sobre Worker | Worker local verificado: WAV PCM real de medio segundo, FFmpeg real y MP3 decodificado; suite38/38, de las cuales solo2 prueban WAV (escritorio/móvil). Fallos/concurrencia/recuperación y staging remoto pendientes. |
| 13 | Publicación autenticada e invalidación D1 integradas | Worker local revalidado con 0035: 38/38, cuatro etiquetas invalidadas en D1 y objetos de caché R2 comprobados; staging remoto pendiente. |
| 14 | Baselines de píxeles revisados individualmente y aprobados | Pendiente |
| 15 | Reducir las 22 advertencias sin desactivar reglas | Implementado 2026-11-09: 22 → 18 → 13 medidas → **0**, techo `--max-warnings=0`, sin reglas apagadas. Falta confirmarlo en `pnpm qa` final y en CI. |
| 16 | Entrega preservada, commits/PR revisables, CI y protecciones | En curso |
| 17 | Rotación de S3 R2 limitada al bucket de artistas, revocación comprobada | En curso: sustituta verificada con listado/HEAD y acceso a otros buckets denegado; primera clave revocada devuelve 403 |
| 18 | Backup y comparación/aplicación ordenada de migraciones remotas | Parcial: respaldo cifrado nuevo, 58 tablas cotejadas y 0018–0037 aplicadas sin pérdida de filas principales sobre copia aislada. Origen sigue en0017; faltan compatibilidad final, corte coordinado y verificación remota. |
| 19 | Variables, bindings, D1, WASM y CORS verificados en cuenta correcta | En curso: cuenta/perfil empresarial, D1 y WASM verificados; falta runtime y CORS integrado |
| 20 | Staging con sesión/subida/publicación/permisos/suspensión/caché reales | Infraestructura preparada: tres buckets R2, WASM, D1, Supabase iyppeurjtbuydhjtraxf con0000–0070 y claves HMAC independientes. Registro público cerrado durante preparación. Faltan runtime, origen, R2 credenciales/CORS y recorridos finales. Ver docs/staging.md. |
| 21 | Dominio, correo y recuperación con entrega y enlaces comprobados | Pendiente de identidad/remitente final |
| 22 | Restauración DB y medios ensayada, RTO/RPO aceptados | Parcial: restauración local aislada de DB probada y contenido de58 tablas coincidente por SHA-256. Faltan restauración de archivos, copia independiente, ensayo operativo completo y RTO/RPO aceptados. |
| 23 | Alertas probadas y responsables/procedimientos definidos | Pendiente |
| 24 | Identidad legal, reclamaciones, privacidad y retención decididas y aplicadas | Parcial técnico: borradores legales, guarda provisional 18+ con constancia versionada en DB (0071, local) y exportación. Pendientes del titular: identidad legal, menores, retención, revisión profesional; 0071 sin aplicar en staging/producción. |
| 25 | Carga representativa y costes medidos, límites documentados | Pendiente |
| 26 | Despliegue verificado y rollback compatible con migraciones ensayado | Pendiente |
| 27 | Transferencia a cuenta empresarial con inventario y verificación | En curso: Supabase y GitHub transferidos; copia R2 de 67 objetos cotejada; quedan runtime, integración y corte |

## Evidencia del inicio

- HEAD base `be58ef69ee7e1ccf507b51505f8b2e9801f894ea`, índice inicialmente vacío.
- Rama nueva `codex/cierre-integridad-media`, preservando cambios de Astra.
- Respaldo local `.wrangler/cierre-2026-11-04-inicial/` con diff binario,
  estado Git y los 33 archivos no rastreados iniciales. No se publica el respaldo.
- QA inicial ejecutado en copia aislada, 316 pruebas y 22 warnings, código de salida 0.
- GitHub `main` apunta a `5e184a1`. Protección exige seis checks y rama actualizada.
  `enforce_admins=false`, cero aprobaciones obligatorias. No se cambiaron protecciones.
- Los últimos tres workflows CI consultados terminaron en fallo. Se deben diagnosticar
  sus jobs, sin confundir ejecuciones Dependabot exitosas con QA de aplicación.
- Vercel responde en `https://musician-profile-dashboard-iqu5.vercel.app/api/health`
  con HTTP 503, estado degradado, Supabase error, R2 ok y versión desarrollo.
  Esto prueba un despliegue antiguo accesible y degradado, no su versión exacta.
- Cloudflare personal no tiene Worker Vibe. D1 de caché vacía, bucket de caché vacío
  y bucket de estáticos con un WASM; medios de artistas aún por confirmar.
- Supabase remoto registra migraciones 0000–0017: faltan 0018–0025 en ese historial.
  El panel mostró Healthy después de una lectura inicial Unhealthy; no hay backup
  visible. No se aplicaron migraciones ni se cambiaron datos.
- QA de la corrección de cuota: 331 pruebas (antes 316), 22 warnings, exit 0.
- Base local: 129 pruebas, exit 0. Build aislado inicial falló por variables públicas
  ausentes; repetición con valores de CI aprobada, exit 0. No prueba conexiones remotas.
- Auditoría de dependencias: 27 high y 5 critical; requiere corrección antes de deploy.
- Respaldo adicional `historial.bundle` local verificado; no se sube a Git.
- GitHub: repo transferido a `vibemusicprofile-oss/musician-profile-dashboard`,
  mismo ID `1297962278`; `main` y nueve ramas `codex` conservaron hashes, dos
  ramas Dependabot se actualizaron automáticamente. `origin` apunta al destino;
  no hubo push ni commits.
- Supabase: proyecto transferido a organización Vibe (`gojxsdxguggjmcbkwbhb`) y
  renombrado `Vibe Music`; el miembro temporal Developer fue retirado con
  confirmación explícita. La UI muestra un miembro `vibemusicprofile@gmail.com`
  Owner. Post-transfer: usuarios 3, perfiles 2, bloques 14, `storage.objects` 63,
  `media_assets` 0 y migraciones 18; coincide con baseline.
- Antes de retirar al miembro se respaldaron 80 snippets privados únicos y se
  verificaron (80/80, 141340 bytes de texto plano total) en
  `.wrangler/migracion-empresa-2026-11-04/snippets-cifrados/manifest.json`, cifrados
  con DPAPI local. Al retirarlo, se eliminaron los snippets del panel, no la BD ni
  archivos. La copia Supabase cifrada existente no incluye archivos.
- Cloudflare empresarial `5b647e532f3d4996206529d5595295f3`: R2 activo; buckets
  privados vacíos `vibe-artist-media`, `vibe-cache-incremental` y `vibe-static-assets`.
  D1 `02051ecd-e52a-4b5f-8e81-f5d44b63a03f` creada y vacía.
- Exportación Supabase remota de esquema, roles, datos y `migrations-data`: 3
  `auth.users`, 2 `profiles`, 63 `storage.objects`, 0 `media_assets`. La copia
  cifrada DPAPI CurrentUser está en `.wrangler/migracion-empresa-2026-11-04/`;
  solo puede recuperarse con ese perfil de Windows. No existe backup independiente
  ni restauración DB verificada; no incluye archivos de Storage/R2. Se conservaron
  `conteos.json` y se borraron los cuatro SQL temporales en texto plano.
- La copia anidada que causó el fallo de auth no tenía raíz Git; la copia original
  permanece intacta. `preparar-verificacion` inicializó Git sin remoto. Reintentos
  aislados: E2E auth 32 passed, visual auth 4 passed (ARIA), ambos exit 0.
  Esto no aprueba baselines de píxeles ni completa una fase.
- Actualización 2026-11-04: Wrangler empresarial usa perfil `vibe` autorizado,
  asociado solo al repositorio; perfil global y Bancary intactos. Supabase CLI
  empresarial está aislada y su token usa DPAPI; `projects list` solo mostró
  `Vibe Music` en `ACTIVE_HEALTHY`. El dry-run de `0018`–`0024` no aplicó cambios:
  `0022` no es compatible con rutas antiguas antes de un corte coordinado.
- D1 empresarial inicializada: `revalidations(tag,revalidatedAt,stale,expire)`,
  `tag` único, 0 filas. WASM cotejado con la descarga: 32,232,419 bytes, SHA-256
  `9F57947A5BD530D8F00C5B3F2CB2A3492FAA7E5D823315342D6A8656D0A6B7B7`.
- Copia R2 personal `derias-assets` → empresarial `vibe-artist-media` completada:
  67 objetos/124,720,470 bytes (15 audios, 52 imágenes). SHA-256, metadatos e
  inventarios coinciden; origen intacto. Evidencia ignorada por Git:
  `.wrangler/migracion-empresa-2026-11-04/r2-copia-verificada.json`. Destino privado,
  `media_assets` sigue en 0, URLs antiguas intactas y sin deploy; caché vacía.
- Credencial empresarial creada, rotada tras exposición accidental y verificada
  con alcance solo al bucket de artistas; revocación de la primera clave
  comprobada. Detalle operativo y evidencia: [migracion-empresa-vibe.md](migracion-empresa-vibe.md).
  GitHub `main`, seis checks y protecciones verificados sin cambios.
- QA 331, DB 129, E2E auth 32 y visual auth 4 (ARIA) aprobadas. El proyecto se
  renombró de `decima` a `Vibe Music` el 2026-11-04, manteniendo ref y datos.
- Evidencia local del checkpoint del 4 de noviembre: Worker compilado 34/34 E2E escritorio/móvil y
  aserciones D1 aprobadas; el gate global falló por caché R2 vacía. La causa
  probada fue la falta de permiso anónimo `SELECT` sobre `content_version`.
  `0025_version_publica_perfil.sql` concede solo esa columna; se aplicó en DB
  local mediante `migration up`, sin reset. DB: 131/11 (antes 129/10); QA:
  331/31, 21 warnings. La nueva aserción exige título HTML sin JavaScript.
  Punto 12 verificado solo en Worker local; staging remoto pendiente. En esa fecha
  aún estaban pendientes la repetición y `db:verify`.

- Actualización 2026-11-05: `.wrangler/auditoria/worker-autenticado-0025.log`
  confirma 34 aprobadas en 3.7 min, exit 0, con WAV real (solo dos pruebas,
  escritorio/móvil), cuatro etiquetas invalidadas en D1 y aserción de objetos R2.
  Cierres 12 y 13 verificados en Worker local; staging remoto sigue pendiente.
  `db:verify` aislado terminó exit 0: reconstruyó 0000–0025 y `dblint` indicó
  `No schema errors` en `vibe-reconstruccion` (55422, `--solo-db`, PG 17.6.1.158).
  Esto no valida el remoto PG 17.11.3. `visual-auth-0025.log`: 4 aprobadas,
  23.8 s, exit 0. QA continúa 331/31, 21 warnings, 0 errores; DB 131/11;
  E2E público 112; visual público 24 ARIA y 24 píxeles omitidas; auth Next 34.
  Migraciones remotas 0018–0025 siguen pendientes. No declarar completos los 27 cierres.

- Actualización 2026-11-05 — integridad de medios: migraciones 0026–0029 aplicadas
  en DB local sin reset. `qa-media-0028-final.log`: 342/342 pruebas, 32 archivos,
  21 warnings, 0 errores, exit 0; `db-media-0028-final.log`: 143/143, 12 archivos,
  exit 0; `db:verify` 0028 pasó. La reconstrucción local de 0029 aborta si el
  backfill descubre una referencia a una key ya tombstoned; la reconciliación
  preserva el contenido y reconstruye solo el ledger. Build, reconstrucción completa
  y auth contra 0029 están pendientes. Las migraciones remotas 0018–0029 siguen
  pendientes de un corte coordinado. Cierres 1 y 5 son parciales, no globalmente
  cerrados; 2, 4 y 6 continúan activos. Evidencia e interpretación en
  [integridad-media-2026-11.md](integridad-media-2026-11.md).

- Ampliación del checkpoint — migración 0030: build, reconstrucción y DB de 0029
  pasaron; `db-media-0029.log` registra 143/143 pruebas en 12 archivos, exit 0.
  La migración forward-only 0030 corrige avisos de lint del normalizador SQL y se
  aplicó localmente; lint de esquemas `public` y `private`, exit 0. Auth de
  0029/0030 no se ha probado aún. Aplicación remota 0018–0030 pendiente.

## Próximo bloque

Checkpoint de dependencias 2026-11-04: auditoría actual 0 críticas, 0 altas,
2 moderadas y 1 baja; dependencias de producción, 0 alertas. Ver evidencia y
límites en [dependencias-2026-11.md](dependencias-2026-11.md). La verificación
de esquema D1 antes de despliegue consta en [cloudflare.md](cloudflare.md).

Completar congelación y drenaje de firmas/reintentos al eliminar cuenta; resolver
PUT tardío, finalización y cuota (cierres 2, 4 y 6), ejecutar build/reconstrucción/auth
de 0029 y planear el corte remoto 0018–0029. Instalar y comprobar la credencial
empresarial en runtime; validar CORS, bindings e integración R2 privada; preparar
backup/restauración. No declarar completos los 27 cierres.

Avance2026-11-06:0044 prepara solicitudes internas de revisión, consulta del titular y acceso del moderador. Sin aplicar ni probar. No cierra9/24: faltan resolución formal, notificación, exportación y evidencia de permisos/concurrencia/borrado. Consultar continuidad vigente en NEXT_TASK.md.

### Implementación local adicional: sesión de comentarios (2026-11-06)

Cierres 5/seguridad: envío y eliminación de comentarios reciben la identidad que
inició la acción. Se verifica contra usuario/sesión actual y se fija su JWT tanto
en escritura como en consulta de recuperación, evitando adoptar otra cuenta a
mitad de operación. Se conserva RLS e idempotencia. Pendiente validación final de
cambio de sesión, expiración, reintento y permisos; sin nuevos cierres acreditados.
