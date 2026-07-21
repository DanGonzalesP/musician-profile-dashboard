import { LEGAL_CONTACT_EMAIL, LEGAL_JURISDICTION, SITE_NAME } from "@/lib/site"

export const metadata = { title: "Términos y Condiciones — Vibe" }

export default function TerminosPage() {
  return (
    <article className="space-y-6 text-sm leading-relaxed text-foreground/90 [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-foreground [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-foreground [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
      <h1 className="font-display text-3xl font-bold text-foreground">Términos y Condiciones</h1>
      <p>
        Bienvenido a {SITE_NAME}. Estos Términos regulan el uso de la plataforma (el sitio web, el
        editor de perfiles, el feed, la tienda y todos los servicios asociados). Al crear una cuenta
        o usar {SITE_NAME}, aceptas estos Términos. Si no estás de acuerdo, no uses la plataforma.
      </p>

      <h2>1. Qué es {SITE_NAME}</h2>
      <p>
        {SITE_NAME} es una plataforma para que músicos de cualquier rubro (autores, compositores,
        arreglistas, directores, productores, ingenieros de mezcla, intérpretes y grupos) publiquen
        su música, su trayectoria y sus publicaciones, vendan productos y ofrezcan servicios, y para
        que cualquier persona descubra ese contenido.
      </p>

      <h2>2. Tu cuenta</h2>
      <ul>
        <li>Debes tener al menos 13 años (o la edad mínima legal en tu país) para crear una cuenta. Para vender productos o servicios debes tener capacidad legal para contratar.</li>
        <li>Eres responsable de mantener la confidencialidad de tu contraseña y de toda la actividad que ocurra en tu cuenta.</li>
        <li>La información de tu perfil debe ser veraz. No puedes hacerte pasar por otra persona, artista o agrupación.</li>
        <li>Los perfiles de grupo musical son gestionados por su creador y por los integrantes que él invite; el creador responde por la página del grupo.</li>
      </ul>

      <h2>3. Tu contenido y tus derechos</h2>
      <p>
        Todo lo que subas (música, letras, fotos, videos, textos, portadas) sigue siendo tuyo.{" "}
        {SITE_NAME} no reclama la propiedad de tu obra.
      </p>
      <ul>
        <li>
          <strong>Licencia limitada a la plataforma:</strong> al publicar contenido nos otorgas una
          licencia mundial, no exclusiva, gratuita y revocable para alojarlo, reproducirlo,
          transformarlo técnicamente (compresión, miniaturas, transcodificación) y mostrarlo dentro
          de {SITE_NAME}, con el único fin de operar el servicio. Esta licencia termina cuando
          eliminas el contenido o tu cuenta, salvo copias técnicas temporales.
        </li>
        <li>
          <strong>Declaración de titularidad:</strong> declaras que el contenido que subes es de tu
          autoría o que cuentas con todas las licencias y autorizaciones necesarias (incluidas las de
          coautores, intérpretes, productores fonográficos y sellos) para publicarlo.
        </li>
        <li>
          <strong>Colaboraciones y créditos:</strong> los créditos internos requieren aprobación del
          dueño de la canción. Acreditar falsamente una participación puede llevar al retiro del
          crédito y a la suspensión de la cuenta.
        </li>
      </ul>

      <h2>4. Tienda, servicios y pagos</h2>
      <ul>
        <li>
          {SITE_NAME} funciona como una <strong>vitrina</strong>: los artistas publican productos y
          servicios con sus precios y enlaces de compra o reserva externos. Salvo que se indique lo
          contrario, {SITE_NAME} <strong>no procesa pagos, no interviene en la transacción y no es
          parte del contrato</strong> entre artista y comprador.
        </li>
        <li>El artista es el único responsable de la veracidad de sus ofertas, del cumplimiento de las entregas, de las garantías, devoluciones y de sus obligaciones tributarias.</li>
        <li>Las campañas de apoyo y metas de financiamiento muestran montos referenciales declarados por el artista; verifica siempre las condiciones antes de aportar por canales externos.</li>
        <li>Está prohibido ofrecer productos o servicios ilegales, falsificados o que infrinjan derechos de terceros.</li>
      </ul>

      <h2>5. Conducta prohibida</h2>
      <ul>
        <li>Subir contenido que infrinja derechos de autor, marcas u otros derechos (ver la Política de Derechos de Autor).</li>
        <li>Publicar contenido ilegal, difamatorio, de odio, o que sexualice a menores (tolerancia cero, se reporta a las autoridades).</li>
        <li>Spam, manipulación de métricas, scraping masivo, ingeniería inversa o intentos de vulnerar la seguridad de la plataforma.</li>
        <li>Usar la plataforma para suplantar identidades o para estafas.</li>
      </ul>

      <h2>6. Retiro de contenido y terminación</h2>
      <p>
        Podemos retirar contenido o suspender cuentas que infrinjan estos Términos, las Normas de
        Comunidad o la ley, con o sin aviso previo según la gravedad. Tú puedes eliminar tu contenido
        o tu cuenta cuando quieras. Aplicamos una política de infractores reincidentes en materia de
        derechos de autor.
      </p>

      <h2>7. Propiedad de la plataforma</h2>
      <p>
        El software, el diseño, el logotipo y la marca {SITE_NAME} son de nuestra propiedad o de
        nuestros licenciantes. Estos Términos no te otorgan ningún derecho sobre ellos.
      </p>

      <h2>8. Descargo de responsabilidad</h2>
      <p>
        La plataforma se ofrece “tal cual” y “según disponibilidad”. En la medida máxima permitida
        por la ley, no garantizamos disponibilidad ininterrumpida ni ausencia de errores, y no
        respondemos por pérdidas derivadas de transacciones entre usuarios, contenido de terceros o
        causas fuera de nuestro control razonable.
      </p>

      <h2>9. Cambios a estos Términos</h2>
      <p>
        Podemos actualizar estos Términos. Si el cambio es sustancial, lo anunciaremos en la
        plataforma con anticipación razonable. Seguir usando {SITE_NAME} después de la actualización
        implica tu aceptación.
      </p>

      <h2>10. Ley aplicable y contacto</h2>
      <p>
        Estos Términos se rigen por las leyes de la {LEGAL_JURISDICTION}, sin perjuicio de las
        protecciones de consumidor que te correspondan en tu país de residencia. Consultas:{" "}
        <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-primary hover:underline">
          {LEGAL_CONTACT_EMAIL}
        </a>
        .
      </p>
    </article>
  )
}
