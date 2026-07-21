import { LEGAL_CONTACT_EMAIL, SITE_NAME } from "@/lib/site"

export const metadata = { title: "Normas de Comunidad — Vibe" }

export default function ComunidadPage() {
  return (
    <article className="space-y-6 text-sm leading-relaxed text-foreground/90 [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-foreground [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
      <h1 className="font-display text-3xl font-bold text-foreground">Normas de Comunidad</h1>
      <p>
        {SITE_NAME} es un escenario compartido. Estas normas existen para que artistas y fans puedan
        crear, mostrar y descubrir música sin miedo a plagios, acoso ni estafas.
      </p>

      <h2>Lo esencial</h2>
      <ul>
        <li><strong>Sube solo lo tuyo.</strong> La música, fotos y videos que publiques deben ser de tu autoría o contar con permiso de sus titulares.</li>
        <li><strong>Acredita con verdad.</strong> No te atribuyas participaciones que no tuviste; los créditos internos requieren aprobación del dueño de la canción.</li>
        <li><strong>Respeta a las personas.</strong> Sin acoso, discursos de odio, amenazas ni humillaciones en comentarios o perfiles.</li>
        <li><strong>Vende con honestidad.</strong> Productos y servicios reales, descripciones veraces, precios claros y entregas cumplidas.</li>
        <li><strong>Nada ilegal.</strong> Cero contenido que sexualice a menores (se reporta a las autoridades), cero incitación a la violencia, cero venta de bienes ilícitos.</li>
        <li><strong>No manipules la plataforma.</strong> Sin spam, bots, compra de interacciones ni suplantación de artistas.</li>
      </ul>

      <h2>Consecuencias</h2>
      <p>
        Según la gravedad: advertencia, retiro del contenido, suspensión temporal o eliminación
        definitiva de la cuenta. Las infracciones de derechos de autor siguen su propia política de
        reincidencia. Los delitos se reportan a las autoridades.
      </p>

      <h2>Cómo reportar</h2>
      <p>
        Si ves contenido que rompe estas normas, escríbenos a{" "}
        <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-primary hover:underline">
          {LEGAL_CONTACT_EMAIL}
        </a>{" "}
        con el enlace exacto y una breve descripción. Revisamos todos los reportes.
      </p>
    </article>
  )
}
