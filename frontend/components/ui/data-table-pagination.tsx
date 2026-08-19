"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

interface DataTablePaginationProps {
  readonly page: number
  readonly pageCount: number
  readonly pageSize: number
  readonly total: number
  readonly onPageChange: (page: number) => void
  readonly onPageSizeChange: (size: number) => void
  readonly pageSizes?: readonly number[]
  readonly className?: string
}

/**
 * Barre de pagination réutilisable (QA Q-06) : « X–Y of N », sélecteur de
 * taille de page, boutons Précédent/Suivant. À placer en pied de tableau.
 */
export function DataTablePagination({
  page,
  pageCount,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizes = [25, 50, 100],
  className,
}: DataTablePaginationProps) {
  if (total === 0) return null

  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-2.5 text-xs text-muted-foreground",
        className
      )}
    >
      <span className="tabular-nums">
        <span className="font-medium text-foreground">{from}–{to}</span> of {total}
      </span>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className="hidden sm:inline">Rows per page</span>
          <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
            {/* `aria-label` indispensable : le libellé voisin est un simple <span>, jamais associé
                au contrôle — et il disparaît sous le point de rupture `sm`. Sans lui, un lecteur
                d'écran annonce un bouton anonyme (axe : `button-name`, critique). */}
            <SelectTrigger className="h-7 w-[4.25rem] text-xs" aria-label="Lignes par page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizes.map((s) => (
                <SelectItem key={s} value={String(s)} className="text-xs">{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="px-1.5 tabular-nums">Page {page} / {pageCount}</span>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={page >= pageCount}
            onClick={() => onPageChange(page + 1)}
            aria-label="Next page"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
