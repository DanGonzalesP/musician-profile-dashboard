# Preparación legal — Perú

**Borrador para revisión; no es asesoría ni aprobación profesional.** No acredita formalización ni autoriza lanzamiento, cobros o uso por menores. Al 5 de noviembre de 2026 no hay entidad formalizada ni dominio. No completar con identidades, RUC, domicilio, edad mínima o precios supuestos.

## Ruta de preparación

### Documentos generados por Vibe — corrección de alcance, 2026-11-06

Las pantallas y PDFs ya preparados distinguen borradores de licencias y
constancias de registro interno de huellas. Se retiraron las afirmaciones de
«prueba de autoría», posesión acreditada y exención general de gestión colectiva.
La base recibe el hash calculado/declarado por el cliente: no verifica por sí
sola identidad, derechos ni posesión. La hora de registro no es fecha de creación
ni sellado independiente. Descargar un PDF tampoco acredita firma o aceptación.

El modelo de licencia exige completar alcance, territorio, local y condiciones;
no supone que el artista reúne todos los derechos. Las redescargas usan la
plantilla vigente, no reproducen un documento firmado ni necesariamente el PDF
original. No se modificaron registros históricos. Falta revisión profesional
del modelo, renderizar los PDFs y comprobar textos largos en los gates finales.

Referencia consultada: [Ley sobre el Derecho de Autor en WIPO Lex](https://www.wipo.int/wipolex/en/legislation/details/23888),
ficha de versión 2026, modificada hasta el D. Leg. 1724. La ficha ofrece también
traducciones históricas: no confundirlas con el texto español vigente. Esta
consulta no equivale a dictamen jurídico ni a revisión completa de reformas.

- [ ] **Elegir titular y forma.** Persona natural: definir titular, actividad, domicilio fiscal y responsabilidad patrimonial; tramitar RUC en SUNAT, elegir régimen y obligaciones con contador. Persona jurídica: con abogado/contador definir socios, tipo (p. ej. EIRL/SAC), nombre, objeto, domicilio, capital y representantes; reservar nombre en SUNARP, preparar acto constitutivo, elevar a escritura, inscribir y activar el RUC/Clave SOL. Comparar responsabilidad, administración y costos antes de decidir.
- [ ] **Reunir datos para textos finales:** identidad y contacto del titular/representante; domicilio y datos registrales; servicio y funciones reales; audiencia/edad definida; datos recopilados, finalidades, base/consentimientos, retención, derechos y canal de solicitudes; reglas de cuentas/contenido, licencias y reclamos; cobros/impuestos si se aprueban; proveedores, ubicaciones, transferencias y contacto de privacidad. Dominio y precios quedan pendientes.
- [ ] **Mapa de datos/proveedores:** Supabase (Postgres/Auth), Together AI y Cloudflare (R2, destino previsto). Vercel es origen histórico y su retiro sigue pendiente; verificar si recibe/retiene datos durante migración. Confirmar datos, países, subencargados, contratos y salvaguardas de cada servicio. Evaluar comunicación de flujos transfronterizos e inscripción de bancos aplicables; el registro es gratuito.
- [ ] Preparar controles de seguridad, gestión y notificación de incidentes; revisar supuestos/plazos del Reglamento 016-2024-JUS con especialista.
- [ ] **Menores: política y controles pendientes; no asumir que está habilitado ni que basta el consentimiento.** Arts. 22/25: menos de 14, consentimiento de quien ejerza patria potestad/tutela; de 14 a 17, consentimiento propio en lenguaje comprensible. Verificar razonablemente identidad de quien consiente; proteger interés superior y derechos, y no permitir actividades restringidas por edad. Diseñar comprobación de edad, flujo de consentimiento verificable, privacidad por defecto, moderación/reportes y respuesta ante riesgos; someter alcance y edad a abogado antes de habilitar.
- [ ] Auditar música, imágenes y otros contenidos/licencias conforme al D. Leg. 822. No publicar términos definitivos hasta completar decisiones y revisión de abogado peruano y contador.

## Nombre y dominio — decisión del titular

El titular prefiere **Vibe** y rechazó las propuestas de dominio anteriores.
Vibe se conserva como nombre provisional; no hay dominio elegido ni autorización
de compra. La consulta RDAP de Verisign del 2026-11-05, 23:56 UTC devolvió 404
para `vibemusicprofile.com`, `joinvibemusic.com`, `vibemusicperu.com` y
`somosvibemusic.com`: sólo indica ausencia de registro en esa consulta, no
viabilidad de marca ni disponibilidad garantizada al contratar.

Antes de fijar dominio: delimitar servicios reales, buscar Vibe y variantes
fonéticas en registros/solicitudes de Indecopi, revisar antecedentes cercanos
con un especialista y decidir nombre. Incluir mercados de expansión previstos;
la protección de marca es territorial. Añadir “Music”, “Perú” o un logotipo no
se considera solución automática a un conflicto. Tras un filtro favorable,
coordinar solicitud de marca y dominio con autorización expresa de gasto.
No se ha realizado todavía una búsqueda registral completa de Vibe.

### Primera consulta oficial — 6 de noviembre de 2026

Consulta manual en [Busca tu marca de Indecopi](https://pi.indecopi.gob.pe/buscatumarca/):
denominación `VIBE`, estado «Vigente», clases 9, 41 y 42. La interfaz devolvió
200 resultados, incluyendo términos similares; no son 200 marcas idénticas.
Se revisaron estos antecedentes y sus botones Producto/Servicio:

| Denominación | Identificador mostrado | Clase | Alcance mostrado, resumido |
| --- | --- | --- | --- |
| VIBE | T00015621; vigencia 2026-12-16 | 9 | Dispositivos electrónicos usables e inteligentes; titular Lenovo (Singapore) Pte. Ltd. |
| VIBE | Expediente 7630-2026; sin fecha de vigencia mostrada | 42 | Ingeniería, diseño fotovoltaico, consultoría sobre energías renovables y eficiencia energética. |
| VIBE ROMPE EL ALGORITMO | Expediente 67919-2025; sin fecha de vigencia mostrada | 41 | Entretenimiento, periodismo y programas en televisión, radio y streaming sobre política, economía y actualidad. |

La presencia bajo el filtro «Vigente» no demuestra que un expediente sea un
registro concedido. No se consultó aún su resolución ni todo el listado, otras
clases o la Gaceta. Los identificadores permiten repetir y ampliar la consulta;
los resultados pueden cambiar. No guardar datos personales de titulares en el
repositorio.

**Consecuencia práctica:** ya existen antecedentes concretos para evaluar;
no afirmar que Vibe está libre ni descartarlo automáticamente por compartir
palabra o clase. Los servicios de ingeniería del expediente 7630-2026 difieren
de la plataforma prevista, pero esa observación no determina compatibilidad
jurídica. Mantener el nombre provisional y llevar estos antecedentes, el alcance
real de Vibe y la búsqueda completa a evaluación antes de gastar en marca,
dominio o lanzamiento. No se compró ni se presentó ninguna solicitud.

Estrategia propuesta, sin compras ni solicitudes presentadas:

1. Mantener **Vibe** provisionalmente durante el desarrollo. Definir los servicios
   que realmente se ofrecerán: descubrimiento y escucha, publicación de artistas,
   comunidad y catálogo. Clasificarlos para la búsqueda, sin asumir que una sola
   clase o una coincidencia exacta resuelve todo el análisis.
2. Consultar antecedentes denominativos y fonéticos, tanto registrados como en
   trámite, y revisar su estado, titular, servicios y similitud con el proyecto.
   Guardar resultados fechados para la evaluación profesional.
   Usar también el [análisis de viabilidad de Indecopi](https://www.gob.pe/institucion/indecopi/campa%C3%B1as/6164-protege-tu-sueno-registra-tu-marca)
   antes de decidir una inversión en el nombre; no equivale a concesión del registro.
3. Si el riesgo inicial es aceptable, elegir un dominio a precio normal y
   coordinar su reserva con la presentación de marca. No es necesario proponer
   esperar a la concesión definitiva para toda reserva de dominio, pero una
   búsqueda favorable no garantiza concesión ni evita oposiciones. Evitar ahora
   dominios premium, compras múltiples y gasto de lanzamiento ligado al nombre.
4. Si aparece un conflicto relevante, valorar un nombre distintivo alternativo
   antes de invertir. No asumir que añadir una palabra genérica o cambiar la
   extensión del dominio resuelve el conflicto. La preferencia por Vibe se
   mantiene hasta que haya evidencia que aconseje una decisión distinta.

La constitución de una empresa, el registro de marca y la contratación del dominio
son trámites distintos. La hoja de formalización no acredita derechos sobre Vibe.

Referencias: [antecedentes en Indecopi](https://www.gob.pe/328-buscar-antecedentes-de-una-marca),
[protección territorial y distintividad, OMPI](https://www.wipo.int/en/web/trademarks/protection),
[dominio y marca, Comisión Europea](https://intellectual-property-helpdesk.ec.europa.eu/regional-ip-helpdesks/european-ip-helpdesk/europe-frequently-asked-questions_en).

## Fuentes oficiales de formalización y datos

### Guarda provisional de edad y constancia — 9 de noviembre de 2026

Implementado y probado localmente (no es decisión legal final): el registro exige
aceptar Términos/Privacidad **y** declarar 18 años o más; la base (`0071`) guarda
una sola vez, al crearse la cuenta, versión de ambos documentos, la declaración y
la fecha en `private.legal_acceptances`, y rechaza crear perfiles a cuentas nuevas
sin esa constancia. Editar metadatos después no fabrica constancia. Términos y
Privacidad muestran su versión (`lib/legal-acceptance.ts`). La declaración no
verifica la edad. Cuentas anteriores a `0071` quedan exentas hasta un flujo de
reaceptación. La exportación de datos incluye las constancias.

Para habilitar menores hace falta decidir (titular + abogado): edad mínima; para
menores de 14, cómo se verifica razonablemente a quien ejerce la patria potestad
y cómo consiente; para 14–17, texto comprensible; funciones restringidas (ventas,
mensajes, visibilidad pública por defecto, contacto con adultos); retención de
constancias. Con esa decisión se añade un nuevo valor de `age_assurance` y su flujo
en una migración nueva; hasta entonces sigue cerrado.

### Estado de los textos visibles — 6 de noviembre de 2026

El centro legal muestra un aviso de borrador antes de sus documentos. Términos y
privacidad ya no fijan una edad de 13 años ni afirman propiedad de una marca Vibe
registrada. Privacidad distingue métricas opcionales Cloudflare, sustituye la
referencia antigua a Vercel y deja pendientes las bases legales, retención y
garantías contractuales no verificadas. El contacto provisional usa la cuenta del
proyecto, no el correo personal anterior. Esto no constituye revisión jurídica ni
habilita el lanzamiento con menores: registro y controles de edad siguen pendientes.
No se ejecutaron pruebas; revisión visual y accesibilidad quedan para la etapa final.

- [Reglamento 016-2024-JUS (ANPD)](https://www.gob.pe/institucion/anpd/normas-legales/6554453-n-016-2024-jus), arts. 22 y 25; [texto oficial](https://cdn.www.gob.pe/uploads/document/file/7568330/6426760-decreto-supremo-n-016-2024-jus-reglamento-de-la-ley-n-29733-ley-de-proteccion-de-datos-personales-publicado-nov-2024.pdf).
- [Registro de bancos (gratuito)](https://www.gob.pe/institucion/minjus/noticias/1187359-minjusdh-implementa-plataforma-para-agilizar-la-inscripcion-de-bancos-de-datos-personales-proteger-a-los-ciudadanos-y-reducir-tramites); [flujo transfronterizo](https://www.gob.pe/9253-inscribir-flujo-transfronterizo-de-datos-personales).
- [Formalización como persona natural o jurídica](https://www.gob.pe/es/252-abrir-un-negocio-en-peru); [RUC persona natural](https://www.gob.pe/institucion/sunat/pages/284-sacar-ruc-persona-natural); [constitución SID-SUNARP](https://www.gob.pe/10580-constituir-tu-empresa-a-traves-de-la-plataforma-sistema-de-intermediacion-digital-sid-sunarp).
- [D. Leg. 822 (PCM)](https://www.gob.pe/institucion/pcm/normas-legales/1670023-822); [texto legal](https://www.bnp.gob.pe/documents/marcolegal/dec_leg822.pdf).
