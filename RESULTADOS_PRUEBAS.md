# Evidencia vigente — continuación del 2026-11-09

Base: HEAD `f3303fd7fa20a3b2934788298e230de9e1964d64`, rama
`codex/cierre-integridad-media`, índice inicialmente vacío. Se conservaron los
cambios locales de Claude (audio y 24 ARIA), el prompt y el traspaso no rastreados.
Las correcciones nuevas afectan al aplicador de staging y al arnés autenticado;
no cambian el esquema ni la UI. Audio y referencias recuperados se consolidaron.

| Comprobación en esta continuación | Resultado real | Alcance |
|---|---|---|
| `pnpm qa` | salida 0; 525/525 en 54 archivos; tipos y lint 0 | Árbol local con cambios de audio y preparador de migraciones. |
| Build Next aislado (`pnpm build` / mismo binario Next) | salida 0; 38 páginas generadas | Copia `cloudflare`, variables públicas ficticias; no prueba conexión remota. |
| `pnpm exec vitest run --config vitest.db.config.mjs test/database/staging-migration.test.ts` | salida 0; 5/5 | PostgreSQL real, base efímera separada; éxito, rollback por SQL/historial, secuencia y concurrencia. |
| `GET http://127.0.0.1:3070/legal` | HTTP 200 | Vista local separada del build. |
| E2E autenticado | corrida completa: 44/46; repetición dirigida final: 4/4 | Los dos fallos iniciales de moderación eran de preparación. Provisión efímera añadida a los comandos directos y dos etiquetas del test actualizadas; no se repitieron los otros 44 casos. |
| Visual autenticado | salida 0; 4/4 | Referencias ARIA revisadas en cuatro anchos; no aprobación de píxeles. |

Unitarias: **511 → 525** respecto del log final de Claude: dos casos de audio ya
presentes al retomar y doce del preparador nuevo. Las cinco pruebas DB son
adicionales a la suite 221 de Claude; no se afirma haber ejecutado una suite
completa de 226 en esta continuación. El primer intento dirigido falló porque
Docker estaba detenido; tras recuperarlo pasó. `db:verify` no se volvió a ejecutar.

Logs de esta continuación en
`.wrangler/auditoria/continuacion-codex-2026-11-09/`: `auth-corregido.log`
(44/46), `moderacion-verificada.log` (4/4) y `visual-auth-final.log` (4/4).
Los lanzamientos previos que fallaron por preparación o referencias desfasadas
siguen conservados. Las 24 referencias públicas recuperadas y las cuatro del
editor fueron revisadas; no se generaron ni aprobaron referencias de píxeles.
Los comandos directos preparan y eliminan al moderador ficticio si no lo recibió
el arnés superior; las claves de pruebas no se propagan al servidor de la app.

Consolidación: `685b299` migraciones atómicas, `f15b1e9` arnés autenticado,
`d63c955` audio, `2f05a05` ARIA públicas, `3f6a8d9` exclusión de una única huella
de falso positivo de gitleaks (ruta del archivo de configuración de Playwright).

### Evidencia final recuperada de Claude

Logs existentes bajo `.wrangler/auditoria/final-2026-11-09/`, inspeccionados al
retomar. Corresponden a su copia aislada del trabajo recuperado; no acreditan
el preparador nuevo ni staging/producción y no se presentan como nuevas ejecuciones.

| Log | Resultado |
|---|---|
| `qa.log` | salida 0, 511/511, tipos y lint limpios |
| `build.log` | salida 0 |
| `db.log` | salida 0, 221/221 en 21 archivos |
| `e2e.log` | salida 0, 122/122 |
| `visual.log` | salida 0, 24 ARIA aprobadas y 24 píxeles omitidos |
| `cf-build.log` | salida 0, build OpenNext |
| `cf-test.log` | salida 0, Worker local con D1/R2/DO/WASM, salud, caché, publicación y suspensión |

Las referencias de píxeles no están aprobadas. CI remoto, recorrido de staging,
credencial R2 de staging, correo/dominio y aceptación operativa/legal siguen
pendientes. No hubo push, despliegue ni migración remota en esta continuación.

## Historial de evidencia — 2026-11-05

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

## Actualización documental — compatibilidad de contactos y rate limit 0038, 2026-11-05

- Restauración: `contenido-restaurado-resumen.json` informa 14 bloques publicados
  válidos, 2 borradores/14 bloques válidos, cero inválidos y cuatro contactos
  preservados. Alcance limitado a forma/tamaño/profundidad y enlaces; no verifica
  todos los campos ni existencia de archivos. No hubo mutación remota.
- `lib/contact-url.ts` concentra la resolución de canal ya existente; el
  sanitizador conserva teléfono, correo y Telegram. Logs `contacto-historico-*`:
  QA443, auth40, visualauth4 ARIA, build aprobado, público122, visual24 ARIA
  (24 píxeles omitidas) y Worker40 aprobado.
- 0038: QA451/451 en 44 archivos (14 pruebas de mapa/cabeceras obsoletas retiradas y tres pruebas
  adicionales de ruta incluidas); DB193/193 secuencial, reconstrucción
  0000–0038 y build aprobados. El primer DB concurrente queda invalidado por
  reconstrucción simultánea. E2E público122/122; auth40 y visualauth4 ARIA aprobados. Visual público: 24 ARIA aprobadas y 24 píxeles omitidas. Worker0038 aprobado: 40/40 casos locales. Logs `.wrangler/auditoria/anonimo-0038-*`.
- Migración y verificación son solo locales. Falta configuración remota y Worker
  desplegado. Carga adaptada a partir del script Bancary: seis GET locales, p95
  1427 ms frente al objetivo de 1000 ms (fallido); no mide capacidad.
- Balance del registro: 0/27 completos, 17 parciales y 10 pendientes. No hay
  cierre global ni despliegue.

## Lectura revocable 0037 — gates locales

- HEAD be58ef69ee7e1ccf507b51505f8b2e9801f894ea; índice vacío, cambios locales
  y no rastreados preservados. Sin commit ni despliegue.
- Unitarias398→429 en42 archivos; QA exit0,18 warnings. Log `lectura-0037-qa-final.log`.
  Incluye borradores/catálogo, metadatos sociales y cinco casos de redirección de mantenimiento.
- DB172→186 en16 archivos, exit0: siete casos0036 y siete0037; log
  `lectura-0037-db.log`. Reconstrucción0000–0037 exit0, log
  `lectura-0037-reconstruccion.log`. Logs bajo `.wrangler/auditoria/`.
- Auth38→40 casos: **40 pasan**, exit0, `lectura-0037-auth-final.log` (1.8min).
  Subida/finalización/publicación/GET/rango/HEAD y suspensión/restauración sobre
  la misma URL en ambos dispositivos. El fallo anterior en HEAD era una expectativa
  incorrecta: Next16.4.5 filtra Content-Length en send-response; RFC9110§8.6 permite
  omitirlo. Se prueba cuerpo vacío, tipo, no-store y valor exacto si aparece; el
  unitario sigue exigiendo tamaño exacto y GET/rango comprueban bytes reales.
- Público122/122, exit0 (`lectura-0037-publico-final.log`,1.1min). Las dos
  expectativas de miniatura se adaptaron al nuevo src y el mock sólo entrega
  objetos declarados en datos.json; no acredita permisos de entrega.
- Visual24ARIA,24píxeles omitidas (`lectura-0037-visual.log`); visualauth4ARIA
  (`lectura-0037-visual-auth.log`), ambos exit0. Build Next dentro de OpenNext
  terminó correctamente; Worker40/40 exit0 (lectura-0037-worker.log), WAV real,
  cuatro etiquetas D1 invalidadas, caché R2 y revocación de enlaces.
- Mantenimiento real local exit0 (lectura-0037-mantenimiento-final.log): fallo parcial
  conserva marcador/cuota; reintento retira reserva vencida, rechaza PUT tardío y
  conserva ready/reserva vigente. Cierre de21 objetos sin sesión en dos tandas,
  Auth eliminada, atribución conservada y otra cuenta intacta. workerd no admite
  redirect:error; manual más rechazo de 3xx mantiene la restricción de no seguir
  redirecciones. Cinco pruebas unitarias adicionales. No se cambió SQL.
  Orígenes históricos/cachés, firmas S3/CORS y operación remota pendientes.
- Compilación final posterior al arreglo de mantenimiento: pnpm build exit0,
  lectura-0037-build-final.log, copia aislada con configuración pública ficticia.
- Git: HEAD be58ef69ee7e1ccf507b51505f8b2e9801f894ea, índice vacío,161 entradas
  incluyendo no rastreados; inventario lectura-0037-git-status.txt. Sin commit.
- Balance:0/27 completos,13 parciales,14 pendientes. No entregar como fase lista.

## Descubrimiento y navegación — entrega parcial posterior a 0036

1. HEAD `be58ef69ee7e1ccf507b51505f8b2e9801f894ea`, rama
   `codex/cierre-integridad-media`, índice vacío; sin commits ni despliegue.
2. `git status --short`: 146 entradas, incluidos no rastreados. Copia del
   inventario en `.wrangler/auditoria/ux-git-status.txt`; cambios ajenos preservados.
   `git diff --check` terminó exit0.
3. Unitarias **398 → 398**, 39 archivos. Suite pública anterior112; se añaden
   diez ejecuciones funcionales (cinco casos en escritorio y móvil). El test
   efímero de capturas no cuenta como cobertura permanente y fue retirado.
4. `pnpm qa`: exit0,398/398,18 warnings,cero errores
   (`ux-qa-final.log`); techo21→18 sin desactivar reglas. `pnpm build`: exit0,
   copia aislada con variables públicas ficticias (`ux-build.log`).
   `pnpm test:visual`: exit0,24ARIA aprobadas y24píxeles omitidas
   (`ux-visual.log`). Actualizadas sólo cuatro referencias ARIA del feed:
   navegación nombrada y Categorías→Descubrir; cada diff revisado.
   Pruebas enfocadas finales:10/10; log `ux-movil.log` también contiene diez
   tareas efímeras de captura, total20/20. Incluyen axe WCAG2.2AA sin desactivar
   contraste en las áreas nuevas y límites del reproductor390×667.
   `pnpm test:e2e` final: exit0, **122/122** en58.5s
   (`ux-publico-final.log`), frente a112 antes del incremento. La primera
   ejecución intermedia120/120 queda conservada en `ux-publico.log`.
5. Auditoría conjunta de límites: las aserciones de recuperación pasan, pero
   el navegador imprime errores de cuenta inexistente y red caída. No cumple
   todavía el requisito global de consola limpia. Next dev emite advertencia
   de DOQueueHandler/OpenNext y de raíz de workspace en la copia; no son prueba
   de un Worker remoto correcto. No hay referencias de píxeles aprobadas.
   La integración DB/auth/Worker de0036 sigue pendiente por la incidencia de
   Docker del apartado siguiente. El rediseño integral tampoco está cerrado.

Vista3070 HTTP200, componentes actualizados y Servicios abierto en Chrome.
Capturas actuales revisadas y limitaciones en `docs/ux-descubrimiento-2026-11.md`.
Balance de aceptación sin cambios:0/27 completos,12parciales,15pendientes.

## Incremento 0036 en curso — no acredita fase completa

1. HEAD `be58ef69ee7e1ccf507b51505f8b2e9801f894ea`, rama
   `codex/cierre-integridad-media`, índice vacío, sin commits nuevos.
2. `git status --short`: 132 entradas, incluidos no rastreados; cambios preservados.
3. Unitarias **392 → 398** (39 archivos); siete casos DB nuevos NO ejecutados.
4. `pnpm qa`: exit0, 398/398, 21 warnings y cero errores (`avance-0036-qa.log`).
   `pnpm build`: exit0 en copia aislada con variables públicas ficticias
   (`avance-0036-build.log`). Primer intento sin variables falló; se corrigió
   el entorno del comando. Primera QA detectó un warning nuevo: corregido en
   Worker sin desactivar reglas ni elevar el techo. Migración local0036 exit0
   (`avance-0036-migracion.log`). Vista3070 HTTP200 durante esta ejecución.
5. Integración `node scripts/probar-mantenimiento-local.mjs`: NO aprobada.
   Docker devolvió500 al inspeccionar Vibe; luego respondió, pero SQL sufrió
   timeout. Fallo final de limpieza ocultó el error original, corregido en el
   script; comprobar posibles claves/fixtures `maintenance_e2e_` antes de repetir.
   Log `avance-0036-worker-mantenimiento.log`. No reiniciar servicios compartidos.
   Faltan DB/reconstrucción, auth, visualauth y Worker para0036. No desplegado.

Los resultados0035 siguientes corresponden a la versión anterior.

## Corte de escrituras directas del inventario — 0035

1. HEAD `be58ef69ee7e1ccf507b51505f8b2e9801f894ea`, rama
   `codex/cierre-integridad-media`, índice vacío; sin commits nuevos.
2. `git status --short`: 125 entradas, incluidos no rastreados. Se conservan
   cambios previos; el incremento añade la migración 0035 y adapta fixtures/tests.
3. Unitarias **392 → 392** (38 archivos); DB **166 → 172** (14 archivos);
   autenticadas **38 → 38**. Se añaden seis comprobaciones de escritura propia,
   UPSERT, cambios de tamaño/propiedad y carrera entre borrado directo y reserva.
4. Resultados de esta versión, logs bajo `.wrangler/auditoria/`:

| Comando | Resultado | Log |
|---|---|---|
| `pnpm qa` | exit 0; 392/392; 21 warnings existentes, 0 errores | avance-0035-qa-final.log |
| `pnpm build` | exit 0; copia aislada y variables públicas ficticias | avance-0035-build.log |
| `node scripts/probar-supabase-local.mjs test:db` | exit 0; 172/172 | avance-0035-db-final.log |
| `pnpm db:verify --solo-db` en base auxiliar | exit 0; reconstrucción 0000–0035, lint sin errores | avance-0035-reconstruccion.log |
| `node scripts/probar-supabase-local.mjs test:e2e:auth` | exit 0; 38/38; hubo un ECONNRESET de Next, ver diagnóstico abajo | avance-0035-auth.log |
| `node scripts/probar-supabase-local.mjs cf:test:auth --docker-dependencias` | exit 0; 38/38 en 4 min; WAV real, cuatro etiquetas D1 invalidadas y caché R2 local comprobada | avance-0035-worker.log |
| `node scripts/probar-supabase-local.mjs test:visual:auth` | exit 0; 4/4 estructuras ARIA en cuatro anchos (24,9 s); no acredita comparación de píxeles | avance-0035-visual-auth.log |
| Repetición WAV: `node ../repro-wav-0035.mjs` | exit 0; 6/6 (tres por dispositivo), sin ECONNRESET ni excepciones del servidor | avance-0035-wav-repetido.log |

El primer DB dejó 171 aprobadas y una fallida: el fixture de exportación todavía
insertaba inventario con JWT de usuario y omitía comprobar el error. Ahora prepara
el histórico administrativamente, y exporta/verifica con el JWT real de su dueño.
El log fallido se conserva (`avance-0035-db.log`). No se debilitó la exportación.

La suite auth completa registró `ECONNRESET / aborted` de Next en desarrollo
durante WAV móvil; las aserciones y consola del navegador pasaron. Se repitió
ese caso tres veces por dispositivo sin reproducción (6/6, 49,2 s), y tampoco
apareció en Worker. No se suprimieron logs ni reglas, ni se afirma haber corregido
una causa no identificada. Queda como incidencia intermitente a observar al
ampliar fallos/concurrencia de audio en el cierre 12. El script de diagnóstico
aislado obtiene credenciales locales en memoria y no las imprime ni persiste.

La inspección del esquema aplicado confirma SELECT como único privilegio directo
de authenticated y ninguno de anon; no hay políticas permisivas INSERT/DELETE
(`avance-0035-permisos.log`). Las RPC siguen verificando identidad y recibo.
Esta fase cambia permisos de inventario y fixtures, no render/feed/perfil público:
las últimas suites públicas son las de 0034, no se atribuyen a esta ejecución.

5. Pendientes conjuntos: limpieza de reservas abandonadas, ejecutor durable sin
   sesión, drenaje histórico acreditado, retención, entrega privada/URLs antiguas,
   reconciliación de históricos y modo estricto de cuota, pruebas remotas y el
   resto de los 27 cierres. ECONNRESET de desarrollo no reproducido, con límite
   explícito del diagnóstico anterior. No hubo aplicación remota ni despliegue.
   La vista 3070 respondió HTTP 200. Índice vacío y `git diff --check` correcto;
   listado final en `avance-0035-git.txt`, 18 fuentes SHA256 sin divergencias en
   `avance-0035-fuentes.json`.

## Historial de la versión 0034

## Congelación y supresión recuperable 0034

1. HEAD `be58ef69ee7e1ccf507b51505f8b2e9801f894ea`, rama
   `codex/cierre-integridad-media`, índice vacío; no se crearon commits.
2. `git status --short`:124 entradas, incluidos no rastreados; listado íntegro
   en `.wrangler/auditoria/avance-0034-git.txt`, incluida la nueva suite de cierre
   de cuenta. Se conservaron cambios previos.
3. Unitarias **377 → 392** (38 archivos); DB **159 → 166** (14 archivos);
   autenticadas **34 → 38** (escritorio y móvil). Públicas permanecen112.
4. Resultados de este incremento, logs en `.wrangler/auditoria/`:

| Comando | Resultado | Log |
|---|---|---|
| `pnpm qa` | exit0;392/392,21 warnings existentes,0 errores | avance-0034-qa-final.log |
| `pnpm build` | exit0; variables públicas ficticias de Supabase en copia aislada | avance-0034-build.log |
| `node scripts/probar-supabase-local.mjs test:db` | exit0;166/166 | avance-0034-db-final.log |
| `pnpm db:verify --solo-db` en reconstrucción auxiliar | exit0;0000–0034; lint public/private sin errores | avance-0034-reconstruccion.log |
| `node scripts/probar-supabase-local.mjs test:e2e:auth` | exit0;38/38; teclado y axe con contraste en zona de datos | avance-0034-auth-accesible.log |
| `pnpm test:e2e --workers=2` | exit0;112/112 | avance-0034-public.log |
| `node scripts/probar-supabase-local.mjs cf:test:auth --docker-dependencias` | exit0;38/38; WAV real, cuatro etiquetas D1 invalidadas y caché R2 local comprobada | avance-0034-worker.log |
| `pnpm test:visual --workers=2` | exit0;24 ARIA aprobadas,24 píxeles omitidas por falta de referencia aprobada | avance-0034-visual.log |
| `node scripts/probar-supabase-local.mjs test:visual:auth` | exit0;4/4 ARIA en cuatro anchos | avance-0034-visual-auth.log |

5. Auditoría conjunta de pendientes: el cierre2 aún requiere ejecutor sin sesión,
   drenaje acreditado de claves/PUT antiguos, retención definida, entrega privada,
   URLs/cachés antiguas y pruebas remotas. Continúan INSERT heredado al inventario,
   reservas abandonadas y el resto del registro de27 cierres. No hay despliegue ni
   aplicación remota de0034. La vista3070 permanece separada con versión previa
   y respondió HTTP200 al cerrar los gates. El manifiesto SHA256 de13 fuentes
   (`avance-0034-fuentes.json`) no presenta divergencias; `git diff --check` pasó.
   Tras los gates quedaron0 claves efímeras `e2e_%`; el drenaje histórico sigue
   sin activar (`legacy_puts_drained_at IS NULL`).

Los primeros ensayos de DB fallaron por preparar un colaborador sin propietario
y sin tipo banda; se corrigió el fixture y se verificó que podía editar antes de
congelar. El primer E2E nuevo usaba una ruta mal escrita y una key no canónica;
se corrigieron. Axe detectó contraste3.55:1 en confirmación: se oscureció el botón
y se mantuvo la regla activa. Esas ejecuciones fallidas se conservan en
`avance-0034-db*.log`, `avance-0034-auth.log` y `avance-0034-auth-final.log`.
Las capturas nuevas de estado inicial/pendiente (datos ficticios) están bajo
`0034-cierre-cuenta-*.png` en auditoria. Se revisó visualmente el estado pendiente
en escritorio y móvil; no son baselines de píxeles aprobadas por el titular.
El fixture HTTPS prueba PUT/HEAD y condiciones, no firmas S3 ni CORS real.

## Historial de la versión0033

HEAD `be58ef69ee7e1ccf507b51505f8b2e9801f894ea`, índice vacío y rama
`codex/cierre-integridad-media`; cambios locales/no rastreados preservados.
Registro de aceptación: `docs/cierres-2026-11.md`. El bloque de octubre inferior
es histórico y no acredita las versiones actuales.

## Reintentos del transporte compartido — posterior al primer gate 0033

`lib/upload-protocol.ts` conserva la reserva en un reintento automático por
etapa ante red/5xx; mantiene el PUT condicional y exige finalización. No reintenta
4xx ni extiende el plazo de la firma. No incluye recuperación tras cerrar la
pestaña ni limpieza de reservas agotadas. Sin cambios de SQL o presentación.

- HEAD e índice: los indicados arriba; 118 entradas en `git status --short`,
  incluidos archivos no rastreados. Ningún cambio previo descartado.
- Pruebas unitarias: **366 → 377**, 38 archivos; QA exit0, 21 advertencias
  existentes y cero errores (`reintentos-0033-qa.log`). Transporte: 14/14.
- `pnpm build`: exit0 con variables públicas ficticias en la copia aislada
  (`reintentos-0033-build-configurado.log`). Primer intento sin esas variables
  falló al crear el cliente Supabase; se conservó ese log y se corrigió el entorno,
  sin relajar requisitos de configuración de la aplicación.
- `node scripts/probar-supabase-local.mjs cf:test:auth --docker-dependencias`:
  exit0, Worker **34/34** (2.5 min), WAV real, cuatro etiquetas D1 invalidadas
  y caché R2 comprobada (`reintentos-0033-worker.log`). Build OpenNext incluido.
- `node scripts/probar-supabase-local.mjs test:e2e:auth`: exit0, editor **34/34**
  (1.6 min), escritorio y móvil (`reintentos-0033-auth.log`).
- `node scripts/probar-supabase-local.mjs test:visual:auth`: exit0, **4/4 ARIA**
  en cuatro anchos (`reintentos-0033-visual-auth.log`). No son referencias de píxeles.
- Esos tres comandos se ejecutaron desde `.wrangler/auditoria/proyecto` con
  `PNPM_CONFIG_STORE_DIR` apuntando al `.pnpm-store` del repositorio. La suite
  Worker usa el contenedor aislado de Vibe; no acredita R2 remoto/CORS real.
  DB y público no se repitieron: este incremento sólo cambia el transporte del
  cliente, sin SQL ni render. Los gates de la tabla siguiente son del bloque previo.
- Fuentes relevantes identificadas por SHA256 en `reintentos-0033-fuentes.json`,
  dentro de `.wrangler/auditoria/`, junto con los logs.

## Primera integración 0033

| Gate | Resultado actual | Log en `.wrangler/auditoria/` |
|---|---|---|
| QA (repetida tras integrar arnés Worker) | 366/38 archivos, 21 warnings, 0 errores | avance-0033-qa-integracion.log |
| Next build | aprobado | avance-0033-build.log |
| DB con JWT real | 159/13 archivos | avance-0033-db.log |
| Reconstrucción auxiliar | 0000–0033, lint public/private sin errores | avance-0033-reconstruccion.log |
| Editor autenticado | 34/34; PUT/HEAD con fixture HTTPS local | avance-0033-auth.log |
| Visual autenticado | 4/4 ARIA | avance-0033-visual-auth.log |
| E2E público | 112/112 | avance-0033-public.log |
| Visual público | 24/24 ARIA; 24 píxeles omitidas | avance-0033-visual.log |
| Worker autenticado OpenNext | 34/34 en 2.8 min; WAV real, cuatro etiquetas D1 invalidadas, caché R2 comprobada | avance-0033-worker.log |

Los gates de la tabla finalizaron exit0. Antes del bloque: QA356; DB155/156.
Tras corregir la aserción RLS:156/156; tras0033:159/159. Las omisiones de píxeles
no son aprobaciones visuales. El Worker local terminó exit0; su fixture HTTPS
local soporta PUT/HEAD pero no valida firmas S3 ni CORS real y no prueba staging.
La vista3070 sigue separada y devuelveHTTP200. No se aplicaron migraciones remotas
ni se desplegó este bloque. Quedan eliminación de cuenta, corte de clientes
heredados/cuota global, entrega privada, limpieza abandonada y resto de27 cierres.

# Historial — 2026-10-03/04

HEAD `be58ef69ee7e1ccf507b51505f8b2e9801f894ea`; índice sin cambios preparados.
Hay modificaciones locales y archivos nuevos: ver listado completo en
`NEXT_TASK.md`. No se crearon commits ni se accedió a producción.

## Entornos

- QA: repositorio actual, dependencias del lockfile, pnpm 11.10.0.
- Base: **sólo** Supabase local `project_id=vibe`, API 54421, DB 54422,
  shadow 54420. Datos ficticios; aserciones con JWT real de usuario/anon.
  La clave administrativa efímera del arnés existente sólo prepara/retira
  fixtures. No se añadió service role al código/runtime de la aplicación.
- Next/Playwright: copia creada por `node scripts/preparar-verificacion.mjs`,
  sin `.env.local`, OAuth ni sesiones de proveedores. Correos de contacto
  personales redactados también en referencias ARIA, sin cambios visuales
  encubiertos en las referencias del repositorio.
- Cloudflare/Playwright final: contenedor **vibe-auditoria-cloudflare**, Node22
  Debian, fuente de Vibe montada sólo lectura y copia de trabajo `/app`.
  Recursos R2/D1/DO de Miniflare locales, credenciales S3 ficticias. Los E2E
  autenticados acceden a 54421 mediante túnel local exclusivo del contenedor,
  y verifican además la identidad del esquema antes de crear usuarios.

## Resultados

| Comando | Salida | Resultado real |
|---|---:|---|
| `pnpm install --frozen-lockfile --store-dir .pnpm-store` | 0 | Dependencias del lockfile; sin actualización de versiones |
| `pnpm test` inicial | 0 | 290 pruebas / 23 archivos |
| `pnpm qa` final | 0 | Tipos + lint + 316 pruebas / 30 archivos; 22 warnings existentes, ninguno añadido |
| `pnpm build` inicial Windows y final Linux | 0 | Next 16.3.4, tipos incluidos |
| `pnpm cf:build` final Linux | 0 | OpenNext 1.20.6 genera Worker y assets |
| `SMOKE_BUILD_VERSION=be58ef69 pnpm cf:test` | 0 | Worker real: D1 con esquema esperado, R2, arranque DO, self binding, WASM/ETag, CSP, health degradado y versión |
| Mismo `cf:test`, perfil público | 0 | Caché R2 real caliente; cambio de versión visible sin invalidación; suspensión retira contenido. Backend ficticio, no RLS remoto |
| `pnpm db:verify` final | 0 | Reconstrucción 0000–0024 y lint SQL sin errores |
| `node scripts/probar-supabase-local.mjs test:db` | 0 | 129 pruebas / 10 archivos. Antes: 116 / 8 |
| `pnpm test:e2e --workers=2` Linux | 0 | 112 pasaron: escritorio/móvil, CSP, SSR, consentimiento, recuperación, permisos y axe |
| `pnpm test:visual` Linux | 0 | 24 ARIA pasaron; 24 píxeles omitidos por falta de referencia aprobada |
| `node scripts/probar-supabase-local.mjs test:e2e:auth --docker` final | 0 | 32 pasaron con la nueva serie SQL y uploads con namespace |
| `node scripts/probar-supabase-local.mjs test:visual:auth --docker` | 0 | 4 ARIA del editor pasaron |
| `git diff --check` | 0 | Sin errores de whitespace; Git avisa normalización LF/CRLF |

Los nuevos casos unitarios cubren errores leyendo borrador, cola de escrituras,
sesión fallida, conflictos, validación, mezcla de cambios durante subidas,
fallos/concurrencia de FFmpeg, cuenta con más de 1000 archivos, fallos parciales,
cache caliente, autorización de invalidación y omisión de texto privado en logs.
Las pruebas DB adicionales cubren atomicidad completa, reintentos, dos pestañas,
guardar contra publicar, autorización negativa, suplantación de propiedad y
suspensión/restauración con gestión privada.

## Fallos observados y corregidos / limitaciones

- QA inicial en sandbox: errores de resolución de módulos por permisos de
  enlaces de dependencias. Tras acceso completo/instalación congelada pasó;
  no se cambiaron tipos para ocultar ese fallo.
- Windows `test:e2e`: salida 1 por timeout de webServer (180 s) compilando
  `/legal`. Se interrumpió el proceso de diagnóstico y se ejecutó la suite
  completa en Linux, sin aumentar tiempos ni saltar casos.
- Pruebas nuevas de propiedad **antes de 0022**: 3 fallos (se aceptaban key
  histórica, namespace ajeno y perfil ajeno); **después**: los 129 casos pasan.
- Primera prueba de suspensión tenía fixture product sin `type`; se corrigió
  el fixture obligatorio, no el esquema ni la aserción de seguridad.
- 0023 produjo 7 fallos por `EXECUTE get_profile_role` denegado al anónimo.
  0024 separa políticas por rol; no se abrió la RPC al público. Reconstrucción
  completa y 129 pruebas pasan tras la corrección.
- OpenNext informa soporte experimental del proxy Node; bundling emite dos
  avisos de código de dependencias (duplicate-case y nullish-coalescing).
  `next dev` avisa que DOQueueHandler no se exporta en su emulador de bindings.
  No se suprimieron avisos: el Worker generado sí exporta/arranca el DO y pasó
  smoke. Estos avisos no son errores de consola del navegador ni warnings
  nuevos de ESLint; siguen siendo límites de soporte a vigilar.
- No se ejecutaron despliegue, migraciones remotas, R2 real, DNS, facturación,
  backups/remoto, correo real, pruebas de carga ni revisión legal.
- No hay aprobación ni comparación de píxeles. Las referencias ARIA no
  sustituyen una aprobación visual de PNG.
- FFmpeg: probado transporte de WASM en workerd y concurrencia/reintento con
  core simulado en unitarias; falta conversión WAV real en navegador sobre
  Worker. No se presenta la prueba de transporte como transcodificación.

## Reproducción y archivos de evidencia

1. `node scripts/preparar-verificacion.mjs` y, para Linux,
   `node scripts/preparar-verificacion.mjs cloudflare`.
2. Instalar lockfile en la copia. Para DB, comprobar Vibe/544xx antes de
   `pnpm db:verify`; ejecutar el wrapper de Supabase desde esa copia. No se
   requiere leer ni crear un entorno real.
3. Para build/smoke usar `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54999`, anon
   ficticia, R2 público ficticio y APP_VERSION de prueba. `cf:test` arranca el
   servidor de fixtures en ese puerto y debe ejecutarse sin otro listener.
   La URL pública de Supabase va incrustada: no construir ese smoke con otra.
4. `pnpm cf:build`, luego `SMOKE_BUILD_VERSION=<APP_VERSION del build> pnpm cf:test`.
   No requiere `wrangler login`; se niega a correr con entornos reales locales.
5. Logs locales: `.wrangler/auditoria/{qa-final,db-verify-final,db-final,
   media-antes,auth-final,visual-auth-final}.log`. Logs Linux copiados a la misma
   carpeta: `build-final`, `cf-build-final`, `worker-final`, `e2e-final`,
   `visual-final`. Son evidencia de esta sesión, distinta del historial en
   `docs/traspaso-astra-2026-10-03/`.
