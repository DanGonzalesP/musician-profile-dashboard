"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useLocale } from "@/components/locale-provider"
import { LogoMark } from "@/components/logo"
import { urlDeRetornoDeRecuperacion } from "@/lib/recuperar-contrasena"

// Paso 1 de la recuperación: pedir el enlace.
//
// ─── LA PROPIEDAD QUE DEFINE ESTA PÁGINA ──────────────────────────────────
//
// La respuesta es SIEMPRE la misma, exista la cuenta o no. No hay una rama de
// éxito y otra de error, y no es descuido: si el mensaje cambiara según el
// resultado, este formulario sería un oráculo público para averiguar qué
// correos tienen cuenta en Vibe. Eso tiene valor real para quien prepare
// phishing dirigido contra artistas concretos —"tu perfil de Vibe fue
// reportado, entra aquí"— y para quien quiera cruzar una lista de correos
// filtrada de otro sitio contra esta plataforma.
//
// Por eso `enviado` se pone a `true` ANTES de mirar el resultado de Supabase.
// Un error real (Supabase caído, límite de correos alcanzado) se registra en
// la consola para poder diagnosticarlo, pero al visitante se le dice lo mismo.
// Es un intercambio consciente: se pierde algo de claridad cuando el fallo es
// nuestro, a cambio de no publicar quién está registrado.

export default function RecuperarPage() {
  const { t } = useLocale()
  const [email, setEmail] = useState("")
  const [cargando, setCargando] = useState(false)
  const [enviado, setEnviado] = useState(false)

  const solicitar = async (e: React.FormEvent) => {
    e.preventDefault()
    setCargando(true)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: urlDeRetornoDeRecuperacion(),
    })

    // Ver el comentario de arriba: el resultado NO cambia lo que se muestra.
    if (error) {
      console.error("No se pudo enviar el correo de recuperación:", error.message)
    }

    setEnviado(true)
    setCargando(false)
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          {t("auth_recovery_back_to_login")}
        </Link>

        <div className="w-full rounded-2xl border border-border bg-card p-6 shadow-xl space-y-6">
          <header className="text-center">
            <LogoMark className="mx-auto mb-2 size-10" />
            <h1 className="text-xl font-bold">{t("auth_recovery_title")}</h1>
            {!enviado && (
              <p className="text-xs text-muted-foreground mt-1">{t("auth_recovery_subtitle")}</p>
            )}
          </header>

          {enviado ? (
            // `role="status"` para que un lector de pantalla anuncie el cambio:
            // el formulario desaparece y sin esto el usuario no oiría nada.
            <div className="space-y-4">
              <p
                role="status"
                className="rounded-lg border border-border bg-secondary/40 p-3 text-center text-xs leading-relaxed text-foreground"
              >
                {t("auth_recovery_sent")}
              </p>
              <Link
                href="/login"
                className="block w-full rounded-lg border border-border py-2 text-center text-sm font-semibold transition-colors hover:bg-secondary"
              >
                {t("auth_recovery_back_to_login")}
              </Link>
            </div>
          ) : (
            <form onSubmit={solicitar} className="space-y-4">
              <div>
                <label
                  htmlFor="recuperar-email"
                  className="block text-xs font-medium mb-1.5 text-muted-foreground"
                >
                  {t("auth_email_label")}
                </label>
                <input
                  id="recuperar-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("auth_email_placeholder")}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <button
                type="submit"
                disabled={cargando}
                className="w-full rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {cargando ? t("auth_recovery_sending") : t("auth_recovery_submit")}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
