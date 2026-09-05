# Presupuesto de rendimiento — Vibe

Referenciado por **F11**. Objetivos medibles para que el rendimiento no se
degrade en silencio. Vibe es una **app** (editor interactivo, reproductor), no
una landing, así que el presupuesto de JS es más holgado que el de un sitio de
marketing.

## Objetivos

| Métrica | Objetivo | Medido | Estado |
|---|---|---|---|
| LCP (perfil público) | ≤ 2.5 s | _(pendiente F10)_ | ⏳ |
| CLS | ≤ 0.10 | _(pendiente)_ | ⏳ |
| INP | ≤ 200 ms | _(pendiente)_ | ⏳ |
| JS de la **primera pintura** (propio, gzip) | ≤ 200 kB | _(pendiente instrumentar)_ | ⏳ |
| Imagen de perfil | ≤ 500 kB | comprimida en el navegador con `browser-image-compression` | ✅ (mecanismo) |

## Nota sobre el bundle actual

De [`linea-base.md`](linea-base.md): el `.next/static` emite ~11 MB sin
comprimir, pero **8.72 MB son el core de ffmpeg.wasm**, que se carga con
`import()` dinámico sólo al transcodificar un audio (`lib/audio-transcode.ts`).
**No está en la ruta crítica.** El segundo chunk es 419 kB, el tercero 246 kB.

La cifra que importa —el JS de la primera pintura del perfil público— **no está
instrumentada todavía**. Se instrumenta al hacer F10 (render en servidor), que
es donde el número se vuelve accionable: hoy el perfil se hidrata en el cliente
(P-18), así que medir la primera pintura antes de F10 mide un esqueleto.

## `images.unoptimized: true` — se mantiene (P-20)

Decisión de F11. Las imágenes vienen de R2 con dimensiones variables y el editor
ya las comprime en el navegador. Activar el optimizador de Next añade costo por
transformación en la plataforma y riesgo de cambio visual, a cambio de un beneficio que
la compresión previa ya captura. Se revisa **con datos** si el presupuesto lo
pide, no antes.

## Cómo se medirá

- Lighthouse CI sobre el perfil público servido
  desde el servidor (post-F10).
- El tamaño del primer JS, con el output del `next build` (ya se registra en la
  línea base; falta separar "primera pintura" del total).

## Estado

- [x] Objetivos definidos.
- [ ] Instrumentación de las Core Web Vitals — depende de F10.
- [ ] Cifras reales al lado de los objetivos — tras instrumentar.
