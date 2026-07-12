"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { type Block } from "@/lib/blocks";
import { PreviewCanvas } from "@/components/preview-canvas";

export default function PerfilPublicoPage() {
  const params = useParams();
  const username = params?.username as string;

  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function cargarPerfil() {
      if (!username) return;

      // 1. Buscamos el perfil usando el username (asumiendo que Nova Reyes u otro tenga una columna username o display_name)
      // Como tu editor usa un "fakeUserId" fijo, si aún no tienes columna 'username' en 'profiles', filtraremos temporalmente por display_name o el id si es necesario.
      // Aquí buscamos en la tabla 'profiles'
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        // Cambiar por .eq("username", username) cuando añadas la columna. Por ahora dejamos la lógica estructurada:
        .eq("display_name", username.replace("-", " ")) 
        .maybeSingle();

      if (profileError || !profile) {
        setError(true);
        setLoading(false);
        return;
      }

      // 2. Traemos los bloques asociados a ese perfil ordenados por su posición
      const { data: dbBlocks, error: blocksError } = await supabase
        .from("profile_blocks")
        .select("*")
        .eq("profile_id", profile.id)
        .eq("is_visible", true)
        .order("position_index", { ascending: true });

      if (blocksError || !dbBlocks) {
        setError(true);
      } else {
        // 3. Mapeamos el formato de la base de datos al formato del frontend (Block)
        const mappedBlocks: Block[] = dbBlocks.map((b) => ({
          id: b.id, // o genera uno si tu front requiere string uuid alternativo
          type: b.block_type,
          data: b.content || {},
        }));
        
        setBlocks(mappedBlocks);
      }
      setLoading(false);
    }

    cargarPerfil();
  }, [username]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <p className="text-sm font-medium">Cargando portafolio...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <p className="text-sm font-semibold text-destructive">Artista no encontrado.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-4 sm:p-6 lg:p-8">
      <main className="mx-auto max-w-2xl">
        <PreviewCanvas
          blocks={blocks}
          selectedId={null}
          isDragging={false}
          onSelect={() => {}}
          onDelete={() => {}}
          onMove={() => {}}
          onDropAt={() => {}}
          onReorderStart={() => {}}
          onDragEnd={() => {}}
        />
      </main>
    </div>
  );
}