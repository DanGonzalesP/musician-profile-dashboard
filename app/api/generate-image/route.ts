import { readJsonObject } from "@/lib/request-json";
import { NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/server-auth";
import { checkAuthenticatedRateLimit, respuesta429 } from "@/lib/rate-limit";
import { idDePeticion, logError, logInfo, logWarn } from "@/lib/log";
import { leerConTope } from "@/lib/stream-limit";

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

    const input = await readJsonObject(request, 4096);
    if (!input.ok) return NextResponse.json({ error: input.status === 413 ? "La descripción es demasiado larga." : input.status === 408 ? "La recepción tardó demasiado. Inténtalo de nuevo." : "Solicitud inválida." }, { status: input.status });
    const { prompt: rawPrompt, output } = input.value;
    const prompt = typeof rawPrompt === "string" ? rawPrompt.trim() : "";
    if (output !== undefined && output !== "file") {
      return NextResponse.json({ error: "Formato no admitido." }, { status: 400 });
    }

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "El prompt es requerido" }, { status: 400 });
    }
    if (prompt.length > 600) {
      return NextResponse.json({ error: "El prompt es demasiado largo (máx. 600 caracteres)" }, { status: 400 });
    }

    // Llamada al modelo de IA generativa de imágenes
    const response = await fetch("https://api.together.xyz/v1/images/generations", {
      method: "POST",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(90_000)]),
      redirect: "error",
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
        ...(output === "file" ? { response_format: "base64", output_format: "png" } : {}),
      }),
    });

    if (!response.ok) {
      await response.body?.cancel();
      // Provider messages can contain the user's prompt. Never log that body.
      throw new Error("Proveedor de imágenes no disponible");
    }
    if (!response.body) throw new Error("Respuesta vacía del proveedor");
    const result = await leerConTope(response.body, output === "file" ? 8 * 1024 * 1024 : 64 * 1024);
    if (result.excedido) throw new Error("Respuesta de imagen excede el límite");
    let data: unknown;
    try { data = JSON.parse(new TextDecoder().decode(result.bytes)); }
    catch { throw new Error("Respuesta de imagen inválida"); }
    const images = data && typeof data === "object" && "data" in data ? data.data : null;
    const first = Array.isArray(images) ? images[0] : null;
    if (!first || typeof first !== "object") throw new Error("Imagen ausente");
    let file: Uint8Array | undefined;
    let url: string | undefined;
    if (output === "file") {
      if (typeof first.b64_json !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(first.b64_json)) {
        throw new Error("Imagen codificada inválida");
      }
      const decoded = atob(first.b64_json);
      file = Uint8Array.from(decoded, char => char.charCodeAt(0));
      const signature = [137, 80, 78, 71, 13, 10, 26, 10];
      if (file.length > 5 * 1024 * 1024 || !signature.every((value, i) => file![i] === value)) {
        throw new Error("Formato de imagen inválido");
      }
    } else {
      if (typeof first.url !== "string") throw new Error("Enlace de imagen ausente");
      const parsed = new URL(first.url);
      if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error("Enlace de imagen inválido");
      url = parsed.href;
    }

    logInfo("api/generate-image", "imagen generada", {
      requestId,
      userId: user.id,
      duracionMs: Date.now() - inicio,
      resultado: "ok",
    });
    if (file) return new Response(new Blob([new Uint8Array(file)]), {
      headers: { "Content-Type": "image/png", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
    return NextResponse.json({ url }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    // No se devuelve error.message crudo: filtra detalles internos y mensajes
    // del proveedor externo. El `prompt` tampoco se registra: es texto del
    // usuario (ver la lista de claves prohibidas de lib/log.ts).
    logError("api/generate-image", "fallo al generar la imagen", undefined, { requestId, resultado: "error", causa: error instanceof Error && error.name === "TimeoutError" ? "timeout" : "error" });
    return NextResponse.json({ error: "No se pudo generar la imagen." }, { status: 500 });
  }
}
