import { defineCloudflareConfig } from "@opennextjs/cloudflare"
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache"
import d1NextTagCache from "@opennextjs/cloudflare/overrides/tag-cache/d1-next-tag-cache"

// Configuración del adaptador de Cloudflare (OpenNext).
//
// En Vercel el caché incremental era invisible: la plataforma lo montaba sola.
// En Cloudflare hay que elegir DÓNDE vive, y la elección no es cosmética: si
// se equivoca, un artista publica y su perfil sigue mostrando la versión
// anterior. Vibe usa las tres cosas que dependen de esto —`revalidate = 300`
// en `/[username]` y `/[username]/tienda`, `revalidate = 3600` en el sitemap,
// y `revalidateTag` al publicar (`app/acciones/revalidar-perfil.ts`)—, así que
// hacen falta las dos piezas: dónde se guarda el HTML y dónde se guardan las
// etiquetas.
//
// ─── Caché incremental → R2 ───────────────────────────────────────────────
// El HTML renderizado va a un bucket de R2. Se eligió sobre KV por dos
// razones concretas:
//
//   • KV es de consistencia eventual (hasta ~60 s en propagar). Un artista que
//     publica y recarga vería su versión vieja durante un minuto sin ninguna
//     explicación visible. R2 es de lectura consistente.
//   • R2 no tiene el tope de 25 MB por valor de KV. El HTML de un perfil con
//     discografía larga no llega ahí hoy, pero el margen es gratis.
//
// Va en un bucket SEPARADO del de los archivos de los artistas. Mezclarlos
// significaría que un borrado accidental de caché puede tocar audio subido, y
// que las reglas de ciclo de vida de uno se aplican al otro.
//
// ─── Caché de etiquetas → D1 ──────────────────────────────────────────────
// `revalidateTag` necesita saber qué entradas invalidar. Se eligió D1 y no KV
// exactamente por lo mismo de arriba: publicar es el momento en que el usuario
// ESTÁ MIRANDO, y una invalidación que tarda un minuto en propagarse se lee
// como "el botón no funcionó". D1 es consistente en lectura tras escritura.
//
// La otra opción, `doShardedTagCache` (Durable Objects), rinde mejor a mucha
// escala y es a donde habría que mover esto si el volumen lo pide. Hoy sería
// complejidad sin una medición que la justifique.
//
// ─── Cola de revalidación → "direct" ──────────────────────────────────────
// La revalidación en segundo plano se hace en la misma petición en vez de
// pasar por un Durable Object. Es lo correcto para el volumen actual y evita
// provisionar un recurso más. Cuando el tráfico lo note, el cambio es una
// línea: `queue: doQueue` más el binding `NEXT_CACHE_DO_QUEUE`.
//
// ─── Lo que NO se activó, y por qué ───────────────────────────────────────
// `withRegionalCache` y la purga automática de caché quedan fuera de este
// primer paso a propósito. El propio adaptador documenta que la caché regional
// "no mejora directamente mucho el rendimiento" y que su ganancia real viene
// de saltarse la caché de etiquetas en los aciertos —algo que en Next 16 está
// desactivado por defecto porque rompe la revalidación con SWR—. Activarlas a
// ciegas cambiaría el comportamiento de invalidación sin ninguna medición que
// diga que hacía falta. Se revisan cuando haya tráfico real que medir.

export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
  tagCache: d1NextTagCache,
  queue: "direct",
})
