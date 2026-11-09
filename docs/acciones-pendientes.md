# Acciones pendientes — todo lo que necesita una persona

> Revisión 2026-10-04: consultar primero `../ACCIONES_HUMANAS_FINALES.md` y
> `../ESTADO_PLAN.md`. Se conserva este historial; sus afirmaciones de que
> R2_ENDPOINT/R2_BUCKET_NAME sólo van en build y de que bastan credenciales
> para terminar ya no describen el estado verificado. No recrear recursos.

**Estado histórico 2026-09-27.** Decima fue restaurado entonces desde la cuenta
personal y los recursos de caché de Cloudflare se crearon en la cuenta personal.
**Actualización 2026-11-04:** el proyecto se transfirió a la organización
empresarial Supabase y se renombró **Vibe Music**; conserva la referencia y los
datos. No asumir que Vibe está desplegado: siguen pendientes las verificaciones
operativas indicadas más abajo. Se retiró con confirmación explícita el miembro
temporal Developer; la UI muestra un miembro Owner (`vibemusicprofile@gmail.com`).
Supabase conserva 3 usuarios, 2 perfiles, 14 bloques, 63 objetos Storage, 0
`media_assets` y 18 migraciones. Antes de retirarlo se respaldaron y verificaron
80 snippets privados únicos (80/80; 141340 bytes de texto plano total) con DPAPI
local en `.wrangler/migracion-empresa-2026-11-04/snippets-cifrados/manifest.json`.
Los snippets del panel se eliminaron al retirar el miembro; no se eliminaron la
BD ni archivos. Estado al inicio del 2026-11-04, antes de la copia: Cloudflare
empresarial tenía R2 activo, buckets privados vacíos
`vibe-artist-media`, `vibe-cache-incremental` y `vibe-static-assets`, y D1 vacía
`02051ecd-e52a-4b5f-8e81-f5d44b63a03f`; entonces aún no había copia de archivos
ni deploy.

**Actualización 2026-11-04 (estado posterior):** Wrangler empresarial autorizado
usa el perfil `vibe` asociado solo a este repositorio; el perfil global y Bancary
quedaron intactos. Supabase CLI empresarial está aislada, token protegido con
DPAPI, y solo lista `Vibe Music` (`ACTIVE_HEALTHY`). D1 ahora tiene el esquema
`revalidations(tag,revalidatedAt,stale,expire)`, `tag` único, 0 filas. La copia
R2 de `derias-assets` a `vibe-artist-media` terminó y se verificó: 67 objetos,
124,720,470 bytes; origen intacto, bucket destino privado, `media_assets` 0,
URLs antiguas intactas y sin deploy. Evidencia local ignorada por Git:
`.wrangler/migracion-empresa-2026-11-04/r2-copia-verificada.json`. WASM cotejado:
32,232,419 bytes, SHA-256 `9F57947A5BD530D8F00C5B3F2CB2A3492FAA7E5D823315342D6A8656D0A6B7B7`.
La credencial empresarial de runtime está creada, protegida y verificada con
alcance al bucket de artistas; la primera clave se rotó tras una exposición
accidental y su revocación se comprobó. Detalle y evidencia en
[`migracion-empresa-vibe.md`](migracion-empresa-vibe.md). No ejecutar migraciones `0018`–`0024`: el dry-run detectó que
`0022` es incompatible con rutas antiguas antes de un corte coordinado.

**Cómo leer este documento.** Cada acción lleva una etiqueta:

| Etiqueta | Significa |
|---|---|
| 🌐 **Web** | Se hace en el panel del proveedor. Un agente con acceso al navegador puede hacerlo |
| 💻 **Terminal** | Necesita la línea de comandos en tu máquina |
| 🧠 **Decisión** | Nadie puede tomarla por ti |
| 🤝 **Me lo pasas** | Tú consigues el dato y yo hago el cambio en el código |

⚠️ **Nunca pegues credenciales en un chat.** Las claves de R2, Supabase o
Together AI se escriben directamente en el panel del proveedor. Ningún agente
—yo incluido— necesita verlas.

---

# BLOQUE 1 · Lo que bloquea el despliegue

Sin esto, Vibe no puede salir a producción. En orden.

## 1.0 · Reactivar y transferir el proyecto de Supabase de Vibe — ✅ Completado

El proyecto actual de Vibe se llama **Vibe Music** en Supabase (referencia
`yiexwdqgaqoqlfqihsfr`), transferido a la organización empresarial el
2026-11-04. Su nombre anterior era **Decima**; conserva la misma referencia y
datos. Fue restaurado inicialmente el 2026-09-27 desde la cuenta personal.
**No lo recrees ni uses los proyectos de Bancary.**

> La restauración conservó la base de datos y sus usuarios. La transferencia
> también conservó la referencia y los datos; las verificaciones operativas
> siguen pendientes.

## 1.1 · Crear el bucket de caché en R2 — ✅ Completado

Creado el 2026-09-27 en la cuenta personal de Cloudflare de Vibe, separada de Bancary.

- **Nombre:** `vibe-cache-incremental`

También está creado el bucket privado `vibe-static-assets`, separado de la
caché y de los archivos de artistas. Contiene únicamente el WASM de FFmpeg que
supera el límite de 25 MiB de Workers Static Assets; el Worker lo sirve por una
ruta de mismo origen que solo expone ese objeto fijo.

O por terminal:

```bash
pnpm wrangler r2 bucket create vibe-cache-incremental
```

> **Es un bucket distinto** del que guarda la música y las imágenes de los
> artistas. Mezclarlos significaría que un vaciado de caché puede tocar audio
> subido por alguien, y que las reglas de ciclo de vida de uno se apliquen al
> otro.

## 1.2 · Crear la base D1 de etiquetas — ✅ Completado

Creada el 2026-09-27 en la cuenta personal de Cloudflare de Vibe, separada de Bancary.

- **Nombre:** `vibe-cache-etiquetas`

O por terminal:

```bash
pnpm wrangler d1 create vibe-cache-etiquetas
```

Su identificador `e2596149-b064-4be5-95b9-6ed0acede920` ya quedó registrado en `wrangler.jsonc`.

> Esto es lo que hace que "publicar" se vea **de inmediato** en el perfil
> público. Sin ello, un artista publica y sigue viendo su versión anterior.

## 1.3 · Pegar el `database_id` — ✅ Completado

El identificador real de la D1 de Vibe se fijó en `wrangler.jsonc` el
2026-09-27, junto al `account_id` personal para impedir que Wrangler elija la
cuenta de Bancary por defecto.

## 1.4 · Variables de entorno en Cloudflare — 🌐 Web

**Ésta es la parte donde es más fácil equivocarse**, y ya costó un bug real.
Hay **tres sitios distintos** y no son intercambiables.

### A) Entorno de BUILD — Workers & Pages → tu proyecto → Settings → Build → *Variables*

Next **incrusta estas variables en el código al compilar**. Si sólo las pones
en ejecución, la app compila, despliega, arranca… y el navegador recibe
`undefined`.

| Variable | Qué es |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL de tu proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave pública (anon) de Supabase |
| `NEXT_PUBLIC_R2_PUBLIC_URL` | URL pública del bucket de archivos |
| `NEXT_PUBLIC_SITE_URL` | Tu dominio definitivo, con `https://` y sin barra final |
| `R2_ENDPOINT` | ⚠️ Ver la advertencia de abajo |
| `R2_BUCKET_NAME` | Nombre del bucket de archivos de los artistas |
| `NEXT_PUBLIC_CF_BEACON_TOKEN` | Token de Cloudflare Web Analytics (opcional) |
| `NEXT_PUBLIC_VALIDACION_BLOQUES` | Dejar vacío (= `observar`) |

> ⚠️ **`R2_ENDPOINT` es la traicionera.** No lleva prefijo `NEXT_PUBLIC_`, así
> que parece de ejecución. **No lo es.** De ella sale el origen que la política
> de seguridad (CSP) mete en `connect-src`, y esa política se compila. Si falta
> en el build, **el navegador bloquea TODAS las subidas de archivos** aunque la
> variable esté puesta en ejecución.
>
> El síntoma engaña: la API responde 200, la fila se registra en la base, y **no
> queda nada en los registros del servidor**. Todo parece bien y nada se sube.

### B) Variables de EJECUCIÓN — ya están en el repositorio

`TRUSTED_PROXY=true` vive en `wrangler.jsonc` y se despliega solo. No toques
nada.

### C) SECRETOS — Workers & Pages → tu proyecto → Settings → Variables → *Add* → marcar **Encrypt**

Estas **nunca** se escriben en el repositorio.

| Secreto | Qué es |
|---|---|
| `R2_ACCESS_KEY_ID` | Token de R2 |
| `R2_SECRET_ACCESS_KEY` | Token de R2 |
| `R2_ACCOUNT_ID` | Id de tu cuenta Cloudflare |
| `ADMIN_USER_IDS` | Tu UUID de Supabase (Authentication → Users → columna UID). Separados por coma si son varios |
| `TOGETHER_API_KEY` | Sólo si quieres generación de imágenes con IA |
| `META_APP_ACCESS_TOKEN` | Opcional: embeds de Facebook/Instagram |

Por terminal sería `pnpm wrangler secret put NOMBRE`.

> **Fail-closed en todo:** sin `ADMIN_USER_IDS`, **nadie** es administrador y
> las herramientas de mantenimiento quedan cerradas. Sin `TOGETHER_API_KEY`, la
> generación de imágenes responde un mensaje claro en vez de llamar al
> proveedor con una credencial vacía.

## 1.5 · Autorizar la URL de recuperación de contraseña — 🌐 Web

Supabase → **Authentication** → **URL Configuration**:

1. **Site URL:** tu dominio definitivo (el mismo de `NEXT_PUBLIC_SITE_URL`).
2. **Redirect URLs:** añadir `https://TU-DOMINIO/nueva-contrasena`

> Sin esto, el enlace de recuperación llega **roto** al correo del usuario y
> **no aparece ningún error en ningún panel**. Es silencioso.

## 1.6 · Revisar el correo de Supabase — 🌐 Web

**a) La plantilla.** Authentication → Email Templates → *Reset Password*. La que
trae por defecto está en inglés y sin tu marca. Es el primer correo que recibe
un artista que perdió el acceso.

**b) El SMTP.** Project Settings → Authentication → SMTP Settings.

> El servidor de cortesía de Supabase tiene un límite bajo por hora y **no
> sirve para producción**: pasado cierto volumen los correos simplemente dejan
> de salir, sin aviso. Si vas a abrir registros, configura un SMTP propio
> (Resend, Postmark, SendGrid o similar).

## 1.7 · Revisar las migraciones pendientes — 🌐 Web (SQL Editor) o 💻 Terminal

El registro histórico de abajo decía que producción estaba en `0017` y que
faltaban dos migraciones. Actualización 2026-11-04: Supabase CLI empresarial
aislada lista solo `Vibe Music` en `ACTIVE_HEALTHY`; el dry-run remoto inspeccionó
`0018`–`0024` y **no aplicó ninguna**. No ejecutar ni retirar `--dry-run`: `0022`
es incompatible con rutas antiguas y su aplicación exige corte coordinado.
Comprobar el historial exacto y acordar secuencia/compatibilidad antes de cualquier
aplicación. La tabla siguiente conserva únicamente los nombres que ya figuraban
en el registro histórico:

| Migración | Qué hace |
|---|---|
| `0018_corregir_concurrencia_y_suspension.sql` | Concurrencia y suspensión de perfiles |
| `0019_cuota_almacenamiento.sql` | La medición de la cuota de almacenamiento |

Antes de una futura ejecución se requiere backup verificado, comparación del
historial remoto y plan de corte compatible; el dry-run por sí solo no basta para
aplicar migraciones.

## 1.8 · Configurar el CORS del bucket de archivos — 💻 Terminal

```bash
pnpm node scripts/setup-r2-cors.mjs
```

Permite `localhost`, `*.workers.dev` y el origen de `NEXT_PUBLIC_SITE_URL`.

> ⚠️ **Esa variable tiene que estar definida al correrlo.** Si no, tu dominio de
> producción no queda autorizado y las subidas fallarán desde él.

## 1.9 · Desplegar — 🌐 Web o 💻 Terminal

Lo más simple es conectar el repositorio a **Cloudflare Workers Builds**
(Workers & Pages → *Create* → *Connect to Git*), con:

- **Build command:** `pnpm cf:build`
- **Deploy command:** `pnpm cf:deploy`

O manualmente:

```bash
pnpm cf:build && pnpm cf:deploy
```

> ⚠️ `pnpm cf:build` **no funciona en tu Windows** por un bug del adaptador al
> copiar enlaces simbólicos. No es del proyecto y Linux no lo tiene. Detalle en
> §4.1 de [`cloudflare.md`](cloudflare.md). Lo normal es que construya
> Cloudflare, no tu máquina.

---

# BLOQUE 2 · Comprobar que quedó bien

Después de desplegar, y en este orden.

## 2.1 · Salud del servicio — 🌐 Web

Abre `https://TU-DOMINIO/api/health`. Debe decir:

- `estado: "ok"`
- `version:` **algo que no sea `"desarrollo"`**

> Si dice `"desarrollo"`, el build no recibió el commit y **no vas a poder saber
> qué versión está sirviendo** cuando algo falle.

## 2.2 · Subir un audio y una imagen — 🌐 Web

Entra al editor y sube los dos. **Es la prueba que detecta si `R2_ENDPOINT`
faltó en el build** (§1.4). Si algo se queda a medias sin error visible, ése es
el motivo.

## 2.3 · Publicar un perfil — 🌐 Web

Publica y comprueba que el cambio se ve **de inmediato** en el perfil público.
Eso ejercita la base D1 de §1.2.

## 2.4 · Compartir el enlace — 🌐 Web

Pega la URL de un perfil en WhatsApp o Slack: debe salir la tarjeta con imagen.
Eso verifica `NEXT_PUBLIC_SITE_URL`.

## 2.5 · Recuperar una contraseña de verdad — 🌐 Web

Desde `/login` → "¿Olvidaste tu contraseña?" con un correo tuyo real. Comprueba
que **llega** y que el enlace **funciona**. Verifica §1.5 y §1.6 juntas.

## 2.6 · Verificación de seguridad (F0) — 🌐 Web

Con la clave pública (anon), comprobar contra producción que:

- No se pueden leer DNIs ni datos personales de otros.
- `/api/cleanup-orphaned-files` responde **401** sin sesión de admin.

---

# BLOQUE 3 · Decisiones que sólo tú puedes tomar

## 3.1 · Cuota de almacenamiento por perfil — 🧠 Decisión

**Ahora mismo no rechaza a nadie.** Está en modo observación: registra lo que
habría rechazado y deja pasar.

**Qué hacer:** deja pasar unas semanas y busca en los registros del Worker:

```
subida por encima de la cuota de almacenamiento
```

- Si **casi nadie** aparece → el valor por defecto (5 GB) es holgado.
- Si aparecen **artistas legítimos** (perfiles con discografía larga, no
  scripts) → el número está corto y hay que subirlo **antes** de activar el
  rechazo.

Cuando lo tengas: `CUOTA_ALMACENAMIENTO_GB=<n>` y
`CUOTA_ALMACENAMIENTO_MODO=rechazar`.

> Lo dejé así porque el fallo es **asimétrico**: un límite corto y activo hace
> que artistas legítimos no puedan subir su disco **y se vayan sin decir nada**.

## 3.2 · Aprobar las capturas visuales de referencia — 🧠 Decisión + 💻 Terminal

```bash
pnpm test:visual:update
```

Revisa cada PNG y versiónalos. **Definen oficialmente "así se ve Vibe"**: hasta
que existan, un cambio de color o espaciado puede colarse sin que nada lo note.

## 3.3 · El contraste del color de marca — 🧠 Decisión

El rojo de Vibe sobre texto claro da **3.89:1**; el estándar de accesibilidad
(WCAG AA) pide **4.5:1**. Afecta a todos los botones primarios.

**No lo he tocado** porque cambiar el color de la marca es tu decisión, no un
arreglo silencioso. Opciones: oscurecer el rojo, o dejarlo y asumir la deuda
(está documentada en [`accesibilidad.md`](accesibilidad.md)).

## 3.4 · El bloque que `next dev` escribe en `AGENTS.md` — 🧠 Decisión

Next 16 añade solo un bloque `nextjs-agent-rules` dentro de `AGENTS.md`, que es
el archivo de gobierno del proyecto. Lo he estado **excluyendo de los commits**
porque cambia cómo se gobierna el proyecto y eso no debería colarse en un
commit de otra cosa.

Reaparece cada vez que corres `next dev`. ¿Lo aceptamos o lo bloqueamos?

## 3.5 · Alertas de seguridad de Dependabot — 🌐 Web

GitHub → repositorio → Settings → **Code security** → activar *Dependabot
alerts* y *Dependabot security updates*.

> Ahora están **desactivadas**. Por eso dos vulnerabilidades altas
> (`browserslist`, `fast-uri`) pasaron dos semanas sin aviso: las atrapó el CI,
> no GitHub. ¿Las activo yo o prefieres hacerlo tú?

## 3.6 · Decisiones de proveedor y de negocio — 🧠 Decisión

| Tema | La decisión |
|---|---|
| **Registro anti-abuso** | ¿Captcha con proveedor externo, o confirmación de correo (que ya existe en Supabase)? |
| **Errores y logs** | Los logs viven en Cloudflare Workers Logs y se retienen pocos días. ¿Logpush a R2 (barato, ya lo pagas) o Sentry? |
| **Correo legal** | Hoy `LEGAL_CONTACT_EMAIL` es tu correo personal, y es la dirección donde por ley llegan las notificaciones de derechos de autor. Hace falta uno institucional |
| **Plazos de DMCA** | Cuánto tardas en responder una reclamación. Decisión legal |
| **Tablas heredadas** | Qué hacer con `orders` / `order_items` / `donations` |
| **Retención y RTO/RPO** | Cuánto tiempo guardas los datos y cuánto tolerarías estar caído |

---

# BLOQUE 4 · Cuando ya esté funcionando

No bloquean el lanzamiento, pero sí importan antes de crecer.

| # | Acción | Tipo |
|---|---|---|
| 4.1 | **Backups + ejecutar una restauración de prueba.** Un backup que nunca se restauró no es un backup | 🌐 Web |
| 4.2 | Activar versioning y reglas de ciclo de vida en R2 | 🌐 Web |
| 4.3 | Alertas de gasto en R2, Together AI y Cloudflare | 🌐 Web |
| 4.4 | Crear proyecto Supabase y bucket R2 de **staging** | 🌐 Web |
| 4.5 | Panel de moderación | 🧠 Decisión (ver abajo) |
| 4.6 | Onboarding del primer perfil | 🧠 Decisión |
| 4.7 | Límite distribuido para `/api/oembed` | Programable |

**Sobre 4.5:** hoy, si alguien sube algo ilegal, no tienes forma de bajarlo sin
entrar a SQL. Para construirlo hace falta decidir **cómo se representa la
identidad de administrador dentro de Postgres**, para que las reglas de la base
(RLS) sean la segunda barrera y no sólo el código. Sin esa decisión, el panel
sería una falsa sensación de seguridad.

---

# Anexo · Qué se hizo en esta sesión

Cinco cambios, todos fusionados y en verde.

| PR | Qué |
|---|---|
| #14 | Dueño real en CODEOWNERS y protección de la rama `main` |
| #16 | **Migración completa de Vercel a Cloudflare Workers** |
| #18 | **Recuperación de contraseña** (no existía) |
| #19 | Corrección de un dato equivocado que yo mismo había escrito |
| #20 | **Cuota de almacenamiento** por usuario |

**Pruebas:** 259 → **286** unitarias · 110 → **116** de base · 92 → **112** E2E.
La rama `main` exige **6 comprobaciones** para aceptar cualquier cambio.

### Lo que se arregló sin que se supiera que estaba roto

- **No existía recuperación de contraseña.** Un artista que la olvidaba perdía
  su perfil.
- **Nada limitaba el volumen** que una cuenta podía subir a R2. El límite
  existente frena la *frecuencia*, no el *volumen*: 120 archivos de 200 MB por
  hora son 24 GB/hora, todos dentro del límite.
- **Dos vulnerabilidades altas** en dependencias, detectadas por el CI el mismo
  día que se activó la protección de rama.
- **Un fallo de permisos en mi propia migración**, que dejaba una función de la
  base llamable por cualquiera. Lo atrapó una prueba que esperaba un error y no
  lo recibió.

### Lo que decidí NO tocar

- **El color de marca** (§3.3): es tu decisión.
- **El bloque en `AGENTS.md`** (§3.4): cambia el gobierno del proyecto.
- **La cuota activa**: sin datos reales, un número inventado echa artistas.

---

## Documentos relacionados

- [`cloudflare.md`](cloudflare.md) — runbook técnico completo del despliegue
- [`PLAN_VIBE_EMPRESARIAL.md`](../PLAN_VIBE_EMPRESARIAL.md) §8 — lista maestra
- [`observabilidad.md`](observabilidad.md) §2.bis — leer los registros de cuota
- [`rotacion-de-credenciales.md`](rotacion-de-credenciales.md) — rotar claves
- [`accesibilidad.md`](accesibilidad.md) — la deuda de contraste
