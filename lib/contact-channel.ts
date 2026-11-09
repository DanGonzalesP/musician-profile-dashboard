import { Mail, MessageCircle, Send, Link as LinkIcon, type LucideIcon } from "lucide-react"
import type { ContactChannel } from "./contact-url"
export { resolveContactChannel, type ContactChannel, type ResolvedContact } from "./contact-url"

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
