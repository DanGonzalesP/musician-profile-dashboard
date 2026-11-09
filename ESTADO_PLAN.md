# Estado de implementación — 2026-11-06

Staging remoto preparado: Supabase `iyppeurjtbuydhjtraxf` con71 migraciones
0000–0070, 0 usuarios/perfiles al terminar; tres buckets R2, WASM subido y D1
propia con esquema inicial. Claves HMAC exclusivas registradas; Auth con
registro público deshabilitado durante preparación. Falta runtime, origen,
R2 credenciales/CORS y verificación final. Producción no recibió estas
migraciones. Detalles vigentes en `docs/staging.md`.

La base local llega a0000–0070. La última actualización autorizada terminó con
código0 y respaldo `actualizacion-local-1793988522091`; copia598 archivos.
0070 traslada la búsqueda de canciones publicadas a la base, antes del límite20.
La copia de código local
se actualiza por separado; incluye paginación del feed, referencias de recuperación
de subidas y plazos de espera para solicitudes de colaboración, aún sin pruebas.
0068 reúne resumen e identidad;0069 añade páginas por total/alias con RLS y
límite100. Productos/Servicios permiten cargar más y actualizar el listado,
manteniendo filtros/bloqueos. Rendimiento y comportamiento aún no comprobados.
Incluye exportación de solicitudes de crédito recibidas (formato6) y recuperación
de retiradas de medios interrumpidas0066. No hay migración remota ni despliegue
nuevos acreditados por estas actualizaciones.

**Los cambios recientes siguen pendientes de pruebas finales por instrucción
del titular. Ninguno de los27 cierres tiene acreditación completa del árbol
actual.** Aplicar SQL o actualizar la copia local no demuestra funcionamiento,
restauración, rendimiento ni preparación de producción. El registro de trabajo
inmediato está en `NEXT_TASK.md`; los requisitos completos en
`docs/cierres-2026-11.md`. No reutilizar las cifras históricas siguientes como
resultados de la versión actual.

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

Registro único: [docs/cierres-2026-11.md](docs/cierres-2026-11.md).
**0/27 completos, 17 parciales, 10 pendientes**. La base local llega a0038:
rate limit anónimo, reservas/finalización verificadas, cierre recuperable, mantenimiento sin sesión y
lectura revocable de medios. No hay migración remota ni despliegue nuevo.

QA451/451 en 44 archivos,DB193/193 (ejecución secuencial),reconstrucción0000–0038 y build
aprobados. E2E público122; auth40 y visualauth4 ARIA aprobados; Worker0038 aprobado: 40/40 casos locales. Gates del
bloque de contacto: auth40,Worker40,visualauth4ARIA,visual24ARIA y24píxeles
omitidas;18 warnings. El primer DB concurrente de 0038 se invalida.
Evidencia y límites en [RESULTADOS_PRUEBAS.md](RESULTADOS_PRUEBAS.md).

Restauración aislada probada: 58 tablas coinciden en filas y SHA-256; migraciones
0018–0038 ensayadas sobre la copia. El validador acepta 14 bloques y 2 borradores;
se preservan cuatro contactos (teléfono, correo y Telegram) mediante resolución
extraída a `lib/contact-url.ts` y sanitización compatible. Inventario: 35 candidatos
probados localmente, 32 objetos sin referencia preservados y 1 audio ausente.
Evidencia completa y límites en el registro único enlazado arriba.

Faltan completar inventario/corte de URLs antiguas y cachés, validación remota, operación,
UX integral y demás cierres. No repetir pruebas DB sin cambios SQL. Próximo
checkpoint ejecutable: [NEXT_TASK.md](NEXT_TASK.md). Vista3070 responde200.
Los avances locales no acreditan producción ni seguridad de orígenes históricos.

## Historial verificado — 2026-10-04

Base: `be58ef69ee7e1ccf507b51505f8b2e9801f894ea`, rama
`codex/doc-acciones-pendientes`. Se trabajó sobre los cambios locales existentes;
el ZIP del 03-10 fue referencia, no se restauró sobre el repositorio.
No hubo despliegues, cambios remotos ni acceso a entornos reales. Este documento
es un checkpoint de ingeniería, no una certificación de producción.

## Hallazgos corregidos

| Riesgo anterior | Corrección y evidencia |
|---|---|
| Publicar confirmaba bloques/consumía borrador antes de reemplazar el catálogo; un fallo posterior dejaba contenido parcial | RPC `publish_profile_complete` transaccional. Prueba DB provoca servicio inválido después de escribir productos: bloques, catálogo, versión y borrador permanecen intactos |
| Dos pestañas/autoguardado tardío podían pisar el borrador | Revisión de borrador + versión publicada, bloqueo de perfil y cola del editor. Pruebas simultáneas permiten un ganador y rechazan al obsoleto; reintento confirmado no vuelve a publicar |
| Error leyendo borrador se interpretaba como ausencia | Lectura explícita de estado; se deshabilita persistencia si falla, con mensaje. No se publica el estado de reserva |
| Terminar R2 reemplazaba ediciones posteriores | Sustitución sólo de URLs blob; pruebas conservan texto, orden, archivos nuevos y bloques eliminados |
| Caché caliente podía sobrevivir a suspensión o invalidación perdida | Estado/versión consultados sin caché; contenido cacheado por versión. Pruebas unitarias y `cf:test` con Worker real: calentar → cambiar versión → suspender |
| RLS dejaba catálogo y música suspendidos accesibles directamente | Políticas restrictivas con lectores anónimos y autenticados separados; propietario/admin del perfil conserva gestión privada. Pruebas de tercero/anon, restauración y borrado propio |
| Un usuario inventaba propiedad para un objeto histórico sin fila | Namespace de nuevas keys + política INSERT y propiedad inmutable. Tres ataques reproducidos antes de 0022 (3 fallos), rechazados después |
| Limpieza podía borrar sin fila de propiedad | Se rechaza `incluirSinAtribuir`, incluso para administrador; clasificador también protege el objeto |
| Eliminar cuenta leía sólo 1000 objetos y continuaba tras fallar R2 | Inventario paginado antes de borrar; fallo conserva cuenta/inventario para reintento. Pruebas de 1001 objetos, página fallida y R2 fallido |
| FFmpeg compartía nombres de salida y conservaba carga rechazada | Conversiones/sondas serializadas, reintento del core y rechazo de salida no cero. Tres pruebas conductuales |
| Logs podían incluir mensajes/detalles con datos del proveedor | `logError` conserva sólo código reconocido, sin mensaje, detalles o pila; prueba con texto privado ficticio |
| Cualquier cuenta invalidaba caché ajena | Server Action exige rol owner/admin real; pruebas de tercero, sesión vencida y fallo RPC |
| DOQueueHandler carecía de self binding; estáticos omitían headers de Next | Binding `WORKER_SELF_REFERENCE`, `_headers`, smoke de runtime agregado a CI; WASM con ETag y revalidación al no tener URL versionada |

## Matriz del plan vigente

Los checkboxes históricos no fueron usados como prueba de ausencia ni de cierre.

| Fase | Estado comprobable | Pendiente |
|---|---|---|
| F0 estado desplegado | Inventario local/base establecido | Verificar versión, migraciones, permisos y recursos remotos con autorización |
| F1 calidad | QA y tipos; no se aumentó techo de 22 warnings | Deuda React Compiler existente, no eliminada |
| F2 seguridad | Propiedad nueva, borrados parciales y errores endurecidos | Ciclo de eliminación concurrente R2/DB, detallado abajo |
| F3 esquema | Validación del editor y RPC de borrador/publicación, rollback probado | Revisar contenido histórico antes de activar globalmente modo de rechazo; compatibilidad de clientes anteriores |
| F4 CSP | Suites CSP/axe y Worker con nonce/WASM; headers de assets | Smoke del origen definitivo/CORS; conversión WASM real en navegador sobre Worker |
| F5 abuso | Rate limit Postgres existente y pruebas DB conservadas | Límites anónimos aún por isolate; cuota rechazar no es reserva atómica |
| F6 migraciones | Reconstrucción local hasta 0024 + lint SQL | Comparación y aplicación remota, sin editar 0000–0019 |
| F7 RLS/DB | 129 pruebas con JWT real de usuarios ficticios | Auditoría remota independiente |
| F8 E2E/visual | Recorridos públicos/auth y ARIA | Píxeles sin referencia aprobada: no se actualizaron snapshots |
| F9 CI | Gates existentes preservados; añadido `cf:test` | Ejecución del workflow en GitHub y verificación de protección de rama |
| F10 SSR | Perfil SSR con autorización fresca y caché por versión | Medir coste de lectura fresca; otras escrituras de catálogo deben invalidar/versionar coherentemente |
| F11 feed/media | Suspensión de feed, FFmpeg y namespace verificados | Carga real, limpieza concurrente, finalización de subidas y cuota distribuida |
| F12 observabilidad | Logs sin error crudo; health/versión verificados localmente | Alertas/destino operativo y simulacro remoto |
| F13 operación | Build Next, build OpenNext y smoke workerd reproducibles | Backup/restauración y rollback remoto autorizado; no se certifica escala |
| F14 moderación/privacidad | Suspensión de superficies revisadas y borrado parcial mejorado | Identidad administrativa en Postgres no decidida; eliminación distribuida incompleta y acceso directo a URLs R2 |

## Trabajo técnico que sigue abierto

1. **P0 — borrado concurrente y finalización de medios.** `delete-file` comprueba
   propiedad, pero no reclama un estado de borrado en una transacción compartida
   con todas las escrituras de referencias. Una publicación posterior puede
   volver a usar la URL entre lectura y DELETE R2. La limpieza tampoco prueba
   referencias de borradores ajenos o todas las columnas de perfil. Hace falta
   un protocolo persistente de referencias/reservas/tombstones, con pruebas de
   publicación contra borrado. La ventana de gracia sola no resuelve la carrera.
2. **P0 — supresión de cuenta.** Se arreglaron paginación/fallo parcial, pero una
   subida simultánea o PUT firmado aún vigente puede aparecer después del
   inventario. La RPC `eliminar_mi_cuenta` todavía es llamable directamente y
   no coordina R2. Falta congelar escrituras, drenar URLs firmadas y conservar
   una cola de supresión con atribución hasta confirmación. Es ingeniería
   pendiente, no una tarea que el propietario deba programar.
3. **P0 — suspensión de archivos públicos.** Ocultar perfil/catálogo/feed no
   revoca una URL pública R2 previamente conocida ni copias descargadas. El
   acceso mediado/revocación exige resolver la política de distribución de
   medios y preparar migración sin romper enlaces. No se modificó el bucket.
4. **P1 — clientes antiguos y otros editores.** Se mantienen RPC/direct writes
   anteriores por compatibilidad. La cola/CAS nueva protege el editor actualizado;
   clientes antiguos no adquieren esa garantía automáticamente. Revisar todos
   los CRUD de catálogo y escrituras directas antes de cerrar consistencia global.
5. **P1 — cuotas/abuso.** La cuota actual mide antes de insertar; no reserva
   bytes bajo concurrencia, y una medición fallida aún permite la subida. No
   activar modo rechazar como si fuera una cuota distribuida estricta. Los
   endpoints anónimos conservan límites locales, no globales.
6. **P1 — cobertura operativa.** Falta conversión WAV real de navegador en
   workerd, restauración completa DB+R2 y prueba de revalidación de Server Action
   autenticada contra D1 del Worker. El smoke actual sí ejercita caché R2 real,
   cambio de versión y suspensión con fixtures; no equivale a Supabase remoto.

Estos puntos no quedan ocultos bajo “credenciales pendientes”. La entrega es
revisable e integrable por fases, pero no cierra todos los riesgos para producción.

## Conflictos documentales resueltos

- Vercel en AGENTS/PLAN históricos no revoca la autorización explícita de
  Cloudflare; se conserva OpenNext/Supabase/R2.
- `docs/cloudflare.md` decía crear recursos y pegar un placeholder D1;
  `wrangler.jsonc` ya tenía ids y `docs/acciones-pendientes.md` los marcaba creados.
  El runbook ahora pide verificar, no recrear.
- Compilar `proxy.ts` no incrusta automáticamente variables privadas. R2_ENDPOINT
  y R2_BUCKET_NAME también deben existir en runtime; el smoke usa valores sólo
  de ejecución. APP_VERSION sí se fija explícitamente en el build.
- 0023 detectó un rechazo anónimo al invocar `get_profile_role` desde la política;
  0024 separa los roles sin ampliar privilegios de la RPC. Aplicar toda la serie,
  no detenerse en estados intermedios.
