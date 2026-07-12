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
  const [isRegistering, setIsRegistering] = useState(false); // Estado para cambiar entre Login y Registro
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
        setIsRegistering(false); // Cambia automáticamente a modo Login
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
        router.push("/perfil");
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white p-4">
      <div className="w-full max-w-sm bg-zinc-950 p-6 rounded-xl border border-zinc-800 space-y-6">
        <header className="text-center space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">
            {isRegistering ? "Crear Cuenta" : "Iniciar Sesión"}
          </h1>
          <p className="text-zinc-400 text-xs">
            {isRegistering 
              ? "Regístrate para gestionar tu perfil artístico" 
              : "Ingresa al panel de control de tu perfil artístico"}
          </p>
        </header>

        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">Correo Electrónico</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-sm text-white focus:outline-none focus:border-amber-500"
              placeholder="correo@ejemplo.com"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-sm text-white focus:outline-none focus:border-amber-500"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-amber-500 hover:bg-amber-600 text-zinc-950 font-bold text-sm p-2 rounded transition-colors disabled:opacity-50"
          >
            {loading ? "Procesando..." : isRegistering ? "Registrarse" : "Ingresar"}
          </button>

          {errorMensaje && (
            <p className="text-center text-xs font-semibold text-red-400 mt-2">
              {errorMensaje}
            </p>
          )}

          {exitoMensaje && (
            <p className="text-center text-xs font-semibold text-green-400 mt-2">
              {exitoMensaje}
            </p>
          )}
        </form>

        <div className="text-center pt-2 border-t border-zinc-900">
          <button
            type="button"
            onClick={() => {
              setIsRegistering(!isRegistering);
              setErrorMensaje("");
              setExitoMensaje("");
            }}
            className="text-xs text-amber-500 hover:underline focus:outline-none"
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