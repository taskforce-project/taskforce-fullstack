"use client"

import type { ReactNode } from "react"
import { ChevronRight } from "lucide-react"

import { usePreferencesStore } from "@/lib/store/preferences-store"
import { useWindowStore, type WindowRow } from "@/lib/store/window-store"
import { cn } from "@/lib/utils"

/** Une ligne d'une liste de la zone de droite : pleine largeur, sans cadre, qui s'éclaire au survol. */
export const PANEL_ITEM =
  "flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors duration-150 hover:bg-muted"

/**
 * Une ligne de la zone de droite (R122) : son nom et son nombre, repliée par défaut ; un clic la déplie. Pas de cadre :
 * un séparateur d'un pixel entre les lignes.
 */
export function PanelRow({ row, value, children }: Readonly<{
  row: WindowRow
  /** Le nombre de la ligne, ou ce qui en tient lieu (« This computer », « 12% ») ; rien quand il n'y a rien à dire. */
  value?: ReactNode
  children: ReactNode
}>) {
  const name = usePreferencesStore((s) => s.t.window.rows[row])
  const open = useWindowStore((s) => s.rows[row] === true)
  const toggleRow = useWindowStore((s) => s.toggleRow)
  const id = `window-row-${row}`

  return (
    <section className="border-b border-border">
      <button
        type="button"
        onClick={() => toggleRow(row)}
        aria-expanded={open}
        aria-controls={id}
        className="flex h-10 w-full items-center gap-2 px-3 text-left text-[13px] transition-colors duration-150 hover:bg-muted/60"
      >
        <ChevronRight
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-150 ease-out motion-reduce:transition-none",
            open && "rotate-90",
          )}
        />
        <span className="min-w-0 flex-1 truncate font-medium text-foreground">{name}</span>
        {value !== undefined && value !== null && value !== "" && (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{value}</span>
        )}
      </button>
      {open && (
        <div id={id} className="px-3 pb-3">
          {children}
        </div>
      )}
    </section>
  )
}
