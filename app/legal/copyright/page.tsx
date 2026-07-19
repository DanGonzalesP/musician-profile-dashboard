import { LEGAL_CONTACT_EMAIL, SITE_NAME } from "@/lib/site"

export const metadata = { title: "Política de Derechos de Autor — vibra" }

export default function CopyrightPage() {
  return (
    <article className="space-y-6 text-sm leading-relaxed text-foreground/90 [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-foreground [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-5">
      <h1 className="font-display text-3xl font-bold text-foreground">Política de Derechos de Autor</h1>
      <p>
        {SITE_NAME} es una plataforma hecha por y para músicos: la protección de la obra ajena es
        parte del núcleo del producto. Esta política explica qué puedes subir, cómo reclamar si
        alguien usa tu obra sin permiso y qué pasa con quien infringe repetidamente.
      </p>

      <h2>1. Qué puedes subir</h2>
      <ul>
        <li>Obras de tu autoría (composición y/o grabación) o sobre las que tengas licencia expresa.</li>
        <li>
          En obras con coautores, intérpretes, productores o sello: necesitas la autorización de
          todos los titulares involucrados antes de publicar.
        </li>
        <li>
          <strong>Covers y remixes:</strong> normalmente requieren licencia del titular de la obra
          original. Subirlos sin autorización puede derivar en retiro y en responsabilidad legal
          tuya.
        </li>
        <li>Los embeds de YouTube/TikTok se reproducen desde la plataforma de origen y siguen sus propias reglas de licencia.</li>
      </ul>

      <h2>2. Herramientas de protección de {SITE_NAME}</h2>
      <ul>
        <li>
          <strong>Certificados de autoría con marcado de tiempo:</strong> al subir una pista, la
          plataforma calcula su huella digital (SHA-256) y registra la fecha — evidencia útil de que
          esa grabación estaba en tu poder en esa fecha. No sustituye el registro oficial de tu obra
          (en Perú, ante INDECOPI), pero lo complementa.
        </li>
        <li>
          <strong>Licencias:</strong> desde Herramientas Legales puedes emitir licencias de uso de
          tus canciones en PDF, con alcance y condiciones definidos por ti.
        </li>
        <li>
          <strong>Créditos verificados:</strong> los créditos internos de colaboración requieren la
          aprobación del dueño de la canción antes de publicarse.
        </li>
      </ul>

      <h2>3. Cómo reportar una infracción (notificación de retiro)</h2>
      <p>
        Si eres titular de derechos (o su representante) y crees que un contenido en {SITE_NAME}
        infringe tu obra, envía un correo a{" "}
        <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-primary hover:underline">
          {LEGAL_CONTACT_EMAIL}
        </a>{" "}
        con el asunto “Reclamo de derechos de autor” incluyendo:
      </p>
      <ol>
        <li>Identificación de la obra protegida (título, registro si existe, enlaces de referencia).</li>
        <li>La URL exacta del contenido infractor dentro de {SITE_NAME}.</li>
        <li>Tus datos de contacto y tu relación con la obra (autor, titular, representante).</li>
        <li>
          Una declaración de buena fe de que el uso no está autorizado, y de que la información del
          reclamo es veraz, bajo tu responsabilidad.
        </li>
        <li>Tu firma (física o digital).</li>
      </ol>
      <p>
        Al recibir un reclamo completo, retiraremos o bloquearemos el contenido señalado con
        prontitud y notificaremos al usuario que lo subió.
      </p>

      <h2>4. Contranotificación</h2>
      <p>
        Si tu contenido fue retirado por error (tienes los derechos o una licencia válida), puedes
        responder a la notificación con evidencia: tu identificación, el contenido retirado, y una
        declaración de buena fe de que hubo error. Evaluaremos la contranotificación y, si procede,
        restauraremos el contenido informando al reclamante. Los conflictos que no podamos resolver
        corresponden a las autoridades competentes.
      </p>

      <h2>5. Infractores reincidentes</h2>
      <p>
        Llevamos registro de los reclamos procedentes. Las cuentas con infracciones repetidas serán
        suspendidas o eliminadas definitivamente. Los reclamos falsos o de mala fe también pueden
        acarrear la suspensión del reclamante.
      </p>

      <h2>6. Sociedades de gestión y registro oficial</h2>
      <p>
        Publicar en {SITE_NAME} no interfiere con tus registros ante sociedades de gestión colectiva
        (APDAYC, UNIMPRO, etc.) ni con el registro de obra ante INDECOPI — te recomendamos mantener
        ambos al día: son tu mejor protección formal.
      </p>
    </article>
  )
}
