"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMensaje, setErrorMensaje] = useState("");
  const [exitoMensaje, setExitoMensaje] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const router = useRouter();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMensaje("");
    setExitoMensaje("");

    if (isRegistering) {
      // --- PROCESO DE REGISTRO ---
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        setErrorMensaje(error.message || "Error al registrar el usuario.");
        setLoading(false);
      } else {
        setExitoMensaje("¡Cuenta creada con éxito! Ya puedes iniciar sesión.");
        setIsRegistering(false);
        setLoading(false);
      }
    } else {
      // --- PROCESO DE INICIO DE SESIÓN ---
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setErrorMensaje("Credenciales inválidas. Por favor, verifica tus datos.");
        setLoading(false);
      } else {
        router.push("/dashboard");
      }
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl space-y-6">
        <header className="text-center">
          <div className="mx-auto size-10 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-xl mb-2">
            D
          </div>
          <h2 className="text-xl font-bold">
            {isRegistering ? "Crea tu cuenta en Décima" : "Bienvenido a Décima"}
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            {isRegistering 
              ? "Empieza a construir tu perfil de artista hoy." 
              : "Ingresa para gestionar tu música y productos."}
          </p>
        </header>

        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1.5 text-muted-foreground">Correo Electrónico</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="correo@ejemplo.com"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5 text-muted-foreground">Contraseña</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity mt-2 disabled:opacity-50"
          >
            {loading ? "Procesando..." : isRegistering ? "Registrarse" : "Ingresar"}
          </button>

          {errorMensaje && (
            <p className="text-center text-xs font-semibold text-destructive mt-2">
              {errorMensaje}
            </p>
          )}

          {exitoMensaje && (
            <p className="text-center text-xs font-semibold text-emerald-500 mt-2">
              {exitoMensaje}
            </p>
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
            {isRegistering 
              ? "¿Ya tienes cuenta? Inicia sesión aquí" 
              : "¿No tienes cuenta? Regístrate aquí"}
          </button>
        </div>
      </div>
    </div>
  );
}