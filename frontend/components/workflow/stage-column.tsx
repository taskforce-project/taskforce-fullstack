"use client"

import { memo, useRef, type ReactNode, type RefObject } from "react"

import { SummaryNodeCard, WorkflowNodeCard, type NodeHandlers, type NodeView } from "@/components/workflow/workflow-node"
import { WindowedRows } from "@/components/workflow/windowed-rows"
import { fillText } from "@/lib/delivery/result-card"
import { cn } from "@/lib/utils"
import type { StageModel } from "@/lib/workflow/model"
import type { WorkflowTexts } from "@/lib/workflow/sentence"
import { COLUMN_WIDTH, type Density } from "@/lib/workflow/states"
import { stageCountLine, type ColumnRow } from "@/lib/workflow/view"

/** L'écart entre deux cartes d'une colonne (§3). */
export const CARD_GAP = 8

/** La hauteur supposée d'une ligne avant sa mesure : une carte de Plan, de Detail, de Summary, un bouton. */
export function estimateRow(row: ColumnRow, density: Density): number {
  if (row.type !== "node") return 28
  if (density === "summary") return 48
  return density === "detail" ? 112 : 92
}

export interface ColumnState {
  readonly showDone: boolean
  readonly showAll: boolean
}

/**
 * Une étape du workflow (séance n°25, §3) : une colonne du projet, sans cadre, séparée de la suivante par un trait d'un
 * pixel. Son en-tête collant dit son nom et son nombre ; en Summary, une ligne de compte. Ses cartes s'empilent à 8 px
 * d'écart, et seules celles qui se voient se rendent ; elle défile seule, de haut en bas.
 */
export const StageColumn = memo(function StageColumn({
  stage, rows, density, views, selectedKey, focusKey, related, revealKey, t, handlers, onShowDone, onShowAll, onOpenParent,
  stacked = false, listScrollRef,
}: Readonly<{
  stage: StageModel
  rows: readonly ColumnRow[]
  density: Density
  /** Ce que chaque carte montre, par clé de nœud. */
  views: ReadonlyMap<string, NodeView>
  selectedKey: string | null
  /** La carte de la colonne qui prend le focus (le tabindex mobile). */
  focusKey: string | null
  /** Les nœuds liés au nœud choisi ; null quand rien n'est choisi (rien ne s'estompe). */
  related: ReadonlySet<string> | null
  revealKey: string | null
  t: WorkflowTexts
  handlers: NodeHandlers
  onShowDone: (stageId: number) => void
  onShowAll: (stageId: number) => void
  onOpenParent: (parentKey: string) => void
  /** L'écran étroit : la colonne devient une section de la liste, en pleine largeur, sans défilement à elle. */
  stacked?: boolean
  /** L'élément qui fait défiler la liste de l'écran étroit, où la section ne rend aussi que ce qui se voit. */
  listScrollRef?: RefObject<HTMLElement | null>
}>) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const total = stage.nodes.length
  const name = stage.status.name
  const label = total === 1 ? fillText(t.stageOne, { name }) : fillText(t.stage, { name, count: total })

  const renderRow = (row: ColumnRow): ReactNode => {
    switch (row.type) {
      case "node": {
        const view = views.get(row.key)
        if (!view) return null
        const common = {
          view,
          selected: row.key === selectedKey,
          focusable: row.key === focusKey,
          dimmed: related !== null && !related.has(row.key),
          t,
          handlers,
        }
        return density === "summary"
          ? <SummaryNodeCard {...common} />
          : <WorkflowNodeCard {...common} density={density} stretch={stacked} />
      }
      case "children":
        return (
          <RowButton onClick={() => onOpenParent(row.parentKey)} indent>
            {fillText(t.showSubIssues, { count: row.hidden })}
          </RowButton>
        )
      case "more":
        return <RowButton onClick={() => onShowAll(stage.status.id)}>{fillText(t.showMore, { count: row.hidden })}</RowButton>
      case "done":
        return <RowButton onClick={() => onShowDone(stage.status.id)}>{fillText(t.showDone, { count: row.hidden })}</RowButton>
    }
  }

  const header = (
    <div className={cn("flex h-9 shrink-0 items-center gap-2 bg-background", stacked ? "px-0" : "px-3")}>
      <h3 className="min-w-0 truncate text-sm font-[550] text-foreground" title={name}>{name}</h3>
      <span className="shrink-0 font-mono text-xs text-subtle">{total}</span>
    </div>
  )
  const countLine = density === "summary" && total > 0 ? (
    <p className="shrink-0 px-3 pb-2 text-[11px] leading-4 text-muted-foreground">
      {stageCountLine(stage, t.countOf, fillText)}
    </p>
  ) : null

  if (stacked) {
    return (
      <section aria-label={label} data-stage={stage.status.id} className="flex flex-col">
        <div className="sticky top-0 z-10 bg-background">{header}</div>
        <div className="pb-4">
          <WindowedRows
            rows={rows}
            gap={CARD_GAP}
            estimate={(row) => estimateRow(row, density)}
            scrollRef={listScrollRef ?? scrollRef}
            renderRow={renderRow}
            list
          />
        </div>
      </section>
    )
  }

  return (
    <section
      aria-label={label}
      data-stage={stage.status.id}
      // En Summary, les colonnes se partagent la largeur libre, 160 px au moins ; Plan et Detail gardent leur largeur.
      style={density === "summary" ? { flex: `1 1 ${COLUMN_WIDTH.summary}px`, minWidth: COLUMN_WIDTH.summary } : { width: COLUMN_WIDTH[density] }}
      className={cn("flex h-full min-h-0 flex-col border-r border-border last:border-r-0", density !== "summary" && "shrink-0")}
    >
      {header}
      {countLine}
      <div ref={scrollRef} data-stage-scroll className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 [scrollbar-width:thin]">
        <WindowedRows
          rows={rows}
          gap={CARD_GAP}
          estimate={(row) => estimateRow(row, density)}
          scrollRef={scrollRef}
          revealKey={revealKey}
          renderRow={renderRow}
        />
      </div>
    </section>
  )
})

function RowButton({ onClick, children, indent = false }: Readonly<{ onClick: () => void; children: ReactNode; indent?: boolean }>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-7 w-full items-center px-2 text-left text-xs text-muted-foreground underline-offset-2 transition-colors duration-150 hover:bg-muted hover:text-foreground motion-reduce:transition-none",
        indent && "pl-5",
      )}
    >
      {children}
    </button>
  )
}
