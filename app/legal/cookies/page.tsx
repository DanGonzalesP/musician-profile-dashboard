import { SITE_NAME } from "@/lib/site"

export const metadata = { title: "Política de Cookies — Vibe" }

export default function CookiesPage() {
  return (
    <article className="space-y-6 text-sm leading-relaxed text-foreground/90 [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-foreground [&_table]:w-full [&_td]:border-t [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left">
      <h1 className="font-display text-3xl font-bold text-foreground">
        Cookies y almacenamiento local
      </h1>
      <p>
        {SITE_NAME} usa muy pocas cookies. La mayoría de lo que guardamos vive en el almacenamiento
        local de tu navegador (localStorage) y sirve solo para que la app funcione y recuerde tus
        preferencias. No usamos cookies de publicidad ni rastreadores de terceros.
      </p>

      <h2>Qué guardamos y para qué</h2>
      {/* La tabla desborda a lo ancho en móvil, así que este contenedor scrollea.
          Un área scrolleable sin contenido enfocable no se puede recorrer con el
          teclado (WCAG 2.1.1): quien no usa mouse ni gestos táctiles no llega a
          las columnas de la derecha. `tabIndex={0}` la vuelve alcanzable con Tab
          y las flechas; `role="region"` + nombre accesible hacen que el lector de
          pantalla anuncie qué es. No cambia un solo píxel del estado normal:
          solo aparece el anillo de foco cuando alguien la enfoca. */}
      <div
        className="overflow-x-auto rounded-xl border border-border"
        tabIndex={0}
        role="region"
        aria-label="Tabla de cookies y almacenamiento local"
      >
        <table className="text-xs">
          <thead className="bg-card/60 text-muted-foreground">
            <tr>
              <th>Clave</th>
              <th>Tipo</th>
              <th>Para qué sirve</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="font-mono">sb-*</td>
              <td>localStorage (Supabase)</td>
              <td>Tu sesión iniciada — imprescindible para entrar a tu panel.</td>
            </tr>
            <tr>
              <td className="font-mono">amplitude-theme</td>
              <td>localStorage</td>
              <td>Si prefieres el modo oscuro o claro.</td>
            </tr>
            <tr>
              <td className="font-mono">amplitude-accent</td>
              <td>localStorage</td>
              <td>El color de acento que elegiste para la plataforma.</td>
            </tr>
            <tr>
              <td className="font-mono">amplitude:activeBandId:*</td>
              <td>localStorage</td>
              <td>Qué perfil (personal o grupo) estás editando en el panel.</td>
            </tr>
            <tr>
              <td className="font-mono">locale</td>
              <td>localStorage</td>
              <td>Tu idioma de interfaz (español o inglés).</td>
            </tr>
            <tr>
              <td className="font-mono">vibe:consentimiento-analitica</td>
              <td>localStorage</td>
              <td>Tu respuesta al aviso de métricas, para no volver a preguntártelo.</td>
            </tr>
            <tr>
              <td className="font-mono">Vercel Analytics</td>
              <td>señales anónimas</td>
              <td>
                Métricas agregadas de uso, sin identificarte ni cruzar datos entre sitios.{" "}
                <strong>Solo se carga si aceptas</strong> el aviso que aparece al pie.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Cómo controlarlo</h2>
      <p>
        Las métricas de uso son opcionales y están <strong>apagadas por defecto</strong>: la primera
        vez que entras aparece un aviso al pie con dos opciones, y hasta que respondas no se carga
        nada. Si eliges «Solo lo necesario», {SITE_NAME} nunca pide el script de analítica.
      </p>
      <p>
        Para cambiar de opinión, borra la clave{" "}
        <span className="font-mono">vibe:consentimiento-analitica</span> del almacenamiento local de
        tu navegador y el aviso volverá a preguntarte.
      </p>
      <p>
        Puedes borrar el almacenamiento local y las cookies desde la configuración de tu navegador en
        cualquier momento (perderás la sesión y tus preferencias visuales, nada más). Los reproductores
        embebidos de YouTube pueden colocar sus propias cookies al reproducir un video; se rigen por la
        política de Google.
      </p>
    </article>
  )
}
