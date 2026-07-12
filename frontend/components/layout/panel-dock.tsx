"use client"

import * as React from "react"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"
import { usePanelStore, type PanelDescriptor, type PanelSide } from "@/lib/store/panel-store"

/**
 * Rend le panneau d'un côté (gauche/droite) du shell — une carte flottante « façon Claude »
 * (arrondie, ombrée, avec un léger gap), redimensionnable, qui pousse le contenu (flex). PROD-8.9.
 * Un seul panneau par côté à la fois (cf. panel-store).
 */
export function PanelDock({ side }: { readonly side: PanelSide }) {
  const panels = usePanelStore((s) => s.panels)
  const docked = panels.filter((p) => p.side === side)
  if (docked.length === 0) return null

  return (
    <>
      {docked.map((panel) => (
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
        "relative flex h-full shrink-0 flex-col py-2",
        side === "right" ? "pl-1 pr-2" : "pl-2 pr-1"
      )}
    >
      {/* Poignée de redimensionnement — pilule discrète qui s'éclaire au survol (façon Claude). */}
      <button
        type="button"
        aria-label="Redimensionner le panneau"
        onPointerDown={startResize}
        className={cn(
          "group absolute top-0 z-10 flex h-full w-3 cursor-col-resize items-center justify-center bg-transparent",
          side === "right" ? "left-0" : "right-0"
        )}
      >
        <span className="h-12 w-1 rounded-full bg-border transition-all duration-150 group-hover:h-16 group-hover:bg-primary/60" />
      </button>

      {/* Carte panneau flottante */}
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-lg">
        {/* Header */}
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-muted/30 px-3">
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
      </div>
    </aside>
  )
}
