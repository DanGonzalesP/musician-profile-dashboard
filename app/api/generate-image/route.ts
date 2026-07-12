import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { prompt } = await request.json();

    if (!prompt) {
      return NextResponse.json({ error: "El prompt es requerido" }, { status: 400 });
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}