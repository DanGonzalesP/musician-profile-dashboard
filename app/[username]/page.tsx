"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { type Block, type BlockType, type TracksData, type CreditsData, dbBlockToBlock, isKnownBlockType } from "@/lib/blocks";
import { type CatalogProduct, type CatalogService, fetchCatalog } from "@/lib/catalog";
import { BlockRenderer } from "@/components/blocks/block-renderer";
import { ProfileSkeleton } from "@/components/blocks/skeletons";
import { AudioReactiveBackground } from "@/components/audio-reactive-background";
import { LocaleProvider, useLocale } from "@/components/locale-provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Store, Home } from "lucide-react";

type LoadingState = "idle" | "loading" | "error" | "empty" | "success";

// Perfil "separado" (default): Hero, Single Destacado, Meta de Producción,
// Track List y Donaciones viven en la página principal; Merch y Servicios
// quedan en su propia pestaña. Si el artista activa "Unificar perfil"
// (profiles.unified_profile), se muestran todos los bloques juntos, pero
// Hero, Single Destacado y Meta de Producción igual quedan forzados al
// tope, en ese orden — ver más abajo.
const MAIN_BLOCK_TYPES: BlockType[] = ["hero", "single", "crowdfunding", "tracks", "catalog", "credits", "donation"];

export default function PerfilPublicoPage() {
  return (
    <LocaleProvider>
      <PerfilPublicoContent />
    </LocaleProvider>
  );
}

function PerfilPublicoContent() {
  const { t } = useLocale();
  const params = useParams();
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

        const parsedBlocks = (dbBlocks ?? []).filter((b) => isKnownBlockType(b.block_type)).map(dbBlockToBlock);

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
      <div className="min-h-screen bg-background text-foreground px-4 py-6 sm:px-6 sm:py-8">
        <main className="mx-auto max-w-4xl">
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
  const creditsCount = (blocks.find((b) => b.type === "credits")?.data as CreditsData | undefined)?.credits.length ?? 0;

  // Orden estrictamente igual al de blocks[] (ya viene ordenado por
  // position_index desde la consulta) — nunca se fuerza un tipo de bloque
  // a una posición fija, para que el orden del editor/dashboard se respete
  // tal cual en el perfil público.
  const mainBlocks = blocks.filter((b) => MAIN_BLOCK_TYPES.includes(b.type));
  const storeBlocks = blocks.filter((b) => !MAIN_BLOCK_TYPES.includes(b.type));
  const showStoreTab = !unifiedProfile && storeBlocks.length > 0;

  const renderBlock = (block: Block) => (
    <BlockRenderer
      key={block.id}
      block={block}
      products={products}
      services={services}
      shareUrl={shareUrl}
      albumCovers={albumCovers}
      creditsCount={creditsCount}
    />
  );

  return (
    <div className="min-h-screen text-foreground px-4 py-6 sm:px-6 sm:py-8">
      <AudioReactiveBackground />
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 animate-fade-in">
        <div className="flex justify-end">
          <LanguageSwitcher />
        </div>
        {unifiedProfile
          ? (
            <>
              {blocks.map(renderBlock)}
            </>
          )
          : (
            <>
              {showStoreTab && (
                <div className="sticky top-2 z-20 flex gap-6 rounded-xl border border-border bg-card/95 px-4 shadow-lg backdrop-blur">
                  <button
                    type="button"
                    onClick={() => setActiveTab("main")}
                    className={`flex items-center gap-1.5 border-b-2 py-3 text-sm font-medium transition-colors ${
                      activeTab === "main"
                        ? "border-primary text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Home className="size-4" />
                    {t("tab_home")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("store")}
                    className={`flex items-center gap-1.5 border-b-2 py-3 text-sm font-medium transition-colors ${
                      activeTab === "store"
                        ? "border-primary text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Store className="size-4" />
                    {t("tab_store")}
                  </button>
                </div>
              )}
              {(activeTab === "store" ? storeBlocks : mainBlocks).map(renderBlock)}
            </>
          )}
      </main>
    </div>
  );
}
