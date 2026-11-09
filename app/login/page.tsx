"use client";

import { Suspense, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ensureOwnProfile } from "@/lib/ensure-profile";
import { legalDeclaration } from "@/lib/legal-acceptance";
import { useLocale } from "@/components/locale-provider";
import { LogoMark } from "@/components/logo";
import { SITE_URL } from "@/lib/site";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const { t } = useLocale();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const sending = useRef(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMensaje, setErrorMensaje] = useState("");
  const [exitoMensaje, setExitoMensaje] = useState("");
  const [perfilPendiente, setPerfilPendiente] = useState(false);
  const searchParams = useSearchParams();
  const [isRegistering, setIsRegistering] = useState(searchParams.get("modo") === "registro");
  // El middleware manda acá con ?redirect=<ruta> cuando alguien intenta
  // entrar a una página protegida sin sesión. Se valida que sea una ruta
  // interna: un redirect abierto permitiría mandar al usuario a un dominio
  // ajeno tras iniciar sesión (phishing con la marca de Vibe).
  const redirectParam = searchParams.get("redirect");
  const destino =
    redirectParam && redirectParam.startsWith("/") && !redirectParam.startsWith("//") && !/[\\\u0000-\u0020]/.test(redirectParam)
      ? redirectParam
      : "/dashboard";
  const [aceptaTerminos, setAceptaTerminos] = useState(false);
  const [declaraMayoria, setDeclaraMayoria] = useState(false);
  const router = useRouter();

  const completarAcceso = async () => {
    setPerfilPendiente(true);
    setPassword("");
    setShowPassword(false);
    // Reconsultar la identidad: el reintento no repite el alta ni conserva
    // credenciales o un usuario de una sesión anterior.
    const { data, error } = await supabase.auth.getUser();
    if (error) throw new Error("auth");
    if (!data.user) {
      setPerfilPendiente(false);
      setIsRegistering(false);
      setErrorMensaje(t("auth_error_connection"));
      return;
    }
    const perfil = await ensureOwnProfile(data.user);
    if (!perfil) {
      setErrorMensaje(t("auth_profile_pending"));
      return;
    }
    router.push(destino);
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    const declaracion = legalDeclaration(aceptaTerminos, declaraMayoria);
    if (!perfilPendiente && isRegistering && !aceptaTerminos) {
      setErrorMensaje("Debes aceptar los Términos y la Política de Privacidad para crear tu cuenta.");
      return;
    }
    if (!perfilPendiente && isRegistering && !declaracion) {
      setErrorMensaje("Por ahora Vibe sólo admite cuentas de personas mayores de edad. Confirma que tienes 18 años o más.");
      return;
    }
    if (sending.current) return;
    sending.current = true;
    setLoading(true);
    setErrorMensaje("");
    setExitoMensaje("");
    try {
      if (perfilPendiente) {
        await completarAcceso();
        return;
      }
      if (isRegistering) {
        // La base guarda esta declaración una sola vez como constancia (0071).
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: {
          emailRedirectTo: `${SITE_URL.replace(/\/$/, "")}/login`,
          data: { vibe_legal: declaracion },
        } });
        if (error) {
          setErrorMensaje(t("auth_error_generic"));
          return;
        }
        if (data.session && data.user) {
          await completarAcceso();
        } else {
          setExitoMensaje(t("auth_success_check_email"));
          setIsRegistering(false);
          setPassword("");
          setShowPassword(false);
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) {
          setErrorMensaje(t("auth_error_invalid_credentials"));
          return;
        }
        if (!data.user || !data.session) {
          setErrorMensaje(t("auth_error_connection"));
          return;
        }
        await completarAcceso();
      }
    } catch {
      setErrorMensaje(t("auth_error_connection"));
    } finally {
      sending.current = false;
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          {t("auth_back_to_feed")}
        </Link>

        <div className="w-full rounded-2xl border border-border bg-card p-6 shadow-xl space-y-6">
          <header className="text-center">
            <LogoMark className="mx-auto mb-2 size-10" />
            <h1 className="text-xl font-bold">
              {isRegistering ? t("auth_register_title") : t("auth_login_title")}
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              {isRegistering ? t("auth_register_subtitle") : t("auth_login_subtitle")}
            </p>
          </header>

          <form onSubmit={handleAuth} aria-busy={loading} className="space-y-4">
            {perfilPendiente ? (
              <div className="space-y-4">
                <p role="status" className="text-sm text-muted-foreground">{t("auth_profile_pending")}</p>
                <button type="submit" disabled={loading} className="w-full min-h-11 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                  {loading ? t("auth_submit_processing") : t("auth_profile_retry")}
                </button>
              </div>
            ) : <>
            <div>
              <label htmlFor="auth-email" className="block text-xs font-medium mb-1.5 text-muted-foreground">
                {t("auth_email_label")}
              </label>
              <input
                id="auth-email"
                name="email"
                autoComplete="email"
                disabled={loading}
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("auth_email_placeholder")}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label htmlFor="auth-password" className="block text-xs font-medium mb-1.5 text-muted-foreground">
                {t("auth_password_label")}
              </label>
              <input
                id="auth-password"
                name="password"
                autoComplete={isRegistering ? "new-password" : "current-password"}
                disabled={loading}
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("auth_password_placeholder")}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
              />
              <button type="button" disabled={loading} aria-controls="auth-password" aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)} className="mt-1 min-h-11 rounded px-2 text-xs text-foreground underline focus-visible:outline-2 focus-visible:outline-primary">
                {showPassword ? t("auth_hide_password") : t("auth_show_password")}
              </button>
            </div>

            {/* Sólo al iniciar sesión: en el formulario de registro no hay
                ninguna contraseña que recuperar todavía. */}
            {!isRegistering && (
              <div className="text-right -mt-2">
                <Link
                  href="/recuperar"
                  className="text-[11px] text-muted-foreground transition-colors hover:text-primary hover:underline"
                >
                  {t("auth_forgot_link")}
                </Link>
                <Link href="/confirmar-correo" className="mt-3 block text-[11px] text-muted-foreground hover:text-primary hover:underline">
                  {t("auth_confirmation_title")}
                </Link>
              </div>
            )}

            {isRegistering && (
              <label className="flex cursor-pointer items-start gap-2 text-[11px] leading-snug text-muted-foreground">
                <input
                  type="checkbox"
                  disabled={loading}
                  required
                  checked={aceptaTerminos}
                  onChange={(e) => setAceptaTerminos(e.target.checked)}
                  className="mt-0.5 size-3.5 shrink-0 accent-[var(--primary)]"
                />
                <span>
                  Acepto los{" "}
                  <Link href="/legal/terminos" target="_blank" className="text-primary hover:underline">
                    Términos y Condiciones
                  </Link>{" "}
                  y la{" "}
                  <Link href="/legal/privacidad" target="_blank" className="text-primary hover:underline">
                    Política de Privacidad
                  </Link>
                  , y declaro que el contenido que suba es de mi autoría o cuento con los derechos
                  para publicarlo.
                </span>
              </label>
            )}

            {isRegistering && (
              <label className="flex cursor-pointer items-start gap-2 text-[11px] leading-snug text-muted-foreground">
                <input
                  type="checkbox"
                  disabled={loading}
                  required
                  checked={declaraMayoria}
                  onChange={(e) => setDeclaraMayoria(e.target.checked)}
                  aria-describedby="auth-edad-nota"
                  className="mt-0.5 size-3.5 shrink-0 accent-[var(--primary)]"
                />
                <span>
                  Tengo 18 años o más.{" "}
                  <span id="auth-edad-nota">
                    La participación de menores todavía no está habilitada mientras definimos las
                    autorizaciones y protecciones que requiere.
                  </span>
                </span>
              </label>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity mt-2 disabled:opacity-50"
            >
              {loading
                ? t("auth_submit_processing")
                : isRegistering
                ? t("auth_submit_register")
                : t("auth_submit_login")}
            </button>

            </>}
            {errorMensaje && (
              <p role="alert" className="text-center text-xs font-semibold text-destructive mt-2">{errorMensaje}</p>
            )}
            {exitoMensaje && (
              <p role="status" className="text-center text-xs font-semibold text-foreground mt-2">{exitoMensaje}</p>
            )}
          </form>

          {!perfilPendiente && <div className="text-center pt-2 border-t border-border">
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setShowPassword(false);
                setIsRegistering(!isRegistering);
                setErrorMensaje("");
                setExitoMensaje("");
              }}
              className="min-h-11 rounded px-2 text-xs text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary"
            >
              {isRegistering ? t("auth_toggle_to_login") : t("auth_toggle_to_register")}
            </button>
          </div>}
        </div>

        <p className="text-center text-[11px] text-muted-foreground">
          <Link href="/legal/terminos" className="hover:text-foreground hover:underline">Términos</Link>
          {" · "}
          <Link href="/legal/privacidad" className="hover:text-foreground hover:underline">Privacidad</Link>
          {" · "}
          <Link href="/legal/copyright" className="hover:text-foreground hover:underline">Derechos de autor</Link>
          {" · "}
          <Link href="/legal" className="hover:text-foreground hover:underline">Centro legal</Link>
        </p>
      </div>
    </div>
  );
}
