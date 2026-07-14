// Skeletons de carga — repiten la estructura real de cada bloque (mismo
// contenedor, mismo alto, mismo spacing) para que el reemplazo por el
// contenido real no salte ni cambie el layout de la página.

function Bone({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />
}

export function HeroSkeleton() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border">
      <Bone className="h-36 w-full rounded-none sm:h-52" />
      <div className="relative -mt-12 px-6 pb-6 sm:-mt-16 sm:px-8 sm:pb-8">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-end">
          <Bone className="size-24 shrink-0 rounded-full border-4 border-card sm:size-32" />
          <div className="flex-1 space-y-2 pb-1">
            <Bone className="mx-auto h-7 w-48 sm:mx-0" />
            <Bone className="mx-auto h-4 w-32 sm:mx-0" />
          </div>
        </div>
        <div className="mt-5 flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="w-full space-y-2 sm:max-w-md">
            <Bone className="h-3.5 w-full" />
            <Bone className="h-3.5 w-2/3" />
          </div>
          <Bone className="h-9 w-40 shrink-0 rounded-full" />
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
          <Bone className="h-7 w-24 rounded-full" />
          <Bone className="h-7 w-24 rounded-full" />
          <Bone className="h-7 w-20 rounded-full" />
        </div>
      </div>
    </div>
  )
}

export function TrackListSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card/40 p-5 sm:p-6">
      <Bone className="mb-4 h-3 w-24" />
      <div className="-mx-1 flex gap-3 overflow-hidden px-1 pb-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex w-32 shrink-0 flex-col items-center gap-2 p-2">
            <Bone className="aspect-square w-full rounded-md" />
            <Bone className="h-3 w-20" />
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-lg border border-border bg-background/40 p-4">
        <div className="flex flex-col gap-4 sm:flex-row">
          <Bone className="aspect-square w-32 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-3">
            <Bone className="h-3 w-full max-w-40" />
            <div className="space-y-2.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Bone className="size-9 shrink-0 rounded-md" />
                  <Bone className="size-7 shrink-0 rounded-full" />
                  <Bone className="h-3.5 flex-1" />
                  <Bone className="h-3 w-8 shrink-0" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function MerchSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card/40 p-5 sm:p-6">
      <Bone className="mb-5 h-6 w-40" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-2xl border border-border bg-background/40">
            <Bone className="aspect-square w-full rounded-none" />
            <div className="space-y-2 p-4">
              <Bone className="h-3.5 w-full" />
              <Bone className="h-4 w-16" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ServiceSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card/40 p-5 sm:p-6">
      <Bone className="mb-5 h-6 w-48" />
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border bg-background/40 p-5">
            <Bone className="h-4 w-32" />
            <Bone className="mt-2 h-3 w-full" />
            <Bone className="mt-1 h-3 w-2/3" />
            <Bone className="mt-4 h-5 w-24" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function DonationSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card/40 p-5 sm:p-6">
      <Bone className="mb-3 h-3 w-40" />
      <Bone className="mb-2 h-5 w-48" />
      <Bone className="mb-1.5 h-3.5 w-full" />
      <Bone className="mb-4 h-3.5 w-2/3" />
      <Bone className="mb-2 h-1.5 w-full rounded-full" />
      <Bone className="mb-4 h-3 w-1/2" />
      <Bone className="h-9 w-28 rounded-full" />
    </div>
  )
}

/**
 * Skeleton de página completa — imita el orden por defecto de bloques
 * (hero + tracks + merch) que usa createBlock al inicializar un perfil.
 */
export function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <HeroSkeleton />
      <TrackListSkeleton />
      <MerchSkeleton />
    </div>
  )
}
