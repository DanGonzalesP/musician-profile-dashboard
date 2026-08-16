import { NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/server-auth";
import { checkAuthenticatedRateLimit, respuesta429 } from "@/lib/rate-limit";
import { idDePeticion, logError, logInfo, logWarn } from "@/lib/log";

export async function POST(request: Request) {
  const requestId = idDePeticion(request);
  const inicio = Date.now();
  try {
    // Solo usuarios autenticados: esta ruta consume créditos de la API de
    // imágenes — sin este check cualquiera podría agotarlos.
    const auth = await getAuthenticatedContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Inicia sesión para generar imágenes." }, { status: 401 });
    }

    const { user, supabase } = auth;

    // P-02 — TOGETHER_API_KEY quedó pospuesta a un plan Pro por decisión de
    // producto. Sin ella, la versión anterior mandaba literalmente
    // "Bearer undefined" a Together AI y devolvía un 500 opaco: un fallo
    // contra un tercero por una configuración que sabemos que falta. Ahora la
    // ruta lo dice ella misma, antes de salir a la red. Fail-closed y honesto.
    const apiKey = process.env.TOGETHER_API_KEY;
    if (!apiKey) {
      logWarn("api/generate-image", "TOGETHER_API_KEY no configurada", { requestId, userId: user.id });
      return NextResponse.json(
        { error: "La generación de imágenes con IA no está disponible en este momento." },
        { status: 503 }
      );
    }

    // 10 imagenes por hora y por usuario: generoso para un artista armando su
    // perfil, inútil para agotar los créditos de la API.
    const limite = await checkAuthenticatedRateLimit(supabase, "image-generation");
    if (!limite.permitido) return respuesta429(limite.reintentarEn);

    const { prompt } = await request.json();

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "El prompt es requerido" }, { status: 400 });
    }
    if (prompt.length > 600) {
      return NextResponse.json({ error: "El prompt es demasiado largo (máx. 600 caracteres)" }, { status: 400 });
    }

    // Llamada al modelo de IA generativa de imágenes
    const response = await fetch("https://api.together.xyz/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "black-forest-labs/FLUX.1-schnell-Free",
        prompt: `Professional music artist profile asset, ${prompt}, high resolution, clean background`,
        width: 1024,
        height: 1024,
        steps: 4,
        n: 1,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || "Error al generar la imagen");
    }

    logInfo("api/generate-image", "imagen generada", {
      requestId,
      userId: user.id,
      duracionMs: Date.now() - inicio,
      resultado: "ok",
    });
    return NextResponse.json({ url: data.data[0].url });
  } catch (error) {
    // No se devuelve error.message crudo: filtra detalles internos y mensajes
    // del proveedor externo. El `prompt` tampoco se registra: es texto del
    // usuario (ver la lista de claves prohibidas de lib/log.ts).
    logError("api/generate-image", "fallo al generar la imagen", error, { requestId });
    return NextResponse.json({ error: "No se pudo generar la imagen." }, { status: 500 });
  }
}
