"use client"

import * as React from "react"
import { X } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

import { cn } from "@/lib/utils"
import { usePanelStore, type PanelDescriptor, type PanelSide } from "@/lib/store/panel-store"

/**
 * Rend le panneau d'un côté (gauche/droite) du shell - une carte flottante « façon Claude »
 * (arrondie, ombrée, avec un léger gap), redimensionnable, en <b>overlay par-dessus le contenu</b>
 * (absolute) : elle ne comprime plus le `<main>`, elle passe au-dessus (retour user). PROD-8.9.
 * Un seul panneau par côté à la fois (cf. panel-store).
 */
export function PanelDock({ side }: { readonly side: PanelSide }) {
  const panels = usePanelStore((s) => s.panels)
  const docked = panels.filter((p) => p.side === side)

  // AnimatePresence : anime l'ouverture ET la fermeture (slide + fade) du panneau.
  return (
    <AnimatePresence>
      {docked.map((panel) => (
        <PanelColumn key={panel.id} panel={panel} side={side} />
      ))}
    </AnimatePresence>
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
    <motion.aside
      // Ouverture/fermeture fluide SANS jamais dépasser les bornes finales du panneau : `opacity` +
      // `scale` ancré sur le bord (`transformOrigin`). Un slide en `x` (depuis hors écran droite)
      // débordait et créait une barre de scroll horizontale transitoire → contenu « repoussé » vers
      // la gauche (retour user). Le scale part de 0.97 → 1 : le panneau ne sort JAMAIS de sa zone.
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      style={{
        width: panel.width,
        maxWidth: "92vw",
        transformOrigin: side === "right" ? "right center" : "left center",
      }}
      className={cn(
        // Overlay : posé sur toute la hauteur du contenu, par-dessus le `<main>` (z au-dessus du
        // contenu, sous la topbar sticky z-40 et les modals z-50). `max-w-92vw` = garde-fou mobile.
        "absolute inset-y-0 z-30 flex h-full flex-col py-2",
        side === "right" ? "right-0 pl-1 pr-2" : "left-0 pl-2 pr-1"
      )}
    >
      {/* Poignée de redimensionnement - pilule discrète qui s'éclaire au survol (façon Claude). */}
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
    </motion.aside>
  )
}
