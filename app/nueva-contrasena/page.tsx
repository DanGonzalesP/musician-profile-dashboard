"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useLocale } from "@/components/locale-provider"
import { LogoMark } from "@/components/logo"
import { validarContrasenaNueva } from "@/lib/recuperar-contrasena"

// Paso 2 de la recuperación: elegir la contraseña nueva.
//
// ─── POR QUÉ ESTA RUTA NO ESTÁ PROTEGIDA ──────────────────────────────────
// Y no puede estarlo. Supabase manda el token de recuperación en el FRAGMENTO
// de la URL (`#access_token=…`), y el fragmento **nunca se envía al servidor**:
// `proxy.ts` no lo ve. Si `/nueva-contrasena` estuviera en `RUTAS_PROTEGIDAS`,
// el middleware rebotaría a /login antes de que el navegador pudiera canjear
// el token, y el enlace del correo no funcionaría jamás. La barrera aquí no es
// el middleware: es tener el token, que sólo llega al correo del dueño.
//
// ─── LOS TRES ESTADOS ─────────────────────────────────────────────────────
// "comprobando" → "listo" (hay sesión de recuperación) | "invalido" (no la hay).
//
// El estado inicial NO es "inválido". Canjear el token es asíncrono, así que
// pintar el error de entrada haría que todo enlace legítimo mostrara "este
// enlace ya no sirve" durante un instante antes de corregirse: el usuario ya
// se fue. Se espera, y sólo se concluye que no sirve cuando de verdad no hay
// sesión.

type Estado = "comprobando" | "listo" | "invalido"

export default function NuevaContrasenaPage() {
  const { t } = useLocale()
  const router = useRouter()
  const [estado, setEstado] = useState<Estado>("comprobando")
  const [contrasena, setContrasena] = useState("")
  const [confirmacion, setConfirmacion] = useState("")
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState("")
  const [listo, setListo] = useState(false)

  useEffect(() => {
    let vivo = true

    // Dos caminos hacia el mismo sitio, porque hay una carrera real: el
    // cliente de Supabase canjea el token del fragmento al arrancar, y eso
    // puede terminar ANTES o DESPUÉS de que este efecto se suscriba.
    //
    //   • Si termina antes, `getSession()` ya devuelve la sesión.
    //   • Si termina después, llega el evento PASSWORD_RECOVERY.
    //
    // Cubrir sólo uno de los dos deja un fallo intermitente que depende de la
    // velocidad de la máquina, que es la peor clase de fallo.
    const { data: sub } = supabase.auth.onAuthStateChange((evento, sesion) => {
      if (!vivo) return
      if (evento === "PASSWORD_RECOVERY" || sesion) setEstado("listo")
    })

    supabase.auth.getSession().then(({ data }) => {
      if (!vivo) return
      setEstado((previo) => (previo === "listo" ? previo : data.session ? "listo" : "invalido"))
    })

    return () => {
      vivo = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    const problema = validarContrasenaNueva(contrasena, confirmacion)
    if (problema) {
      setError(t(problema === "corta" ? "auth_new_password_too_short" : "auth_new_password_mismatch"))
      return
    }

    setGuardando(true)
    const { error: fallo } = await supabase.auth.updateUser({ password: contrasena })
    if (fallo) {
      setError(t("auth_new_password_error"))
      setGuardando(false)
      return
    }

    setListo(true)
    // Se deja ver el mensaje antes de mover al usuario: un salto instantáneo
    // al panel deja la duda de si el cambio se guardó de verdad.
    setTimeout(() => router.push("/dashboard"), 1500)
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="w-full rounded-2xl border border-border bg-card p-6 shadow-xl space-y-6">
          <header className="text-center">
            <LogoMark className="mx-auto mb-2 size-10" />
            <h1 className="text-xl font-bold">{t("auth_new_password_title")}</h1>
            {estado === "listo" && !listo && (
              <p className="text-xs text-muted-foreground mt-1">{t("auth_new_password_subtitle")}</p>
            )}
          </header>

          {estado === "comprobando" && (
            <p role="status" className="text-center text-xs text-muted-foreground">
              {t("auth_new_password_checking")}
            </p>
          )}

          {estado === "invalido" && (
            <div className="space-y-4">
              <p
                role="alert"
                className="rounded-lg border border-border bg-secondary/40 p-3 text-center text-xs leading-relaxed"
              >
                {t("auth_new_password_invalid_link")}
              </p>
              <Link
                href="/recuperar"
                className="block w-full rounded-lg bg-primary py-2 text-center text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                {t("auth_new_password_request_another")}
              </Link>
            </div>
          )}

          {estado === "listo" &&
            (listo ? (
              <p
                role="status"
                className="rounded-lg border border-border bg-secondary/40 p-3 text-center text-xs font-semibold text-emerald-500"
              >
                {t("auth_new_password_done")}
              </p>
            ) : (
              <form onSubmit={guardar} className="space-y-4">
                <div>
                  <label
                    htmlFor="contrasena-nueva"
                    className="block text-xs font-medium mb-1.5 text-muted-foreground"
                  >
                    {t("auth_new_password_label")}
                  </label>
                  <input
                    id="contrasena-nueva"
                    type="password"
                    required
                    autoComplete="new-password"
                    value={contrasena}
                    onChange={(e) => setContrasena(e.target.value)}
                    placeholder={t("auth_password_placeholder")}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div>
                  <label
                    htmlFor="contrasena-confirmacion"
                    className="block text-xs font-medium mb-1.5 text-muted-foreground"
                  >
                    {t("auth_new_password_confirm_label")}
                  </label>
                  <input
                    id="contrasena-confirmacion"
                    type="password"
                    required
                    autoComplete="new-password"
                    value={confirmacion}
                    onChange={(e) => setConfirmacion(e.target.value)}
                    placeholder={t("auth_password_placeholder")}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <button
                  type="submit"
                  disabled={guardando}
                  className="w-full rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {guardando ? t("auth_new_password_saving") : t("auth_new_password_submit")}
                </button>

                {error && (
                  <p role="alert" className="text-center text-xs font-semibold text-destructive">
                    {error}
                  </p>
                )}
              </form>
            ))}
        </div>
      </div>
    </div>
  )
}
