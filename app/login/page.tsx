"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useLocale } from "@/components/locale-provider";

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
  const [errorMensaje, setErrorMensaje] = useState("");
  const [exitoMensaje, setExitoMensaje] = useState("");
  const searchParams = useSearchParams();
  const [isRegistering, setIsRegistering] = useState(searchParams.get("modo") === "registro");
  const router = useRouter();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMensaje("");
    setExitoMensaje("");

    if (isRegistering) {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setErrorMensaje(error.message || t("auth_error_generic"));
        setLoading(false);
      } else {
        setExitoMensaje(t("auth_success_registered"));
        setIsRegistering(false);
        setLoading(false);
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setErrorMensaje(t("auth_error_invalid_credentials"));
        setLoading(false);
      } else {
        router.push("/dashboard");
      }
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
            <div className="mx-auto size-10 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-xl mb-2">
              D
            </div>
            <h2 className="text-xl font-bold">
              {isRegistering ? t("auth_register_title") : t("auth_login_title")}
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              {isRegistering ? t("auth_register_subtitle") : t("auth_login_subtitle")}
            </p>
          </header>

          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="block text-xs font-medium mb-1.5 text-muted-foreground">
                {t("auth_email_label")}
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("auth_email_placeholder")}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5 text-muted-foreground">
                {t("auth_password_label")}
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("auth_password_placeholder")}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

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

            {errorMensaje && (
              <p className="text-center text-xs font-semibold text-destructive mt-2">{errorMensaje}</p>
            )}
            {exitoMensaje && (
              <p className="text-center text-xs font-semibold text-emerald-500 mt-2">{exitoMensaje}</p>
            )}
          </form>

          <div className="text-center pt-2 border-t border-border">
            <button
              type="button"
              onClick={() => {
                setIsRegistering(!isRegistering);
                setErrorMensaje("");
                setExitoMensaje("");
              }}
              className="text-xs text-primary hover:underline focus:outline-none"
            >
              {isRegistering ? t("auth_toggle_to_login") : t("auth_toggle_to_register")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
