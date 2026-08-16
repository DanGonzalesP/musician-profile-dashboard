# Rotación e inventario de credenciales — Vibe

Cierra **P-12**. No había inventario ni política de rotación. Este documento
lista cada credencial, su dueño, dónde vive, cómo se rota y con qué frecuencia.

## Principio

- La **service role key de Supabase NO existe** en el código ni en el runtime
  de la app (invariante del plan). Si alguna vez se usa para una tarea
  administrativa, vive en un proceso aparte, nunca en una ruta de Next.
- Ninguna credencial se commitea. `.gitignore` bloquea `.env*` salvo la
  plantilla sin valores `.env.example`.
- Fail-closed: sin la credencial, la funcionalidad sensible se apaga, no se
  abre (p. ej. sin `TOGETHER_API_KEY`, `/api/generate-image` responde 503).

## Inventario

| Credencial | Dónde vive | Alcance | Rotación | Frecuencia |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel + navegador | lectura pública vía RLS | regenerar en Supabase → actualizar en Vercel | anual, o ante incidente |
| **Service role Supabase** | **fuera de la app** | administrativa total | regenerar en Supabase | ante incidente |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | Vercel (server-only) | escritura/borrado en el bucket | crear token nuevo en Cloudflare → swap → revocar viejo | semestral, o ante incidente |
| `TOGETHER_API_KEY` | Vercel (server-only) | genera imágenes (pago) | regenerar en Together AI | anual, o si se filtra |
| `META_APP_ACCESS_TOKEN` | Vercel (server-only) | oEmbed de Meta | regenerar en Meta | según caduque Meta |
| `ADMIN_USER_IDS` | Vercel | quién es admin | editar la lista | al cambiar el equipo |
| `VERCEL_OIDC_TOKEN` | `.env.local` en disco (no versionado) | despliegue local | lo regenera Vercel CLI | automática |

## Rotación sin downtime (patrón swap)

Para R2 (dos claves activas simultáneas):

1. Crear un **token nuevo** en Cloudflare con los mismos permisos.
2. Actualizar `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` en Vercel.
3. Redesplegar (o dejar que Vercel propague).
4. Verificar `GET /api/health` → `r2: "ok"`.
5. **Revocar** el token viejo en Cloudflare.

Para la anon key de Supabase: regenerarla invalida la vieja de inmediato, así
que se actualiza en Vercel y se redepliega en la misma ventana. Coordinar.

## Supply chain (acciones de CI)

Las GitHub Actions del CI (`gitleaks`, `checkout`, `setup-node`) deberían
fijarse **por digest** (`@<sha256>`), no por tag: un tag movido cambia lo que
corre. Hoy `gitleaks-action` está fijada a `@v2` con una nota en
`.github/workflows/ci.yml`. Fijarla por digest es una acción humana de un
minuto (copiar el SHA del release y reemplazar el tag).

## Ante un incidente

Ver [`runbooks/incidente-de-seguridad.md`](runbooks/incidente-de-seguridad.md):
contención, rotación de las credenciales afectadas, y notificación bajo Ley
29733 si hubo exposición de datos personales.

## Estado

- [x] Inventario y política documentados.
- [ ] Primera rotación programada y fechada — **humano**.
- [ ] Acciones de CI fijadas por digest — **humano** (un minuto).
