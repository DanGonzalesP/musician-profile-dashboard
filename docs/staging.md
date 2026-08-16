# Staging — Vibe

Cierra **P-24**. Un lugar donde probar migraciones y despliegues sin arriesgar
los datos reales. Hoy no existe: cualquier prueba de migración se hace contra
producción, que es exactamente lo que causó los incidentes de pérdida de datos
que documenta `DESPLIEGUE.md`.

## Principio

Staging es un **clon aislado**, nunca un espejo con datos reales. Jamás se
copian perfiles, correos ni DNIs de producción a staging (Ley 29733: los datos
personales sólo se tratan para el fin consentido; "probar" no es ese fin).
Staging se siembra con datos ficticios (`tests/e2e/fixtures`).

## Recursos exclusivos por entorno

| Recurso | Producción | Staging |
|---|---|---|
| Proyecto Supabase | el actual | **uno nuevo, separado** |
| Bucket R2 | el actual | **uno nuevo, separado** |
| Dominio | dominio final | `staging.<dominio>` |
| Credenciales | las de prod | **propias de staging** |
| `TOGETHER_API_KEY` | la de pago | una de prueba o vacía (la ruta degrada a 503) |

Ninguna credencial se comparte entre entornos. Una fuga en staging no debe
tocar producción.

## Tabla de variables por entorno

| Variable | Producción | Staging | Local |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | prod | staging | `http://127.0.0.1:54321` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | prod | staging | local |
| `NEXT_PUBLIC_R2_PUBLIC_URL` | prod | staging | local/prueba |
| `R2_ENDPOINT` / `R2_*` | prod | staging | prueba |
| `NEXT_PUBLIC_SITE_URL` | dominio final | `https://staging.<dominio>` | `http://localhost:3000` |
| `ADMIN_USER_IDS` | UUIDs reales | UUIDs de prueba | de prueba |
| `TRUSTED_PROXY` | (Vercel lo infiere) | igual | sin definir |

Los nombres canónicos están en [`.env.example`](../.env.example).

## Flujo de despliegue

Definido en `.github/workflows/staging.yml` *(pendiente, F13)*:

1. Merge a `main` → deploy automático a **staging**.
2. Aplicar migraciones en staging (nunca a mano; con la CLI).
3. Correr `pnpm smoke <url-staging>` (ver `scripts/smoke-staging.mjs`).
4. Verificación manual del flujo tocado por la fase.

Producción **sigue siendo manual y deliberada** (ver `DESPLIEGUE.md` y §7 del
plan). Staging valida; producción se promueve a mano.

## Alternativa mínima si el presupuesto no da (§16 del plan)

Un segundo proyecto Supabase + segundo bucket cuestan dinero. Si no se puede:

- **Supabase local** (`pnpm db:start`, requiere Docker) como entorno de
  migración.
- Un **preview deployment** de Vercel apuntando a él.

Es peor que un staging real, pero infinitamente mejor que probar contra
producción. La decisión es del dueño del proyecto.

## Estado

- [x] Documentado (este archivo).
- [ ] Proyecto Supabase de staging creado — **acción humana #13**.
- [ ] Bucket R2 de staging — **acción humana #13**.
- [ ] `.github/workflows/staging.yml` — depende de que existan los recursos.
