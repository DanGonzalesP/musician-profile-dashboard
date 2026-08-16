# Accesibilidad — Vibe

Cierra parte de **P-33**. La suite de axe (F8) corre en Playwright sobre las
páginas legales, el login, el **feed**, el **perfil público** y la **tienda**
(`tests/e2e/legal-a11y.spec.ts`, `tests/e2e/perfil-publico.spec.ts`,
`tests/e2e/feed.spec.ts`), en escritorio y en móvil.

Las páginas con datos ya no se saltan: sus datos salen del servidor de fixtures
(`tests/e2e/fixtures/servidor-supabase.mjs`), así que la auditoría corre sobre
el perfil de verdad, con hero, single, productos y servicios pintados.

## Violaciones reales encontradas y corregidas por esta suite

Las dos las detectó axe corriendo, no una lectura del código:

1. **`/legal/cookies` — región scrolleable sin foco** (WCAG 2.1.1, seria, sólo
   en móvil). La tabla de cookies desborda a lo ancho y su contenedor no era
   alcanzable con el teclado: quien no usa mouse ni gestos no llegaba a las
   columnas de la derecha. Arreglado con `tabIndex={0}` + `role="region"` y
   nombre accesible. Cero cambios visuales: sólo aparece el anillo de foco.
2. **Riel de filtros del feed en móvil — `role="tablist"` con hijos que no son
   pestañas** (WCAG 1.3.1, **crítica**). Los chips son botones de alternancia
   (`aria-pressed`), no pestañas, y no controlan paneles: un lector de pantalla
   anunciaba "pestaña 1 de 7" sobre controles que no lo son. Cambiado a
   `role="group"`. Cero cambios visuales.

## Elemento nuevo auditado: el aviso de consentimiento

El banner de cookies (P-31) es la única incorporación visible de esta tanda, así
que se audita explícitamente en `tests/e2e/consentimiento-cookies.spec.ts`:

- **No es un modal.** No atrapa el foco ni bloquea la página; no lleva
  `role="dialog"` porque no lo es. Un muro de consentimiento sobre el perfil
  público de un artista sería peor producto y peor accesibilidad.
- Es una `region` con nombre accesible, y sus dos botones se alcanzan con Tab y
  se activan con Enter — hay una prueba que lo recorre sin mouse.
- axe corre con el aviso **visible** y exige cero violaciones críticas ni serias.

## El defecto que hacía que todo esto valiera menos de lo que parecía

Corregido el **16 de agosto de 2026**, y es el hallazgo más importante de la
auditoría de esta suite: **React nunca hidrataba durante las pruebas**.

`next dev` bloquea por defecto las peticiones a sus recursos internos que no
vengan del host con el que arrancó (`localhost`), y Playwright navega por
`127.0.0.1`. El síntoma no era un error rojo sino algo peor: la página se servía
completa desde el servidor, el cliente nunca arrancaba, y **la suite pasaba en
verde comprobando sólo el HTML**. Cualquier aserción de interacción —foco con
teclado en el feed, por ejemplo— pasaba por el motivo equivocado, y axe auditaba
un árbol que ningún componente cliente había tocado.

Se detectó porque el aviso de consentimiento de cookies, que es puro cliente, no
aparecía nunca. Se corrige con `allowedDevOrigins: ["127.0.0.1"]` en
`next.config.mjs` (opción de desarrollo; `next build`/`next start` no la leen).

Con la hidratación funcionando, las 88 pruebas E2E siguen en verde: la
comprobación de axe pasa a ser sobre el árbol real, y el resultado no cambió.

## Gate actual

**Cero violaciones críticas ni serias de axe**, con dos excepciones documentadas
—ambas por "dependencia del color"—: `color-contrast` y `link-in-text-block`.
Todo lo demás (roles ARIA, nombres accesibles, orden de foco, landmarks,
etiquetas de formulario) sí bloquea el CI.

## Deuda conocida: dependencia del color

Dos reglas serias, ambas por transmitir información sólo con color:

1. **`color-contrast`** — el color de marca (abajo).
2. **`link-in-text-block`** — los enlaces dentro del cuerpo de texto legal se
   distinguen sólo por color, sin subrayado. Arreglarlo (subrayar los enlaces
   en prosa) cambia píxeles en las páginas legales; se difiere hasta tener la
   aprobación visual, y entonces se quita de los `.disableRules([...])`.

## Detalle: contraste del color de marca

axe reporta una violación **seria** de `color-contrast` (WCAG 2 AA, 1.4.3) sobre
los elementos con `.bg-primary` — el color de acento de la marca, usado en
botones y badges en todas las páginas.

**Por qué no se arregla aquí:** subir el contraste cambia el color de marca, y
el principio innegociable del plan es *"cero cambios visuales sin aprobación
explícita"*. Cambiar el pixel de la marca es una decisión de diseño, no un
arreglo silencioso que un agente deba meter en una fase de a11y.

**Qué se hizo en cambio:** se excluye `color-contrast` del gate (mismo criterio
que el trinquete de warnings del lint) y se deja registrado aquí. El resto de
axe queda activo y bloqueante, que es donde está la mayor parte del valor.

**Cómo cerrarlo (decisión de diseño, humana):**
1. Medir el ratio actual de `--primary` sobre su fondo (debe ser ≥ 4.5:1 para
   texto normal, ≥ 3:1 para texto grande/controles).
2. Ajustar el token de color (o el color del texto encima) hasta cumplir.
3. Aprobar el cambio con la captura antes/después (afecta el look de la marca).
4. Quitar `color-contrast` de los `.disableRules([...])` de las specs de axe.

## Pendiente (necesita una sesión autenticada de verdad)

- Recorrido completo del **editor** con teclado (arrastrar/soltar, pestañas,
  modales, reproductor). El editor exige sesión, y el servidor de fixtures es
  de sólo lectura y sin auth a propósito: simular un JWT válido significaría
  o falsificar Supabase Auth entero, o meter una credencial en el repositorio.
  Se cubre cuando exista el Supabase local de F6 (Docker + baseline `0000`).
- Recorrido del **reproductor** con teclado y lector de pantalla: depende de
  poder reproducir audio real, que en un navegador headless sin salida de audio
  no verifica nada honesto.
