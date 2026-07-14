"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { type Block, type BlockType, type TracksData, dbBlockToBlock } from "@/lib/blocks";
import { type CatalogProduct, type CatalogService, fetchCatalog } from "@/lib/catalog";
import { BlockRenderer } from "@/components/blocks/block-renderer";
import { ProfileSkeleton } from "@/components/blocks/skeletons";
import { Store, Home } from "lucide-react";

type LoadingState = "idle" | "loading" | "error" | "empty" | "success";

// Perfil "separado" (default): Hero, Track List y Donaciones viven en la
// página principal; Merch y Servicios quedan en su propia pestaña. Si el
// artista activa "Unificar perfil" (profiles.unified_profile), se muestran
// todos los bloques juntos, en el orden guardado, como antes.
const MAIN_BLOCK_TYPES: BlockType[] = ["hero", "tracks", "donation"];

export default function PerfilPublicoPage() {
  const params = useParams();2
  const username = (params?.username as string)?.trim().toLowerCase();

  const [blocks, setBlocks] = useState<Block[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [services, setServices] = useState<CatalogService[]>([]);
  const [state, setState] = useState<LoadingState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState("");
  const [unifiedProfile, setUnifiedProfile] = useState(false);
  const [activeTab, setActiveTab] = useState<"main" | "store">("main");

  useEffect(() => {
    setShareUrl(window.location.href);
  }, []);

  useEffect(() => {
    if (!username) {
      setState("error");
      setErrorMessage("Perfil no especificado");
      return;
    }

    const controller = new AbortController();

    async function cargarPerfil() {
      try {
        setState("loading");
        setErrorMessage(null);

        // Convertir slug URL → formato de búsqueda
        // "nova-reyes" → "nova reyes"
        const displayNameSlug = username.replaceAll("-", " ");

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("id, unified_profile")
          .ilike("display_name", displayNameSlug)
          .maybeSingle();

        if (controller.signal.aborted) return;

        if (profileError) {
          throw new Error(`Error al buscar perfil: ${profileError.message}`);
        }

        if (!profile) {
          setState("error");
          setErrorMessage("Artista no encontrado");
          return;
        }

        setUnifiedProfile(Boolean(profile.unified_profile));

        // Cargar bloques del perfil
        const { data: dbBlocks, error: blocksError } = await supabase
          .from("profile_blocks")
          .select("id, block_type, content, position_index")
          .eq("profile_id", profile.id)
          .eq("is_visible", true)
          .order("position_index", { ascending: true });

        if (controller.signal.aborted) return;

        if (blocksError) {
          throw new Error(`Error al cargar bloques: ${blocksError.message}`);
        }

        const parsedBlocks = (dbBlocks ?? []).map(dbBlockToBlock);

        const { products: catalogProducts, services: catalogServices } = await fetchCatalog(profile.id);

        if (controller.signal.aborted) return;

        setProducts(catalogProducts);
        setServices(catalogServices);

        if (parsedBlocks.length === 0) {
          setState("empty");
          setBlocks([]);
        } else {
          setState("success");
          setBlocks(parsedBlocks);
        }
      } catch (err) {
        if (controller.signal.aborted) return;

        const message =
          err instanceof Error ? err.message : "Error desconocido al cargar el perfil";
        setErrorMessage(message);
        setState("error");
      }
    }

    cargarPerfil();

    return () => controller.abort();
  }, [username]);

  // UI States
  if (state === "loading") {
    return (
      <div className="min-h-screen bg-background text-foreground p-4 sm:p-6 lg:p-8">
        <main className="mx-auto max-w-5xl">
          <ProfileSkeleton />
        </main>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <div className="text-center">
          <p className="text-sm font-semibold text-destructive">
            {errorMessage || "Artista no encontrado."}
          </p>
        </div>
      </div>
    );
  }

  if (state === "empty") {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <div className="text-center">
          <p className="text-lg font-semibold text-foreground">
            No hay contenido disponible todavía.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            El perfil se completará cuando haya datos en Supabase.
          </p>
        </div>
      </div>
    );
  }

  const tracksData = blocks.find((b) => b.type === "tracks")?.data as TracksData | undefined;
  const albumCovers = tracksData?.albums.map((a) => a.cover).filter(Boolean) ?? [];

  const mainBlocks = blocks.filter((b) => MAIN_BLOCK_TYPES.includes(b.type));
  const storeBlocks = blocks.filter((b) => !MAIN_BLOCK_TYPES.includes(b.type));
  const showStoreTab = !unifiedProfile && storeBlocks.length > 0;
  const visibleBlocks = unifiedProfile ? blocks : activeTab === "store" ? storeBlocks : mainBlocks;

  return (
    <div className="min-h-screen bg-background text-foreground p-4 sm:p-6 lg:p-8">
      <main className="mx-auto flex max-w-5xl flex-col gap-8 animate-fade-in">
        {showStoreTab && (
          <nav className="mx-auto flex w-fit gap-1 rounded-full border border-border bg-card p-1">
            <button
              type="button"
              onClick={() => setActiveTab("main")}
              className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                activeTab === "main" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Home className="size-4" />
              Inicio
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("store")}
              className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                activeTab === "store" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Store className="size-4" />
              Merch y Servicios
            </button>
          </nav>
        )}
        {visibleBlocks.map((block) => (
          <BlockRenderer
            key={block.id}
            block={block}
            products={products}
            services={services}
            shareUrl={shareUrl}
            albumCovers={albumCovers}
          />
        ))}
      </main>
    </div>
  );
}
