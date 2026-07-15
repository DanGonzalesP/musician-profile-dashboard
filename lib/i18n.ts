export type Locale = "es" | "en"

type Dict = Record<string, string>

/**
 * Diccionario de los textos FIJOS de la interfaz de la página pública del
 * artista (pestañas, títulos de bloque, textos del modal de apoyo, etc).
 * El contenido que el propio artista escribió (bio, nombres de canciones,
 * descripciones de producto...) nunca pasa por aquí — se muestra tal cual
 * lo escribió, en el idioma en que lo escribió.
 */
export const dictionaries: Record<Locale, Dict> = {
  es: {
    tab_home: "Inicio",
    tab_store: "Merch y Servicios",
    common_close: "Cerrar",

    hero_share: "Compartir perfil",
    hero_social_aria: "Redes sociales",
    hero_artist_name_fallback: "Nombre del Artista",

    discography_title: "Discografía",
    discography_empty: "No hay álbumes publicados todavía.",
    album_untitled: "Álbum sin título",
    album_cover_alt: "Portada del álbum",
    example_badge: "Ejemplo",
    track_untitled: "Nueva Pista",
    track_no_audio: "sin audio",
    track_seek_aria: "Progreso de la canción",
    song_one: "canción",
    song_other: "canciones",

    single_eyebrow: "Lanzamiento Actual",
    single_upcoming_title: "Próximo Lanzamiento",
    single_upcoming_subtitle: "Este artista todavía no subió su single destacado.",
    single_untitled: "Sin título",
    single_play_aria: "Reproducir",
    single_pause_aria: "Pausar",
    single_cover_alt: "Portada del single",

    merch_title: "Merch Oficial",
    merch_empty: "No hay productos disponibles por ahora.",
    merch_sold_out: "Agotado",
    merch_low_stock: "¡Últimas unidades!",
    merch_stock_available: "{count} disponibles",
    merch_new_product: "Nuevo Producto",

    service_title: "Servicios y Ofertas",
    service_empty: "No hay ofertas disponibles por ahora.",
    service_new: "Nuevo Servicio",
    service_price_inquire: "Consultar precio",

    donation_eyebrow: "Campaña de Recaudación",
    donation_title_fallback: "Apoya Mi Música",
    donation_progress_rest: "completado — {currency} {raised} de {currency} {goal}",
    donation_day_one: "Quedan {count} día",
    donation_day_other: "Quedan {count} días",
    donation_last_day: "Último día",
    donation_ended: "Campaña finalizada",
    donation_button_fallback: "Apoyar",

    modal_title: "Apoyar campaña",
    modal_thanks_title: "¡Gracias por tu apoyo simulado!",
    modal_thanks_sub: "La barra de progreso ya se actualizó.",
    modal_intro:
      "Esta es una simulación: todavía no está conectada una pasarela de pago real, pero puedes probar aquí mismo cómo se vería el flujo de apoyo completo.",
    modal_choose_amount: "Elige un monto",
    modal_custom_amount: "O escribe otro monto ({currency})",
    modal_placeholder: "Ej: 15",
    modal_confirm: "Confirmar pago simulado",

    share_dialog_title: "Compartir perfil",
    share_no_image: "Sin imagen",
    share_profile_photo: "Foto de perfil",
    share_cover: "Portada {n}",
    share_qr_image_label: "Imagen dentro del QR",
    share_copied: "¡Copiado!",
    share_copy_link: "Copiar link",
    share_download_qr: "Descargar QR",
    share_artist_name_fallback: "Nombre del artista",
  },
  en: {
    tab_home: "Home",
    tab_store: "Merch & Services",
    common_close: "Close",

    hero_share: "Share profile",
    hero_social_aria: "Social links",
    hero_artist_name_fallback: "Artist Name",

    discography_title: "Discography",
    discography_empty: "No albums published yet.",
    album_untitled: "Untitled album",
    album_cover_alt: "Album cover",
    example_badge: "Example",
    track_untitled: "New Track",
    track_no_audio: "no audio",
    track_seek_aria: "Track progress",
    song_one: "song",
    song_other: "songs",

    single_eyebrow: "Current Release",
    single_upcoming_title: "Upcoming Release",
    single_upcoming_subtitle: "This artist hasn't uploaded their featured single yet.",
    single_untitled: "Untitled",
    single_play_aria: "Play",
    single_pause_aria: "Pause",
    single_cover_alt: "Single cover",

    merch_title: "Official Merch",
    merch_empty: "No products available right now.",
    merch_sold_out: "Sold out",
    merch_low_stock: "Almost gone!",
    merch_stock_available: "{count} available",
    merch_new_product: "New Product",

    service_title: "Services & Offers",
    service_empty: "No offers available right now.",
    service_new: "New Service",
    service_price_inquire: "Contact for pricing",

    donation_eyebrow: "Fundraising Campaign",
    donation_title_fallback: "Support My Music",
    donation_progress_rest: "funded — {currency} {raised} of {currency} {goal}",
    donation_day_one: "{count} day left",
    donation_day_other: "{count} days left",
    donation_last_day: "Last day",
    donation_ended: "Campaign ended",
    donation_button_fallback: "Support",

    modal_title: "Support campaign",
    modal_thanks_title: "Thanks for your simulated support!",
    modal_thanks_sub: "The progress bar has been updated.",
    modal_intro:
      "This is a simulation: a real payment gateway isn't connected yet, but you can try out the full support flow right here.",
    modal_choose_amount: "Choose an amount",
    modal_custom_amount: "Or enter another amount ({currency})",
    modal_placeholder: "E.g. 15",
    modal_confirm: "Confirm simulated payment",

    share_dialog_title: "Share profile",
    share_no_image: "No image",
    share_profile_photo: "Profile photo",
    share_cover: "Cover {n}",
    share_qr_image_label: "Image inside the QR",
    share_copied: "Copied!",
    share_copy_link: "Copy link",
    share_download_qr: "Download QR",
    share_artist_name_fallback: "Artist name",
  },
}

export function translate(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  const template = dictionaries[locale]?.[key] ?? dictionaries.es[key] ?? key
  if (!vars) return template
  return Object.entries(vars).reduce((str, [k, v]) => str.replaceAll(`{${k}}`, String(v)), template)
}
