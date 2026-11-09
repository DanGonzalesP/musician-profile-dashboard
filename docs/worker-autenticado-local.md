# Editor autenticado sobre Cloudflare local

`pnpm cf:test:auth` ejecuta la suite de 34 pruebas del editor contra el Worker
compilado de OpenNext. Usa GoTrue/Postgres locales y bindings locales reales de
workerd (D1, R2 y Durable Objects). No despliega ni usa credenciales de empresa.
El fixture HTTPS local almacena bytes y soporta PUT/HEAD con condiciones; no
valida la firma S3 ni sustituye la comprobación de CORS, credenciales y R2 remoto
en staging.

## Ejecución

Requiere Linux, OpenSSL, Chromium de Playwright, dependencias instaladas y el
Supabase local de Vibe ya iniciado en `127.0.0.1:54421`. Usar una copia aislada
sin `.env*` ni `.dev.vars`, salvo `.env.example`.

```sh
node scripts/probar-supabase-local.mjs cf:test:auth
```

En esta laptop se usa el contenedor de auditoría exclusivo de Vibe, que ya
contiene la copia instalada en `/app`. Tras actualizar allí los archivos:

```powershell
# Desde .wrangler/auditoria/proyecto; no desde la carpeta con entornos reales.
node scripts/probar-supabase-local.mjs cf:test:auth --docker-dependencias
```

El receptor del contenedor recibe las claves locales por stdin, sin guardarlas
en disco ni mostrarlas. El lanzador comprueba el proyecto y puerto antes de
leerlas. No reinicia ni reconstruye la base: puede coexistir con la vista local
del usuario, aunque cada prueba crea y elimina sus propios usuarios efímeros.

## Qué comprueba

- Sesión real, RLS, editor, teclado, axe, borrador y publicación en escritorio
  y móvil; defensas contra XSS almacenado.
- Protocolo de subida desde la API real y conversión en navegador de WAV PCM
  sintético a un MP3 decodificable con AudioContext. FFmpeg no se simula.
- Visitas públicas antes de publicar para poblar la caché y visita posterior
  que debe mostrar el contenido nuevo.
- Tras la suite, etiquetas de perfiles escritas en D1 durante esa ejecución,
  con expiración inmediata; objetos presentes en la caché incremental R2.

La CSP de producción admite HTTPS para Supabase. El ensayo genera un
certificado de un día y un proxy TLS local en `54425` hacia `54421`. El proceso
de Node hijo confía sólo en ese certificado adicional y el navegador de pruebas
acepta el certificado local. No se modifica la CSP ni se desactiva TLS
globalmente. Al terminar se cierran las conexiones y se eliminan los dos
archivos temporales del certificado.

La clave administrativa del fixture se retira antes del build y nunca se pasa
como binding del Worker. Sólo el proceso Playwright la usa para preparar y
retirar sus datos locales. Un wrapper nuevo comparte el recibo efímero mediante
`scripts/recibo-media-e2e.mjs`; el runtime no recibe service key. Las credenciales
locales no demuestran validez de firmas S3 ni de R2 remoto.

## Fallos detectados por este ensayo

1. Usar Supabase HTTP con la CSP de producción impedía iniciar sesión. Se
   corrigió el entorno de pruebas con TLS local, conservando la política real.
2. `lib/r2-config.ts` consultaba la URL pública de R2 mediante una clave dinámica
   de `process.env`. Next no incrusta esos accesos durante el build; el Worker
   respondía 503 al pedir una subida pese a tener la URL al compilar. Ahora se
   lee mediante acceso literal, manteniendo las credenciales en runtime y el
   rechazo cuando falta configuración. La suite reproduce el caso sin añadir
   la variable pública como binding para ocultarlo.

El job de base de datos de CI incluye este gate después del editor nativo y
sus instantáneas ARIA. Su ejecución remota queda pendiente hasta publicar la
rama y comprobar GitHub Actions. Los baselines de píxeles siguen pendientes.

## Ejecución local de noviembre — histórico del 4 de noviembre

Este apartado describe el checkpoint de migración 0025 como historial; no es el
estado actual ni evidencia del protocolo incorporado en 0033.

El Worker compilado pasó las 34/34 pruebas E2E, escritorio y móvil, incluida
la conversión WAV real. Las aserciones D1 también pasaron. El gate global falló
porque la caché R2 estaba vacía: se probó que el rol anónimo no tiene `SELECT`
sobre `content_version` (sí sobre las demás columnas), por lo que no puede leer
la versión pública usada por esa ruta. La migración forward-only
`0025_version_publica_perfil.sql` concede acceso solo a esa columna; se aplicó
mediante `migration up` únicamente en la base local, sin reset. DB quedó en
131/11 aprobadas (antes 129/10), y QA en 331/31 con 21 warnings. Una aserción
E2E nueva exige que el título esté en HTML sin JavaScript.

En ese checkpoint, la reejecución del Worker tras 0025 y `db:verify` estaban
pendientes. La sesión local activa era `http://127.0.0.1:3070`; no inferir de
ella verificación de staging. Evidencias de ese checkpoint: `.wrangler/auditoria/`
(`worker-autenticado.log`, `db-version-verde.log`, `qa-final-0025.log`).

## Actualización local — 2026-11-05

En ese checkpoint, `.wrangler/auditoria/worker-autenticado-0025.log` finalizó con
34 aprobadas en 3.7 minutos y exit 0. Aquella ejecución no prueba el protocolo
de subida actual. Staging remoto permanecía pendiente.

La reconstrucción `db:verify` aislada de aquel checkpoint terminó exit 0:
`.wrangler/auditoria/db-reconstruccion-0025.log` reconstruyó 0000–0025 y `dblint`
informó `No schema errors`, usando `--solo-db`
en `vibe-reconstruccion` (puerto 55422), PostgreSQL 17.6.1.158. Esa versión
coincide con la base local y no valida el remoto PostgreSQL 17.11.3. La ejecución
`visual-auth-0025.log` también terminó exit 0 con 4 aprobadas en 23.8 s.
El paso CI `cf:test:auth` fue añadido, pero GitHub Actions no se ha ejecutado.

## Estado actual — 2026-11-05

La reconstrucción local cubrió 0000–0033. QA reportó 366 pruebas/38 archivos
(21 advertencias), DB 159/13, auth 34 y visual-auth 4 instantáneas ARIA; todos
esos gates pasaron. OpenNext Worker autenticado terminó exit0 con 34/34 en 2.8
minutos, WAV real, cuatro etiquetas de perfil invalidadas en D1 y caché R2
comprobada (`avance-0033-worker.log`). La prueba usó workerd, Supabase real local
y fixture HTTPS R2 para PUT/HEAD; este no verifica firmas S3 ni CORS real, así
que no prueba staging ni comportamiento remoto. La eliminación de cuenta conserva
el flujo antiguo y hay escrituras directas al inventario aún pendientes.
