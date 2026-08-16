# Línea base de calidad — Vibe

Medición inicial exigida por F1 del `PLAN_VIBE_EMPRESARIAL.md`. Es el "antes" contra el que se
compara todo lo que venga después. **Se re-mide al cerrar cada bloque**, no al cerrar cada fase.

## Entorno de la medición

| Dato | Valor |
|---|---|
| Fecha | 15 de agosto de 2026 |
| Rama / commit | `main` @ `6ffa555` (árbol de trabajo, sin commitear) |
| Sistema | Windows 11 (26200) |
| Node | v24.16.0 |
| pnpm | 11.10.0 |
| Next.js | 16.2.12 (Turbopack) |
| TypeScript | 5.7.3 |
| Vitest | 4.1.10 |

## Las cinco cifras

| Gate | Comando | Resultado medido |
|---|---|---|
| Tipos | `pnpm typecheck` | **0 errores** ✅ |
| Lint | `pnpm lint` | **0 errores, 28 warnings** |
| Pruebas | `pnpm test` | **7 archivos, 68 pruebas, todas en verde** (0,56 s) |
| Build | `pnpm build` | **verde, 28 s** en frío (compilación 5,6 s · TypeScript 9,5 s · 31 páginas estáticas 9,0 s) |
| Auditoría | `pnpm audit --audit-level=high` | **20 vulnerabilidades: 8 altas, 11 moderadas, 1 baja** |

> El plan §1.3 anticipaba "~23 warnings del React Compiler". La cifra real es **28**, y no todas
> son del React Compiler: 27 lo son (`set-state-in-effect`, `refs`, `immutability`,
> `static-components`) y 1 es un `no-unused-vars` (`generarBannerConIA` en `profile-editor.tsx`).
> El techo del trinquete se fija sobre la cifra real, no sobre la estimada.
> Detalle e inventario: [`deuda-react-compiler.md`](deuda-react-compiler.md).

### Superficie del bundle

| Métrica | Valor |
|---|---|
| JS total emitido en `.next/static` | 11,14 MB sin comprimir |
| Chunk mayor | 8,72 MB — es el core de **ffmpeg.wasm**, cargado bajo demanda al transcodificar, no en la primera pintura |
| Segundo chunk | 419 kB |
| Tercer chunk | 246 kB |

El chunk de ffmpeg domina el total pero **no entra en la ruta crítica**: `lib/audio-transcode.ts`
lo carga con `import()` dinámico solo cuando el usuario sube un audio que hay que convertir. El
presupuesto de rendimiento de F11 (`presupuesto-rendimiento.md`) mide el JS de la **primera
pintura**, que es la cifra que importa, y hoy no está instrumentada.

### Vulnerabilidades altas — CERRADAS el 2026-08-16

Ninguna era una dependencia declarada en `package.json`: todas entraban arrastradas por `next`,
`eslint`, `@aws-sdk` o `tailwindcss`. Se cerraron con `overrides` en `pnpm-workspace.yaml`
(pnpm 11 ya no lee `pnpm.overrides` de `package.json`), subiendo el **parche mínimo dentro de la
major que ya estaba resuelta**:

| Paquete | Resuelto antes | Ahora | Llega vía |
|---|---|---|---|
| `fast-uri` | 3.1.3 | ≥3.1.5 | ajv → eslint |
| `brace-expansion` | 5.0.7 | ≥5.0.9 | minimatch → tooling |
| `undici` | 7.28.0 | ≥7.29.0 | `@aws-sdk` / next |
| `ip-address` | 10.2.0 | ≥10.3.1 | socks-proxy-agent |
| `js-yaml` | 4.3.0 | ≥4.3.1 | tooling de lint |
| `nanoid` | 3.3.16 | ≥3.3.18 | postcss → next / tailwind |

El selector `paquete@rango` de cada override acota el cambio a la major vulnerable: sin él,
`brace-expansion@1.1.18` —que **no** está afectado, el aviso empieza en la 4.0.0— saltaría a la 5 y
rompería a sus consumidores.

**`pnpm audit --audit-level=high` sale ahora en 0**, así que el paso dejó de ser
`continue-on-error` en `.github/workflows/ci.yml`: un rojo ahí significa una vulnerabilidad
**nueva**, no deuda heredada. Quedan 5 moderadas y 1 baja, todas transitivas y sin parche
publicado; la puerta se deja en `high` a propósito, porque una puerta que nadie puede pasar se
aprende a ignorar.

## Cobertura de pruebas — punto de partida y hoy

| Tipo | En la línea base | Hoy (2026-08-16) |
|---|---|---|
| Unitarias puras (`lib/*.test.ts`) | 7 archivos / 68 pruebas | **18 archivos / 217 pruebas** |
| De base de datos / RLS | 0 | 1 archivo escrito, **sin poder correr** (Docker + baseline) |
| E2E (`pnpm test:e2e`) | 0 | **88 pruebas verdes**, escritorio y móvil, **con hidratación real** |
| Accesibilidad (axe) | 0 | incluida en E2E: legales, login, feed, perfil, tienda, aviso de cookies |
| Regresión visual (`pnpm test:visual`) | 0 | **20 instantáneas ARIA verdes** en 4 anchos; capa de píxeles a la espera de aprobación humana |
| Smoke (`node scripts/smoke-staging.mjs`) | 0 | **7 chequeos verdes** contra un servidor local con fixtures |

Los 7 archivos que existen son: `protected-routes`, `rate-limit`, `resolve-profile`, `safe-url`,
`server-auth`, `upload-validation`, `username`.

## Cómo re-medir

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm audit --audit-level=high
```

## Historial

| Fecha | typecheck | lint | pruebas | build | audit (altas) |
|---|---|---|---|---|---|
| 2026-08-15 (línea base, `6ffa555` commiteado) | 0 | 28 warn | 68 en 7 archivos | 28 s | 8 |
| 2026-08-15 (árbol entregado, trabajo F2/F3/F5/log sin commitear) | 0 | **22 warn** | **169 en 12 archivos** | verde (exit 0) | 8 |
| 2026-08-16 (F8/F9/F10/F11 + P-03 y a11y, sin commitear) | 0 | 22 warn | **192 en 15 archivos** | verde (exit 0), 34 rutas | 8 |
| 2026-08-16 (auditoría adversarial: SSRF de la tarjeta social, caché de fallos, hidratación E2E, COOP/CORP, consentimiento) | 0 | 22 warn | **212 en 17 archivos** | verde (exit 0), 35 rutas | **0** |
| 2026-08-16 (CSP nonce, logger endurecido y supply chain fijada) | 0 | 22 warn | **217 en 18 archivos** | verde (exit 0), 34 rutas | **0** |

> **Trinquete ratcheteado a 22.** El árbol entregado alcanza 22 advertencias (bajó
> de 28: varios `catch (error: any)` pasaron a `catch (error)` tipado al tocar las
> rutas de API). `package.json` fija `--max-warnings=22`. Inventario completo en
> [`deuda-react-compiler.md`](deuda-react-compiler.md).
