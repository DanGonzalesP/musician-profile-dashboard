"use client"

import Link from "next/link"
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function EditorHeader({
  blockCount,
  onPublish,
  isPublishing
}: {
  blockCount: number,
  onPublish: () => void,
  isPublishing: boolean
}) {
  return (
    <header className="flex items-center justify-between border-b border-sidebar-border bg-sidebar px-4 py-3">
      <div className="text-sm font-semibold">
        Dashboard <span className="text-muted-foreground font-normal">({blockCount} blocks)</span>
      </div>
      <div className="flex gap-2">
        <Link href="/perfil/dashboard" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          Panel Admin
        </Link>
        <Button variant="outline" size="sm" onClick={() => window.open('/perfil/preview', '_blank')}>
          Preview
        </Button>
        <Button 
          size="sm" 
          onClick={onPublish} 
          disabled={isPublishing}
        >
          {isPublishing ? "Publishing..." : "Publish"}
        </Button>
      </div>
    </header>
  )
}