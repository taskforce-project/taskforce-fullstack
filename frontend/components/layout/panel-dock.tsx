"use client"

import * as React from "react"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"
import { usePanelStore, type PanelDescriptor, type PanelSide } from "@/lib/store/panel-store"

/**
 * Rend la pile de panneaux d'un côté (gauche/droite) du shell. Les panneaux
 * "poussent" le contenu (flex), sont empilables et redimensionnables. PROD-8.9.
 */
export function PanelDock({ side }: { readonly side: PanelSide }) {
  const panels = usePanelStore((s) => s.panels)
  const docked = panels.filter((p) => p.side === side)
  if (docked.length === 0) return null

  // Ordre : sur le dock droit, le plus récent est le plus à droite (collé au bord).
  const ordered = side === "right" ? docked : [...docked].reverse()

  return (
    <>
      {ordered.map((panel) => (
        <PanelColumn key={panel.id} panel={panel} side={side} />
      ))}
    </>
  )
}

function PanelColumn({ panel, side }: { readonly panel: PanelDescriptor; readonly side: PanelSide }) {
  const setWidth = usePanelStore((s) => s.setWidth)
  const closePanel = usePanelStore((s) => s.closePanel)

  const startResize = React.useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      const startX = e.clientX
      const startWidth = panel.width

      const onMove = (ev: PointerEvent) => {
        const delta = side === "right" ? startX - ev.clientX : ev.clientX - startX
        setWidth(panel.id, startWidth + delta)
      }
      const onUp = () => {
        window.removeEventListener("pointermove", onMove)
        window.removeEventListener("pointerup", onUp)
        document.body.style.userSelect = ""
      }
      document.body.style.userSelect = "none"
      window.addEventListener("pointermove", onMove)
      window.addEventListener("pointerup", onUp)
    },
    [panel.id, panel.width, side, setWidth]
  )

  return (
    <aside
      style={{ width: panel.width }}
      className={cn(
        "relative flex h-full shrink-0 flex-col bg-background",
        side === "right" ? "border-l border-border" : "border-r border-border"
      )}
    >
      {/* Poignée de redimensionnement (bord interne) */}
      <button
        type="button"
        aria-label="Redimensionner le panneau"
        onPointerDown={startResize}
        className={cn(
          "absolute top-0 z-10 h-full w-1.5 cursor-col-resize bg-transparent transition-colors hover:bg-primary/30",
          side === "right" ? "left-0 -translate-x-1/2" : "right-0 translate-x-1/2"
        )}
      />

      {/* Header */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        {panel.icon}
        <span className="flex-1 truncate text-sm font-semibold text-foreground">{panel.title}</span>
        <button
          type="button"
          onClick={() => closePanel(panel.id)}
          aria-label="Fermer le panneau"
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Corps */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{panel.content}</div>
    </aside>
  )
}
