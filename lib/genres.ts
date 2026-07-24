// Catálogo de géneros musicales para el selector del editor (SingleFields y
// TracksFields). Cada género tiene una descripción corta que se muestra al
// pasar el cursor por encima en el desplegable. El valor que se guarda en el
// bloque sigue siendo el `label` (un string suelto), así que es compatible con
// todo lo que ya lee `genre` como texto — este archivo solo alimenta la UI de
// búsqueda/selección, no cambia el modelo de datos.

export type MusicGenre = {
  label: string
  description: string
}

// Lista amplia y ordenable por búsqueda. No pretende ser exhaustiva al 100%
// (eso es imposible), pero cubre las familias principales y sus subgéneros más
// buscados; como el selector permite escribir, cualquier variante puntual se
// puede tipear igual.
export const MUSIC_GENRES: MusicGenre[] = [
  // ── Latinoamericano / criollo ──────────────────────────────────────────
  { label: "Salsa", description: "Baile afrocaribeño de raíz cubana y puertorriqueña, con secciones de metales y clave." },
  { label: "Cumbia", description: "Ritmo bailable de origen colombiano, hoy con muchas variantes por todo el continente." },
  { label: "Cumbia peruana", description: "Fusión de cumbia con guitarras eléctricas y huayno, base de la chicha." },
  { label: "Chicha", description: "Cumbia andina peruana con guitarras psicodélicas y órgano." },
  { label: "Vals criollo", description: "Vals peruano de guitarra y cajón, corazón de la música criolla." },
  { label: "Marinera", description: "Baile de cortejo del Perú, con pañuelo, guitarra y cajón." },
  { label: "Festejo", description: "Género afroperuano festivo y percusivo, con cajón y quijada." },
  { label: "Huayno", description: "Música andina tradicional de los Andes, en escala pentatónica." },
  { label: "Bolero", description: "Canción romántica lenta de origen cubano, muy difundida en toda Latinoamérica." },
  { label: "Merengue", description: "Ritmo rápido y bailable de República Dominicana." },
  { label: "Bachata", description: "Balada bailable dominicana de guitarra, de temática romántica." },
  { label: "Vallenato", description: "Música colombiana de acordeón, caja y guacharaca." },
  { label: "Tango", description: "Género rioplatense melancólico, con bandoneón y ritmo marcado." },
  { label: "Ranchera", description: "Canción mexicana tradicional, a menudo con mariachi." },
  { label: "Mariachi", description: "Conjunto y estilo mexicano de trompetas, violines y guitarrón." },
  { label: "Corrido", description: "Balada narrativa mexicana que cuenta historias y hazañas." },
  { label: "Norteño", description: "Música del norte de México con acordeón y bajo sexto." },
  { label: "Banda", description: "Estilo mexicano de conjunto de vientos y percusión." },
  { label: "Bossa nova", description: "Fusión brasileña de samba y jazz, íntima y suave." },
  { label: "Samba", description: "Género brasileño rítmico y percusivo, símbolo del carnaval." },
  { label: "Forró", description: "Música bailable del nordeste brasileño con acordeón y zabumba." },
  { label: "Reggaetón", description: "Género urbano con ritmo dembow, nacido en Puerto Rico y Panamá." },
  { label: "Dembow", description: "Ritmo urbano dominicano rápido y repetitivo." },
  { label: "Latin pop", description: "Pop en español con influencias latinas y producción comercial." },
  { label: "Trap latino", description: "Trap en español, urbano y con autotune, derivado del hip-hop." },

  // ── Pop / rock / alternativo ────────────────────────────────────────────
  { label: "Pop", description: "Música popular pegadiza orientada a un público amplio." },
  { label: "Synth pop", description: "Pop construido sobre sintetizadores, sonido de los 80 en adelante." },
  { label: "Indie pop", description: "Pop de sello independiente, melódico y de producción cuidada." },
  { label: "Rock", description: "Música guitarrera de raíz, con batería y bajo marcados." },
  { label: "Rock alternativo", description: "Rock fuera del mainstream, con estética independiente." },
  { label: "Indie rock", description: "Rock de escena independiente, guitarrero y melódico." },
  { label: "Hard rock", description: "Rock pesado y potente, con guitarras distorsionadas." },
  { label: "Punk", description: "Rock rápido, crudo y de actitud contestataria." },
  { label: "Post-punk", description: "Rock oscuro y anguloso surgido tras el punk." },
  { label: "Grunge", description: "Rock sucio y melancólico originado en Seattle." },
  { label: "Rock en español", description: "Rock cantado en español, con fuerte tradición latinoamericana." },
  { label: "Shoegaze", description: "Rock de guitarras envueltas en reverberación y ruido." },
  { label: "Emo", description: "Rock emocional y confesional, derivado del punk." },

  // ── Metal ───────────────────────────────────────────────────────────────
  { label: "Metal", description: "Rock extremo, pesado y de guitarras muy distorsionadas." },
  { label: "Heavy metal", description: "Metal clásico de riffs potentes y voces épicas." },
  { label: "Thrash metal", description: "Metal rápido y agresivo, de riffs veloces." },
  { label: "Death metal", description: "Metal extremo con voces guturales y ritmos densos." },
  { label: "Black metal", description: "Metal atmosférico y crudo, de estética oscura." },
  { label: "Metalcore", description: "Fusión de metal y hardcore, con breakdowns." },

  // ── Urbano / hip-hop / R&B ──────────────────────────────────────────────
  { label: "Hip-hop", description: "Cultura y música del rap sobre bases rítmicas y sampleos." },
  { label: "Rap", description: "Voz rítmica y rimada sobre un beat." },
  { label: "Trap", description: "Subgénero del hip-hop con hi-hats rápidos y graves 808." },
  { label: "Drill", description: "Trap oscuro y crudo, de origen urbano." },
  { label: "R&B", description: "Rhythm and blues contemporáneo, melódico y sensual." },
  { label: "Soul", description: "Música afroamericana emotiva de raíz gospel." },
  { label: "Funk", description: "Género bailable de groove marcado y bajo protagónico." },
  { label: "Neo soul", description: "Soul moderno con toques de jazz y hip-hop." },

  // ── Electrónica ─────────────────────────────────────────────────────────
  { label: "Electrónica", description: "Música creada con sintetizadores y producción digital." },
  { label: "House", description: "Electrónica bailable de cuatro por cuatro, nacida en Chicago." },
  { label: "Deep house", description: "House más profundo, atmosférico y melódico." },
  { label: "Techno", description: "Electrónica repetitiva e hipnótica de pista de baile." },
  { label: "Trance", description: "Electrónica melódica y envolvente de tempo alto." },
  { label: "Drum and bass", description: "Electrónica rápida de breakbeats y graves profundos." },
  { label: "Dubstep", description: "Electrónica de graves pesados y ritmos sincopados." },
  { label: "EDM", description: "Electrónica comercial de festival, enérgica y directa." },
  { label: "Ambient", description: "Electrónica atmosférica y textural, sin ritmo marcado." },
  { label: "Lo-fi", description: "Beats relajados de estética cruda, ideales para estudiar." },
  { label: "Reggae", description: "Género jamaicano de ritmo relajado y acento en el contratiempo." },
  { label: "Dancehall", description: "Evolución bailable y digital del reggae jamaicano." },
  { label: "Ska", description: "Ritmo jamaicano acelerado, antecesor del reggae, con vientos." },

  // ── Jazz / blues / raíz ─────────────────────────────────────────────────
  { label: "Jazz", description: "Género improvisatorio de raíz afroamericana y armonía rica." },
  { label: "Blues", description: "Música afroamericana melancólica, base de gran parte del pop moderno." },
  { label: "Swing", description: "Jazz bailable de big band de los años 30 y 40." },
  { label: "Bebop", description: "Jazz virtuoso y veloz de pequeños conjuntos." },
  { label: "Gospel", description: "Canto religioso afroamericano, emotivo y coral." },
  { label: "Country", description: "Música rural estadounidense de guitarra y voz narrativa." },
  { label: "Folk", description: "Música tradicional y de cantautor, acústica y de raíz." },
  { label: "Bluegrass", description: "Folk estadounidense veloz de banjo, mandolina y violín." },

  // ── Clásica / instrumental / otros ──────────────────────────────────────
  { label: "Clásica", description: "Música académica de tradición europea, de orquesta y cámara." },
  { label: "Ópera", description: "Drama cantado con orquesta y voces líricas." },
  { label: "Banda sonora", description: "Música compuesta para cine, series o videojuegos." },
  { label: "New age", description: "Música instrumental relajante y contemplativa." },
  { label: "Experimental", description: "Música que rompe convenciones y explora nuevos sonidos." },
  { label: "Instrumental", description: "Piezas sin voz, centradas en los instrumentos." },
  { label: "Afrobeat", description: "Fusión africana de funk, jazz y ritmos yoruba." },
  { label: "K-pop", description: "Pop surcoreano de producción pulida y coreografías." },
  { label: "Disco", description: "Música bailable de los 70, antecesora del house." },
]

// Búsqueda simple, sin acentos ni mayúsculas, sobre label y descripción.
export function filterGenres(query: string): MusicGenre[] {
  const q = normalize(query)
  if (!q) return MUSIC_GENRES
  return MUSIC_GENRES.filter(
    (g) => normalize(g.label).includes(q) || normalize(g.description).includes(q)
  )
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
}
