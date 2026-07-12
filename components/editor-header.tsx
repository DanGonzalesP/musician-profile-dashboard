"use client"

import { Button } from "@/components/ui/button" // Asegúrate de tener tu librería de botones

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
        <Button variant="outline" size="sm" onClick={() => window.open('/', '_blank')}>
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