"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { type Block, createBlock, dbBlockToBlock, PROFILE_ID } from "@/lib/blocks";
import { type CatalogProduct, type CatalogService, fetchCatalog } from "@/lib/catalog";
import { BlockRenderer } from "@/components/blocks/block-renderer";
import { ArrowLeft } from "lucide-react";

type LoadingState = "loading" | "error" | "success";

export default function PerfilPreviewPage() {
  const router = useRouter();
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [services, setServices] = useState<CatalogService[]>([]);
  const [state, setState] = useState<LoadingState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function cargarBorrador() {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
          router.push("/login");
          return;
        }

        // Misma resolución que el editor: perfil real del usuario, con
        // PROFILE_ID como respaldo si todavía no tiene fila propia.
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("id")
          .eq("user_id", user.id ?? PROFILE_ID)
          .maybeSingle();

        if (profileError) throw profileError;

        const profileId = profile?.id ?? PROFILE_ID;

        let draft: { blocks: Block[]; products: CatalogProduct[]; services: CatalogService[] } | null = null;
        if (profile) {
          const { data: draftRow, error: draftError } = await supabase
            .from("profiles")
            .select("draft_content")
            .eq("id", profileId)
            .maybeSingle();
          if (!draftError) draft = draftRow?.draft_content ?? null;
        }

        if (draft) {
          setBlocks(draft.blocks ?? []);
          setProducts(draft.products ?? []);
          setServices(draft.services ?? []);
        } else {
          const { data: dbBlocks, error: blocksError } = await supabase
            .from("profile_blocks")
            .select("id, block_type, content, position_index")
            .eq("profile_id", profileId)
            .order("position_index", { ascending: true });

          if (blocksError) throw blocksError;

          setBlocks(
            dbBlocks && dbBlocks.length > 0
              ? dbBlocks.map(dbBlockToBlock)
              : [createBlock("hero"), createBlock("tracks"), createBlock("merch")]
          );

          const { products: catalogProducts, services: catalogServices } = await fetchCatalog(profileId);
          setProducts(catalogProducts);
          setServices(catalogServices);
        }

        setState("success");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Error desconocido al cargar la vista previa";
        setErrorMessage(message);
        setState("error");
      }
    }
    cargarBorrador();
  }, [router]);

  if (state === "loading") {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <p className="text-sm font-medium">Cargando vista previa...</p>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <p className="text-sm font-semibold text-destructive">{errorMessage}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="sticky top-0 z-50 flex items-center justify-between border-b border-border bg-amber-500/10 px-4 py-2 backdrop-blur">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400 hover:text-amber-300">
          <ArrowLeft className="size-3.5" /> Volver al editor
        </Link>
        <span className="text-xs font-semibold text-amber-400">Vista previa — cambios sin publicar</span>
      </div>
      <main className="mx-auto flex max-w-5xl flex-col gap-8 p-4 sm:p-6 lg:p-8">
        {blocks.map((block) => (
          <BlockRenderer key={block.id} block={block} products={products} services={services} />
        ))}
      </main>
    </div>
  );
}
