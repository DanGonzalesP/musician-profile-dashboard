"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useLocale } from "@/components/locale-provider"
import { LogoMark } from "@/components/logo"
import { LONGITUD_MINIMA_CONTRASENA, validarContrasenaNueva } from "@/lib/recuperar-contrasena"
import { updateOwnPassword } from "@/lib/update-own-password"

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

type Estado = "comprobando" | "listo" | "invalido" | "cambio-sesion"

export default function NuevaContrasenaPage() {
  const { t } = useLocale()
  const router = useRouter()
  const [estado, setEstado] = useState<Estado>("comprobando")
  const [contrasena, setContrasena] = useState("")
  const [confirmacion, setConfirmacion] = useState("")
  const [showPasswords, setShowPasswords] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState("")
  const [listo, setListo] = useState(false)
  const enviando = useRef(false)
  const montado = useRef(false)
  const ownerUserId = useRef<string | null>(null)
  const invalidated = useRef(false)
  const redireccion = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let vivo = true
    let sesionActualizada = false
    montado.current = true
    const acceptIdentity = (id: string | null) => {
      if (invalidated.current) return
      if (ownerUserId.current && ownerUserId.current !== id) {
        invalidated.current = true
        setEstado("cambio-sesion")
        setContrasena("")
        setConfirmacion("")
        setShowPasswords(false)
        setListo(false)
        if (redireccion.current) clearTimeout(redireccion.current)
        return
      }
      if (id) ownerUserId.current = id
      setEstado(id ? "listo" : "invalido")
    }

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
      sesionActualizada = true
      acceptIdentity(evento === "SIGNED_OUT" ? null : sesion?.user.id ?? null)
    })

    supabase.auth.getSession().then(({ data, error: fallo }) => {
      if (!vivo || sesionActualizada) return
      acceptIdentity(!fallo ? data.session?.user.id ?? null : null)
    }).catch(() => {
      if (vivo && !sesionActualizada) setEstado((previo) => previo === "listo" ? previo : "invalido")
    })

    return () => {
      vivo = false
      montado.current = false
      sub.subscription.unsubscribe()
      if (redireccion.current) clearTimeout(redireccion.current)
    }
  }, [])

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    const owner = ownerUserId.current
    if (enviando.current || listo || estado !== "listo" || !owner || invalidated.current) return
    const isCurrent = () => montado.current && !invalidated.current && ownerUserId.current === owner
    setError("")

    const problema = validarContrasenaNueva(contrasena, confirmacion)
    if (problema) {
      setError(t(problema === "corta" ? "auth_new_password_too_short" : "auth_new_password_mismatch"))
      return
    }

    enviando.current = true
    setGuardando(true)
    try {
      await updateOwnPassword(owner, contrasena, isCurrent)
      if (!isCurrent()) return
      setContrasena("")
      setConfirmacion("")
      setShowPasswords(false)
      setListo(true)
      // Se deja ver el mensaje antes de mover al usuario: un salto instantáneo
      // al panel deja la duda de si el cambio se guardó de verdad.
      redireccion.current = setTimeout(() => { if (isCurrent()) router.push("/dashboard") }, 1500)
    } catch {
      if (isCurrent()) setError(t("auth_new_password_error"))
    } finally {
      enviando.current = false
      if (montado.current) setGuardando(false)
    }
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

          {(estado === "invalido" || estado === "cambio-sesion") && (
            <div className="space-y-4">
              <p
                role="alert"
                className="rounded-lg border border-border bg-secondary/40 p-3 text-center text-xs leading-relaxed"
              >
                {t(estado === "cambio-sesion" ? "auth_new_password_session_changed" : "auth_new_password_invalid_link")}
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
              <form onSubmit={guardar} aria-busy={guardando} className="space-y-4">
                <div>
                  <label
                    htmlFor="contrasena-nueva"
                    className="block text-xs font-medium mb-1.5 text-muted-foreground"
                  >
                    {t("auth_new_password_label")}
                  </label>
                  <input
                    id="contrasena-nueva"
                    disabled={guardando}
                    type={showPasswords ? "text" : "password"}
                    minLength={LONGITUD_MINIMA_CONTRASENA}
                    aria-describedby="new-password-hint"
                    required
                    autoComplete="new-password"
                    value={contrasena}
                    onChange={(e) => setContrasena(e.target.value)}
                    placeholder={t("auth_password_placeholder")}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <p id="new-password-hint" className="text-xs text-muted-foreground">{t("auth_new_password_hint")}</p>

                <div>
                  <label
                    htmlFor="contrasena-confirmacion"
                    className="block text-xs font-medium mb-1.5 text-muted-foreground"
                  >
                    {t("auth_new_password_confirm_label")}
                  </label>
                  <input
                    id="contrasena-confirmacion"
                    disabled={guardando}
                    type={showPasswords ? "text" : "password"}
                    minLength={LONGITUD_MINIMA_CONTRASENA}
                    required
                    autoComplete="new-password"
                    value={confirmacion}
                    onChange={(e) => setConfirmacion(e.target.value)}
                    placeholder={t("auth_password_placeholder")}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <button type="button" disabled={guardando} aria-controls="contrasena-nueva contrasena-confirmacion" aria-pressed={showPasswords} onClick={() => setShowPasswords(value => !value)} className="min-h-11 rounded px-2 text-xs underline focus-visible:outline-2 focus-visible:outline-primary">
                  {t(showPasswords ? "auth_new_password_hide" : "auth_new_password_show")}
                </button>

                <button
                  type="submit"
                  disabled={guardando}
                  className="min-h-11 w-full rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
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
