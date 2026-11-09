import { LEGAL_CONTACT_EMAIL, LEGAL_JURISDICTION, SITE_NAME } from "@/lib/site"
import { LEGAL_VERSIONS } from "@/lib/legal-acceptance"

export const metadata = { title: "Política de Privacidad — Vibe" }

export default function PrivacidadPage() {
  return (
    <article className="space-y-6 text-sm leading-relaxed text-foreground/90 [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-foreground [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
      <h1 className="font-display text-3xl font-bold text-foreground">Política de Privacidad</h1>
      <p className="text-xs text-muted-foreground">Versión del {LEGAL_VERSIONS.privacy}</p>
      <p>
        Este borrador describe el tratamiento previsto de datos personales en {SITE_NAME}, para su
        revisión antes del lanzamiento en {LEGAL_JURISDICTION}. Falta identificar al responsable y
        confirmar las bases legales, los plazos y las condiciones aplicables a cada tratamiento.
      </p>

      <h2>1. Datos que recogemos</h2>
      <ul>
        <li><strong>Cuenta:</strong> correo electrónico y credenciales gestionadas mediante Supabase Auth.</li>
        <li><strong>Perfil:</strong> nombre artístico, roles, biografía, colores, fotos, música y todo el contenido que decidas publicar. Tu perfil público es, por definición, visible para cualquiera.</li>
        <li><strong>Actividad:</strong> comentarios, likes y interacciones dentro del feed.</li>
        <li><strong>Técnicos:</strong> información necesaria para operar y proteger el servicio. Las métricas opcionales de Cloudflare se activan únicamente cuando están configuradas y aceptas la analítica.</li>
      </ul>

      <h2>2. Para qué los usamos</h2>
      <ul>
        <li>Operar tu cuenta y mostrar tu perfil público.</li>
        <li>Mostrar tu contenido en el feed y conectar artistas con fans.</li>
        <li>Seguridad: prevenir fraude, abuso y accesos no autorizados.</li>
        <li>Mejorar la plataforma con métricas opcionales cuando las aceptas.</li>
        <li>Atender obligaciones legales, incluidos reclamos de derechos de autor.</li>
      </ul>
      <p>No vendemos tus datos personales ni los usamos para publicidad de terceros.</p>

      <h2>3. Quién procesa los datos por nosotros</h2>
      <ul>
        <li><strong>Supabase</strong> — autenticación y base de datos.</li>
        <li><strong>Cloudflare R2</strong> — almacenamiento de archivos (audio, imágenes, video).</li>
        <li><strong>Cloudflare Workers y Web Analytics</strong> — alojamiento previsto de la aplicación y métricas opcionales sujetas a tu elección.</li>
        <li><strong>Together AI</strong> — solo si usas el generador de imágenes: el texto del prompt se envía para generar la imagen.</li>
      </ul>
      <p>
        Estos proveedores pueden tratar datos fuera de tu país. Antes del lanzamiento deben
        documentarse las ubicaciones, los acuerdos y las garantías aplicables a esas transferencias.
      </p>

      <h2>4. Cuánto tiempo los conservamos</h2>
      <p>
        Los plazos definitivos están pendientes de aprobación. La política final deberá distinguir
        datos de cuenta, archivos, registros de seguridad, reclamos y copias de respaldo, e indicar
        qué ocurre al solicitar la eliminación. No debe interpretarse que todo desaparece de forma
        inmediata al cerrar una cuenta.
      </p>

      <h2>5. Tus derechos</h2>
      <p>
        La versión definitiva detallará cómo solicitar acceso, rectificación, cancelación y oposición
        al tratamiento de tus datos (derechos ARCO), con sus plazos y el responsable de atenderlos.
        El panel incluye herramientas para editar, exportar y solicitar la eliminación de datos.
        Para consultas durante la preparación, escríbenos a{" "}
        <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-primary hover:underline">
          {LEGAL_CONTACT_EMAIL}
        </a>
        . También puedes reclamar ante la Autoridad Nacional de Protección de Datos Personales.
      </p>

      <h2>6. Seguridad</h2>
      <p>
        Para recuperar una subida interrumpida, el navegador puede guardar hasta 100 referencias
        temporales de intentos. No incluyen el archivo, su nombre, contraseñas ni enlaces firmados.
        Dejan de utilizarse después de 24 horas y se limpian en el siguiente uso de esta función;
        la referencia del intento se elimina al confirmar la subida. Puedes eliminarlas borrando
        los datos del sitio en tu navegador. Para recuperar un intento debes volver a seleccionar
        el mismo archivo con la misma cuenta y destino; esto no recupera el borrador del editor.
      </p>
      <p>
        Usamos HTTPS en toda la plataforma, controles de acceso a nivel de fila en la base de datos
        (cada usuario solo puede escribir lo suyo), URLs de subida firmadas y de corta duración, y
        cabeceras de seguridad estrictas en el navegador. Ningún sistema es infalible: si detectamos
        una brecha que te afecte, te lo notificaremos conforme a ley.
      </p>

      <h2>7. Menores</h2>
      <p>
        La participación de menores en {SITE_NAME} está pendiente de definir. Antes de habilitarla
        deben aprobarse las condiciones de edad, las autorizaciones necesarias y las medidas de
        protección, e implementarse los controles correspondientes. Mientras tanto, el registro
        exige declarar que se tienen 18 años o más, y conservamos esa declaración junto con la
        fecha y la versión aceptada de estos documentos. Esa declaración no verifica la edad. Puedes comunicar cualquier preocupación sobre datos de menores al contacto indicado.
      </p>

      <h2>8. Cambios</h2>
      <p>
        Si cambiamos esta política de forma sustancial, lo anunciaremos en la plataforma antes de que
        el cambio entre en vigor.
      </p>
    </article>
  )
}
