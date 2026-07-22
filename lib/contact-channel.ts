import { Mail, MessageCircle, Send, Link as LinkIcon, type LucideIcon } from "lucide-react"

// Resuelve el ÚNICO campo de contacto del hero (antes eran 2: "texto del
// botón" + "enlace" — ver HeroFields en block-inspector.tsx) a un canal
// conocido, con su ícono y el link final ya armado. El botón resultante
// siempre se muestra solo-ícono (ver hero-block.tsx), así que no hace falta
// ningún texto guardado aparte.
export type ContactChannel = "whatsapp" | "telegram" | "email" | "other"

export type ResolvedContact = { channel: ContactChannel; href: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^\+?\d{6,15}$/

export function resolveContactChannel(raw: string): ResolvedContact | null {
  const value = raw.trim()
  if (!value) return null

  // Datos viejos (o alguien pegó una URL/mailto ya armada): se detecta el
  // canal por el propio link y se usa tal cual, sin reconstruirlo.
  if (/^https?:\/\//i.test(value) || value.toLowerCase().startsWith("mailto:")) {
    if (value.toLowerCase().startsWith("mailto:")) return { channel: "email", href: value }
    if (/wa\.me|whatsapp/i.test(value)) return { channel: "whatsapp", href: value }
    if (/t\.me|telegram/i.test(value)) return { channel: "telegram", href: value }
    return { channel: "other", href: value }
  }

  // Usuario de Telegram: convención "@usuario".
  if (value.startsWith("@") && value.length > 1) {
    return { channel: "telegram", href: `https://t.me/${value.slice(1)}` }
  }

  // Correo (con dominio, ej. "tu@correo.com").
  if (EMAIL_RE.test(value)) {
    return { channel: "email", href: `mailto:${value}` }
  }

  // Número de teléfono → WhatsApp (el uso más común para un botón de
  // contacto directo en la plataforma).
  const digits = value.replace(/[\s\-()]/g, "")
  if (PHONE_RE.test(digits)) {
    return { channel: "whatsapp", href: `https://wa.me/${digits.replace(/^\+/, "")}` }
  }

  // Cualquier otra cosa: se usa tal cual como link.
  return { channel: "other", href: value }
}

export const CONTACT_CHANNEL_ICONS: Record<ContactChannel, LucideIcon> = {
  whatsapp: MessageCircle,
  telegram: Send,
  email: Mail,
  other: LinkIcon,
}

export const CONTACT_CHANNEL_LABELS: Record<ContactChannel, string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  email: "Correo",
  other: "Contacto",
}
