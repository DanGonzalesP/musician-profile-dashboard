import { NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/server-auth";
import { checkAuthenticatedRateLimit, checkRateLimit, identificarSolicitante, respuesta429 } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    // Solo usuarios autenticados: esta ruta consume créditos de la API de
    // imágenes — sin este check cualquiera podría agotarlos.
    const auth = await getAuthenticatedContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Inicia sesión para generar imágenes." }, { status: 401 });
    }

    const { user, supabase } = auth;

    // 10 imagenes por hora y por usuario: generoso para un artista armando su
    // perfil, inútil para agotar los créditos de la API.
    const limite =
      (await checkAuthenticatedRateLimit(supabase, "image-generation", 10, 3600)) ??
      checkRateLimit(identificarSolicitante(request, user.id), 10, 3600);
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
        "Authorization": `Bearer ${process.env.TOGETHER_API_KEY}`,
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

    return NextResponse.json({ url: data.data[0].url });
  } catch (error: any) {
    // No se devuelve error.message crudo: filtra detalles internos y mensajes
    // del proveedor externo.
    console.error("[api/generate-image]", error);
    return NextResponse.json({ error: "No se pudo generar la imagen." }, { status: 500 });
  }
}
