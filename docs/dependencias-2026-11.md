# Actualización de dependencias — 2026-11-04 (actualizada el 2026-11-05)

Estado: integrada en el árbol local, sin commit, CI remoto ni despliegue.
Base HEAD: `be58ef69ee7e1ccf507b51505f8b2e9801f894ea`; índice vacío al revisar.
Esta actualización no cierra los 27 puntos ni las carreras entre Postgres y R2.

## Cambios y motivo

- Next y eslint-config-next: 16.3.4 → 16.4.5.
- OpenNext Cloudflare: 1.20.6 → 1.20.16; Wrangler: 4.129.0 → 4.157.0.
- Actualización de dependencias dentro de los rangos declarados, incluyendo
  Supabase, React, AWS SDK, herramientas de pruebas y sus transitivas. El lockfile
  fija las versiones ensayadas. Vite 8.2.4 se declara explícitamente para que
  Vitest no conserve automáticamente su peer vulnerable 8.2.0.
- Override limitado a glob 10.x → ^10.5.0 porque OpenNext lo fija indirectamente.
  No se fuerza glob 14 ni minimatch 11 sobre consumidores de otras majors.
- Mínimo Node 22.19.0: coincide con las herramientas actualizadas; CI usa Node 22.
- `assets.html_handling` y `not_found_handling` son `none`: el nuevo adaptador
  exige rutas exactas para evitar alias HTML que eludan el proxy.
- Se amplió el parche existente de FFmpeg: la URL opcional de un Worker externo
  se resuelve con `globalThis.URL` y se conserva en runtime, mientras que el
  Worker predeterminado sigue empaquetándose. Turbopack intentaba resolver la
  URL dinámica como archivo al compilar. No se cambia el flujo del editor.
- Un binding no utilizado del feed se retiró manteniendo setter/actualizaciones.
  Lint: 22 → 21 advertencias, con techo reducido a 21 y ninguna regla apagada.

Las excepciones de antigüedad añadidas por pnpm enumeran versiones concretas de
Next/OpenNext/Wrangler y sus binarios; no desactivan la política global.

## Auditoría

| Alcance | Antes | Después |
|---|---|---|
| Todas las dependencias | 5 críticas, 27 altas, 53 moderadas, 12 bajas | 0 críticas, 0 altas, 2 moderadas, 1 baja |
| Producción, después de actualizar | — | 0 alertas de cualquier gravedad |

Los avisos restantes son herramientas de desarrollo: glob y minimatch tienen
avisos moderados cuyos arreglos indicados requieren otras majors; deepmerge
4.3.1 tiene un aviso bajo, pero npm no publica 4.3.2 y el aviso oficial indica
que aún no hay versión corregida. No se silenció ningún aviso. Reevaluarlos
al actualizar sus consumidores, sin ejecutar el CLI de shadcn con entradas no
confiables. Esto no sustituye una revisión del código propio ni garantiza que
no existan vulnerabilidades desconocidas.

Fuentes consultadas: [Next.js](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw),
[glob](https://github.com/advisories/GHSA-5j98-mcp5-4vw2),
[Vite](https://github.com/advisories/GHSA-587h-7wmj-h5pm),
[deepmerge](https://github.com/advisories/GHSA-gcqx-w48m-w2h4),
[Workers dinámicos de Next](https://github.com/vercel/next.js/issues/74621).

## Verificación reproducible

Se usó `.wrangler/auditoria/proyecto`, copia aislada sin `.env.local` ni sesiones
remotas. Los comandos de base y auth obtienen exclusivamente claves efímeras del
Supabase local de Vibe, puerto 54421, y verifican la identidad de la base.

| Comando | Resultado |
|---|---|
| `pnpm install --frozen-lockfile` | Linux y copia Windows, exit 0 |
| `pnpm peers check` | Ningún conflicto |
| `pnpm audit --prod --json` | 0 alertas, exit 0 |
| `pnpm audit --json` | 3 avisos residuales; exit 1 esperado, sin altas/críticas |
| `pnpm qa` | 331 pruebas / 31 archivos; 21 warnings, 0 errores; exit 0 |
| `pnpm test:e2e --workers=2` | 112 aprobadas, exit 0 |
| `pnpm test:visual --workers=2` | 24 ARIA aprobadas; 24 píxeles omitidas por falta de referencias |
| `node scripts/probar-supabase-local.mjs test:db` | 129 aprobadas / 10 archivos, exit 0 |
| `node scripts/probar-supabase-local.mjs test:e2e:auth` | 34 aprobadas (antes 32), exit 0; ejecución histórica Next |
| `node scripts/probar-supabase-local.mjs test:visual:auth` | 4 ARIA aprobadas, exit 0; ejecución histórica Next |
| `pnpm cf:build` en Linux | Next build y empaquetado Worker, exit 0 |
| `SMOKE_BUILD_VERSION=be58ef69 pnpm cf:test` en Linux | Worker real local: D1, R2, DO, WASM, ETag, CSP, health, caché, publicación/suspensión, exit 0 |

La prueba de auth genera un WAV PCM sintético de medio segundo, usa el FFmpeg
real del navegador, publica mediante URL firmada interceptada en la frontera R2
y decodifica el MP3 con AudioContext. El recorrido pasó en Next local y en el
Worker compilado: 34/34 E2E en escritorio y móvil, con aserciones D1 aprobadas.
El gate global del Worker falló por la caché R2 vacía. Se probó que el rol
anónimo carecía de `SELECT` sobre `content_version`, aunque podía leer las demás
columnas. La migración forward-only `0025_version_publica_perfil.sql` concede
solo esa columna y se aplicó únicamente en la DB local, con `migration up` y sin
reset. Después, DB: 131/11 (antes 129/10) y QA: 331/31, 21 warnings. La nueva
aserción E2E exige título HTML disponible sin JavaScript. La actualización del
5 de noviembre confirma la repetición del Worker con 0025; ver evidencia vigente
abajo.

El paso CI `cf:test:auth` está añadido pero no ejecutado en GitHub. Migraciones
remotas 0018–0025 siguen pendientes.

## Actualización de gates — 2026-11-05

El Worker autenticado ejecutado con 0025 terminó exit 0: 34 aprobadas en 3.7 min,
incluidas las aserciones D1 de cuatro etiquetas invalidadas y la aserción de
objetos de caché R2. Solo dos de las 34 pruebas ejercitan WAV real (escritorio y
móvil). `db:verify` aislado terminó exit 0, reconstruyó 0000–0025 y `dblint`
reportó `No schema errors` en `vibe-reconstruccion` (55422, `--solo-db`, PG
17.6.1.158, la misma versión que la DB local); no valida el remoto PG 17.11.3.
`test:visual:auth` terminó con 4 aprobadas en 23.8 s, exit 0.

Conteos reportados: QA 331/31 con 21 warnings y 0 errores; DB 131/11; E2E
público 112; visual público 24 ARIA aprobadas y 24 píxeles omitidas; auth Next
34. Estos gates no verifican staging remoto. La afirmación previa «no se cambió
SQL» corresponde al checkpoint del 4 de noviembre y queda aquí como histórica:
0025 sí se aplicó localmente mediante `migration up`, sin reset. Ninguna
migración remota 0018–0025 fue aplicada.

En Windows, Next build terminó correctamente; el empaquetado OpenNext falló por
enlaces de archivos con acceso denegado. El mismo código/lockfile compiló y pasó
el smoke en Linux. OpenNext advierte que el middleware Node sigue siendo
experimental, y esbuild emite avisos de código de dependencias PDF. No se
ocultaron. Las consolas del navegador verificadas por las suites no fallaron.

Histórico del checkpoint del 4 de noviembre: no se había reconstruido la base con
`db:verify` en aquella actualización; todavía se afirmaba que no se cambió SQL.
No se aprobaron baselines de píxeles, ni se aplicaron migraciones remotas, ni se
probó capacidad para miles de usuarios. Siguen vigentes `cierres-2026-11.md` y
`migracion-empresa-vibe.md`.

Logs locales ignorados: `.wrangler/auditoria/*dependencias*`,
`audit-final-dependencias.json`, `audit-prod-final-dependencias.json` y
`qa-integrado-dependencias.log`.
