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

> **Plataforma: Cloudflare Workers** (antes Vercel). "Dónde vive" cambió de
> sitio con la migración, y el sitio importa: una credencial puesta en el
> entorno equivocado no falla, se comporta distinto. Ver §3 de
> [`docs/cloudflare.md`](cloudflare.md).

| Credencial | Dónde vive | Alcance | Rotación | Frecuencia |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **entorno de build** + navegador | lectura pública vía RLS | regenerar en Supabase → actualizar en Workers Builds → **reconstruir** | anual, o ante incidente |
| **Service role Supabase** | **fuera de la app** | administrativa total | regenerar en Supabase | ante incidente |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | **secreto de Worker** | escritura/borrado en el bucket | crear token nuevo en Cloudflare → swap → revocar viejo | semestral, o ante incidente |
| `TOGETHER_API_KEY` | **secreto de Worker** | genera imágenes (pago) | regenerar en Together AI | anual, o si se filtra |
| `META_APP_ACCESS_TOKEN` | **secreto de Worker** | oEmbed de Meta | regenerar en Meta | según caduque Meta |
| `ADMIN_USER_IDS` | **secreto de Worker** | quién es admin | editar la lista | al cambiar el equipo |
| `R2_ENDPOINT` | **entorno de build** (no es secreto) | de él sale el `connect-src` de la CSP | actualizar y **reconstruir** | al cambiar de cuenta R2 |

⚠️ Las que dicen **entorno de build** no se propagan con un reinicio del
Worker: Next las incrusta en el código al compilar. Cambiarlas exige un build
nuevo. `R2_ENDPOINT` es la más traicionera —parece de ejecución porque no lleva
prefijo `NEXT_PUBLIC_`— y si falta en el build el navegador bloquea **todas**
las subidas mientras la API responde 200.

`VERCEL_OIDC_TOKEN` desapareció del inventario con la migración: era de la CLI
de Vercel. Su equivalente es la sesión de `pnpm wrangler login`, que vive en el
perfil del usuario y no en el repositorio.

## Rotación sin downtime (patrón swap)

Para R2 (dos claves activas simultáneas):

1. Crear un **token nuevo** en Cloudflare con los mismos permisos.
2. Actualizar los secretos del Worker:

   ```bash
   pnpm wrangler secret put R2_ACCESS_KEY_ID
   pnpm wrangler secret put R2_SECRET_ACCESS_KEY
   ```

   Los secretos surten efecto sin reconstruir: son de ejecución.
3. Verificar `GET /api/health` → `r2: "ok"`.
4. **Revocar** el token viejo en Cloudflare.

Para la anon key de Supabase el patrón NO sirve, y hay que saberlo antes de
empezar: regenerarla invalida la vieja de inmediato, y además es de **build**,
así que hace falta actualizarla en Workers Builds y **reconstruir y desplegar**
en la misma ventana. Es una rotación con downtime; coordinarla.

## ⚠️ `R2_ENDPOINT` es una variable de BUILD, no sólo de ejecución

Es la trampa menos obvia de todo el inventario, y rompe las subidas sin dejar
ni un error en el servidor.

`R2_ENDPOINT` cumple **dos** funciones:

1. Firma la URL de subida en `/api/upload-url` (runtime, servidor).
2. Es el origen que `lib/csp.ts` mete en `connect-src` para que el navegador
   pueda hacer el **PUT directo a R2**. El archivo nunca pasa por el servidor.

La CSP se arma en `proxy.ts`, que también se compila, y Next **incrusta** ahí
las variables de entorno durante el `build`. Consecuencia:

> Si `R2_ENDPOINT` no está presente **en el momento del build**, la CSP se
> despliega sin ese origen y el navegador bloquea todas las subidas — aunque la
> variable esté correctamente configurada en runtime.

El síntoma es engañoso: `/api/upload-url` responde 200 con una URL firmada
válida, `media_assets` registra la fila, y el PUT muere en el navegador con una
violación de CSP. Nada aparece en los logs del servidor.

**Qué hacer al rotar o al crear un entorno nuevo:**

1. Definir `R2_ENDPOINT` en el **entorno de build** (variables del proyecto en
   Cloudflare Workers Builds). Ponerla como secreto o en `vars` de
   `wrangler.jsonc` **no sirve**: eso es ejecución, y para entonces el valor ya
   quedó incrustado —o ausente— en el código.
2. Después de cambiarla, **reconstruir y desplegar** (no basta con guardar la
   variable: hay que compilar de nuevo para que se incruste).
3. Verificar en el navegador que una subida real termina, o revisar la cabecera
   `Content-Security-Policy` de cualquier página y comprobar que `connect-src`
   contiene el origen de R2.

La comprobación fail-closed de `lib/r2-config.ts` cubre la mitad de runtime
(sin configuración, `/api/upload-url` responde 503 con un mensaje seguro en vez
de firmar una subida imposible), pero **no puede cubrir la mitad de build**: en
runtime la variable está y todo parece correcto. Por eso esta nota existe.

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
