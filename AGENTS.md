# Vibe — reglas del repositorio

Este archivo manda sobre cualquier costumbre heredada. Si una instrucción puntual lo contradice,
gana este archivo salvo que quien la dé diga explícitamente que lo sustituye.

## Alcance y precedencia

1. `AGENTS.md` (este archivo) — reglas operativas.
2. `PLAN_VIBE_EMPRESARIAL.md` — el plan vigente y su orden de fases.
3. `AUDITORIA.md` y `PLAN.md` — contexto histórico; describen el problema, no el estado actual.
4. `DESPLIEGUE.md` — procedimiento de despliegue y verificación.
5. `docs/` — decisiones ya tomadas (migraciones, observabilidad, staging, runbooks).

Trabajar solo dentro de este repositorio. `Canodent`, `Bancary` y `gnomos` son **estrictamente de
solo lectura**: se leen como referencia de patrones, jamás se modifican.

## Principios innegociables

- **La lógica, la UX y las funciones existentes se preservan tal cual.** Un cambio interno que
  roce la interfaz se acepta solo si la captura antes/después es idéntica.
- **No se cambia de proveedor ni se inventan integraciones.** Supabase (Postgres + Auth + RLS),
  Cloudflare R2, Vercel, Together AI y los oEmbed públicos. El rate limit distribuido vive en
  Postgres, no en Redis.
- **Fail-closed.** Sin configuración, la funcionalidad sensible queda apagada, no abierta.
- **Defensa en profundidad.** Cada regla vive en dos capas: la base (RLS/constraints/RPC) y el
  código (validación al guardar y al renderizar).
- **Migraciones forward-only.** Nunca se edita una migración aplicada; el arreglo va en una nueva.
  Ver `docs/migraciones.md`.
- **La service role key no existe** en el código ni en el runtime de la app.
- **Nada se declara listo sin evidencia reproducible**: un comando que corre, una prueba que pasa,
  una respuesta HTTP.

## Implementación

- Next.js 16 App Router, React 19, TypeScript estricto. El middleware se llama `proxy.ts`.
- Antes de escribir código de framework, leer la guía correspondiente en `node_modules/next/dist/docs/`.
- Todo acceso a datos de usuario pasa por RLS evaluada con `auth.uid()` real.
- Todo objeto en R2 tiene fila de propiedad en `media_assets`. Sin fila, no se borra automáticamente.
- Ninguna ruta de API devuelve `error.message` de origen interno o externo al cliente.
- Los logs de servidor usan `lib/log.ts`. **Nunca** registrar PII, contenido de bloques, tokens ni claves.
- El contenido del editor se valida en runtime con `lib/blocks-schema.ts` antes de persistir.
- Los componentes se mantienen operables con teclado; toda interacción nueva se prueba con axe.

## Gates obligatorios antes de entregar

```powershell
pnpm qa      # typecheck + lint (con trinquete) + pruebas unitarias
pnpm build
```

Cuando la fase toca el **render, el feed, el perfil público o la accesibilidad**,
además (no necesitan Docker ni credenciales: los datos salen del servidor de
fixtures `tests/e2e/fixtures/servidor-supabase.mjs`):

```powershell
pnpm test:e2e      # Playwright + axe, escritorio y móvil
pnpm test:visual   # instantáneas ARIA en 4 anchos
```

Cuando la fase toca **la base de datos**, además (sí necesitan Docker Desktop y
el baseline `0000` — ver `docs/migraciones.md`):

```powershell
pnpm db:verify
pnpm test:db
```

La capa de píxeles de `pnpm test:visual` se omite mientras no exista una
referencia aprobada para el sistema operativo actual. Para generarla:
`pnpm test:visual:update`, y **revisar cada captura antes de versionarla**:
definen oficialmente cómo se ve Vibe.

Reglas de los gates:

- `pnpm lint` corre con `--max-warnings=<N>` donde `N` es el techo vigente (ver
  `docs/deuda-react-compiler.md`). **Un PR que añade un warning falla.** El techo solo baja.
- Advertencias de consola del navegador, errores de TypeScript y fallos de lint se tratan como fallos.
- Añadir o actualizar pruebas al cambiar comportamiento. Se prefieren pruebas **conductuales**;
  la inspección de texto fuente no sustituye a una prueba de comportamiento.

## Qué nunca se commitea

- `.env`, `.env.local`, `.env*.local`, cualquier credencial, token o clave.
- Datos personales reales (DNI, correos de usuarios, contenido de perfiles reales).
- Artefactos de producción, `.next/`, `node_modules/`, capturas con datos reales.
- La service role key de Supabase, en ningún contexto.

## Git

- Commits pequeños y descriptivos, en español, con el prefijo convencional (`fix:`, `feat:`, `chore:`).
- Una fase = una rama = un PR revisable en una sentada y revertible sin arrastrar nada más.
- No reescribir historia ni descartar cambios ajenos.
- Revisar también los archivos **no rastreados** (`git status --short`) antes de consolidar.

## Antes de declarar una fase lista

Reportar, en este orden:

1. `HEAD` y estado del índice.
2. `git status --short`, incluyendo archivos no rastreados.
3. El cambio en el número de pruebas (antes → después).
4. Los gates ejecutados y su resultado real (no "debería pasar").
5. Los bloqueos encontrados, todos en una sola auditoría. El estilo, los refactors y la cobertura
   opcional no son bloqueadores.

Detenerse y pedir decisión solo ante un bloqueo real de arquitectura, DDL, seguridad, credenciales
o una decisión de producto congelada e incompatible.
