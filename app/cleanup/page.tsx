"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { authedFetch } from "@/lib/authed-fetch"

// Herramienta de mantenimiento SOLO PARA ADMINISTRADORES. El permiso real lo
// aplica el servidor (ver app/api/cleanup-orphaned-files/route.ts, que exige
// sesión + estar en ADMIN_USER_IDS); este guard de sesión solo evita mostrar
// un botón que de todos modos iba a responder 401.
export default function CleanupPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [checkingSession, setCheckingSession] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace("/login")
        return
      }
      setCheckingSession(false)
    })
  }, [router])

  async function handleCleanup() {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      // authedFetch adjunta el access token de Supabase; sin él la ruta
      // responde 401.
      const res = await authedFetch("/api/cleanup-orphaned-files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder: "audio" }),
      })

      const json = await res.json()

      if (!res.ok) {
        throw new Error(json.error || "Error en la limpieza")
      }

      setResult(json)
    } catch (err: any) {
      setError(err.message || String(err))
    } finally {
      setLoading(false)
    }
  }

  if (checkingSession) return null

  return (
    <div style={{ maxWidth: "800px", margin: "40px auto", fontFamily: "sans-serif", padding: "20px" }}>
      <h1>🧹 Limpiar archivos huérfanos de R2</h1>

      <p>
        Esta herramienta identifica todos los archivos de audio en Cloudflare R2 que <strong>ningún perfil</strong> está
        usando actualmente (típicamente mpeg viejos reemplazados por mp3) y los borra.
      </p>

      <button
        onClick={handleCleanup}
        disabled={loading}
        style={{
          padding: "10px 20px",
          fontSize: "16px",
          backgroundColor: loading ? "#ccc" : "#007bff",
          color: "white",
          border: "none",
          borderRadius: "4px",
          cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        {loading ? "Limpiando..." : "Iniciar limpieza"}
      </button>

      {error && (
        <div style={{ marginTop: "20px", padding: "10px", backgroundColor: "#fee", color: "#c00", borderRadius: "4px" }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {result && (
        <div style={{ marginTop: "20px" }}>
          <div style={{ padding: "10px", backgroundColor: "#efe", color: "#060", borderRadius: "4px", marginBottom: "20px" }}>
            <strong>✅ Limpieza completada</strong>
          </div>

          <h3>📊 Resumen</h3>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              <tr style={{ borderBottom: "1px solid #ddd" }}>
                <td style={{ padding: "8px" }}>Total de archivos</td>
                <td style={{ padding: "8px", fontWeight: "bold" }}>{result.summary.total}</td>
              </tr>
              <tr style={{ borderBottom: "1px solid #ddd" }}>
                <td style={{ padding: "8px" }}>En uso</td>
                <td style={{ padding: "8px", fontWeight: "bold" }}>{result.summary.inUse}</td>
              </tr>
              <tr style={{ borderBottom: "1px solid #ddd" }}>
                <td style={{ padding: "8px" }}>Huérfanos detectados</td>
                <td style={{ padding: "8px", fontWeight: "bold" }}>{result.summary.orphaned}</td>
              </tr>
              <tr style={{ borderBottom: "1px solid #ddd" }}>
                <td style={{ padding: "8px", color: "#060", fontWeight: "bold" }}>Borrados con éxito</td>
                <td style={{ padding: "8px", fontWeight: "bold", color: "#060" }}>{result.summary.deleted}</td>
              </tr>
              <tr>
                <td style={{ padding: "8px", color: "#c00", fontWeight: "bold" }}>Errores</td>
                <td style={{ padding: "8px", fontWeight: "bold", color: "#c00" }}>{result.summary.failed}</td>
              </tr>
            </tbody>
          </table>

          {result.failed && result.failed.length > 0 && (
            <>
              <h3>❌ Archivos que no se pudieron borrar</h3>
              <ul>
                {result.failed.map((f: any) => (
                  <li key={f.key}>
                    <code>{f.key}</code>: {f.error}
                  </li>
                ))}
              </ul>
            </>
          )}

          <h3>🗑️ Archivos borrados</h3>
          <details>
            <summary>
              Ver {result.deleted.length} archivos ({(result.deleted.length * 2.5).toFixed(1)} MB aproximadamente)
            </summary>
            <ul style={{ maxHeight: "300px", overflow: "auto", backgroundColor: "#f5f5f5", padding: "10px" }}>
              {result.deleted.map((key: string) => (
                <li key={key} style={{ fontSize: "12px", fontFamily: "monospace" }}>
                  {key}
                </li>
              ))}
            </ul>
          </details>

          <div style={{ marginTop: "20px" }}>
            <button
              onClick={() => router.push("/")}
              style={{
                padding: "10px 20px",
                backgroundColor: "#666",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Volver al inicio
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
