import { LEGAL_CONTACT_EMAIL, LEGAL_JURISDICTION, SITE_NAME } from "@/lib/site"

export const metadata = { title: "Política de Privacidad — vibra" }

export default function PrivacidadPage() {
  return (
    <article className="space-y-6 text-sm leading-relaxed text-foreground/90 [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-foreground [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
      <h1 className="font-display text-3xl font-bold text-foreground">Política de Privacidad</h1>
      <p>
        Esta política explica qué datos personales tratamos en {SITE_NAME}, para qué y con qué base,
        conforme a la Ley N.º 29733 de Protección de Datos Personales de la {LEGAL_JURISDICTION} y,
        cuando aplique, al RGPD europeo.
      </p>

      <h2>1. Datos que recogemos</h2>
      <ul>
        <li><strong>Cuenta:</strong> correo electrónico y contraseña (la contraseña se guarda cifrada por nuestro proveedor de autenticación; nunca la vemos en claro).</li>
        <li><strong>Perfil:</strong> nombre artístico, roles, biografía, colores, fotos, música y todo el contenido que decidas publicar. Tu perfil público es, por definición, visible para cualquiera.</li>
        <li><strong>Actividad:</strong> comentarios, likes y interacciones dentro del feed.</li>
        <li><strong>Técnicos:</strong> datos de uso agregados y anónimos para métricas de la plataforma (Vercel Analytics), sin cookies de publicidad.</li>
      </ul>

      <h2>2. Para qué los usamos</h2>
      <ul>
        <li>Operar tu cuenta y mostrar tu perfil público (ejecución del contrato).</li>
        <li>Mostrar tu contenido en el feed y conectar artistas con fans (ejecución del contrato).</li>
        <li>Seguridad: prevenir fraude, abuso y accesos no autorizados (interés legítimo).</li>
        <li>Mejorar la plataforma con métricas agregadas (interés legítimo).</li>
        <li>Atender obligaciones legales, incluidos reclamos de derechos de autor.</li>
      </ul>
      <p>No vendemos tus datos personales ni los usamos para publicidad de terceros.</p>

      <h2>3. Quién procesa los datos por nosotros</h2>
      <ul>
        <li><strong>Supabase</strong> — autenticación y base de datos.</li>
        <li><strong>Cloudflare R2</strong> — almacenamiento de archivos (audio, imágenes, video).</li>
        <li><strong>Vercel</strong> — alojamiento de la aplicación y métricas anónimas.</li>
        <li><strong>Together AI</strong> — solo si usas el generador de imágenes: el texto del prompt se envía para generar la imagen.</li>
      </ul>
      <p>
        Estos proveedores pueden estar fuera de tu país; trabajamos solo con servicios que ofrecen
        garantías contractuales de protección de datos.
      </p>

      <h2>4. Cuánto tiempo los conservamos</h2>
      <p>
        Mientras tu cuenta exista. Si la eliminas, borramos o anonimizamos tus datos personales en un
        plazo razonable, salvo lo que debamos conservar por obligación legal (por ejemplo, registros
        de reclamos de derechos de autor).
      </p>

      <h2>5. Tus derechos</h2>
      <p>
        Puedes acceder, rectificar, oponerte, pedir la portabilidad o la eliminación de tus datos
        (derechos ARCO). La mayoría los ejerces directamente desde tu panel (Configuración, editor,
        eliminación de contenido). Para lo demás, escríbenos a{" "}
        <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-primary hover:underline">
          {LEGAL_CONTACT_EMAIL}
        </a>
        . También puedes reclamar ante la Autoridad Nacional de Protección de Datos Personales.
      </p>

      <h2>6. Seguridad</h2>
      <p>
        Usamos HTTPS en toda la plataforma, controles de acceso a nivel de fila en la base de datos
        (cada usuario solo puede escribir lo suyo), URLs de subida firmadas y de corta duración, y
        cabeceras de seguridad estrictas en el navegador. Ningún sistema es infalible: si detectamos
        una brecha que te afecte, te lo notificaremos conforme a ley.
      </p>

      <h2>7. Menores</h2>
      <p>
        {SITE_NAME} no está dirigida a menores de 13 años. Si crees que un menor nos ha proporcionado
        datos, contáctanos para eliminarlos.
      </p>

      <h2>8. Cambios</h2>
      <p>
        Si cambiamos esta política de forma sustancial, lo anunciaremos en la plataforma antes de que
        el cambio entre en vigor.
      </p>
    </article>
  )
}
