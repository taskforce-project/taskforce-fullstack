"use client"

import type { ReactNode } from "react"
import { ChevronRight } from "lucide-react"

import { usePreferencesStore } from "@/lib/store/preferences-store"
import { useWindowStore, type WindowRow } from "@/lib/store/window-store"
import { cn } from "@/lib/utils"

/** Une ligne d'une liste de la zone de droite : pleine largeur, sans cadre, qui s'éclaire au survol. */
export const PANEL_ITEM =
  "flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors duration-150 hover:bg-muted motion-reduce:transition-none"

/**
 * Une carte de la zone de droite (R122, R141, séance n°20), à la manière du rail d'une session de Claude : son nom, et en
 * une phrase ce que la personne a besoin de savoir d'un regard ; un clic déplie le détail. Sans détail, elle ne se déplie
 * pas. Rien ne répète une autre ligne : le chiffre de droite n'est là que quand la phrase ne le dit pas.
 */
export function PanelRow({ row, summary, value, children }: Readonly<{
  row: WindowRow
  /** Ce que la carte apporte, d'un regard. */
  summary: ReactNode
  /** Un chiffre que la phrase ne dit pas (« 12% ») ; rien quand il n'y a rien à ajouter. */
  value?: ReactNode
  /** Le détail, un clic plus loin. */
  children?: ReactNode
}>) {
  const name = usePreferencesStore((s) => s.t.window.rows[row])
  const unfolded = useWindowStore((s) => s.rows[row] === true)
  const toggleRow = useWindowStore((s) => s.toggleRow)
  const id = `window-row-${row}`
  const hasDetail = children !== undefined && children !== null && children !== false
  const open = hasDetail && unfolded

  const face = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium text-muted-foreground">{name}</span>
        <span className="mt-0.5 block truncate text-[13px] text-foreground">{summary}</span>
      </span>
      {value !== undefined && value !== null && value !== "" && (
        <span className="shrink-0 self-start text-xs tabular-nums text-muted-foreground">{value}</span>
      )}
      {hasDetail && (
        <ChevronRight
          className={cn(
            "mt-px size-4 shrink-0 self-start text-muted-foreground transition-transform duration-150 ease-out motion-reduce:transition-none",
            open && "rotate-90",
          )}
          aria-hidden="true"
        />
      )}
    </>
  )

  return (
    <section className="shrink-0 rounded-lg border border-border bg-card">
      {hasDetail ? (
        <button
          type="button"
          onClick={() => toggleRow(row)}
          aria-expanded={open}
          aria-controls={id}
          className="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left transition-colors duration-150 hover:bg-muted/60 motion-reduce:transition-none"
        >
          {face}
        </button>
      ) : (
        <div className="flex w-full items-start gap-2 px-3 py-2">{face}</div>
      )}
      {open && (
        <div id={id} className="border-t border-border px-1 py-1.5">
          {children}
        </div>
      )}
    </section>
  )
}
