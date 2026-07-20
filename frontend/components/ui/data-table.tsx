"use client"

import * as React from "react"
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { DataTablePagination } from "@/components/ui/data-table-pagination"
import { usePagination } from "@/hooks/use-pagination"
import { cn } from "@/lib/utils"

/**
 * Colonne d'un {@link DataTable}. `render` produit le contenu de la cellule ;
 * fournir `sortValue` rend la colonne triable (clic sur l'en-tête).
 */
export interface DataTableColumn<T> {
  /** Clé stable (tri + React key). */
  readonly key: string
  /** Libellé de l'en-tête. */
  readonly header: React.ReactNode
  /** Icône affichée avant le libellé (cohérence entre tableaux). */
  readonly icon?: React.ReactNode
  readonly align?: "left" | "right" | "center"
  /** Classe appliquée à l'en-tête ET aux cellules (largeur, visibilité responsive…). */
  readonly className?: string
  readonly render: (row: T) => React.ReactNode
  /** Si fourni → colonne triable (valeur de comparaison). */
  readonly sortValue?: (row: T) => string | number
}

interface DataTableProps<T> {
  readonly columns: readonly DataTableColumn<T>[]
  readonly data: readonly T[]
  readonly rowKey: (row: T) => string | number
  readonly onRowClick?: (row: T) => void
  /**
   * Lignes réellement cliquables, quand `onRowClick` ne s'applique pas à toutes.
   * Une ligne exclue perd le curseur ET le handler : jamais de ligne qui a l'air
   * cliquable et ne fait rien. Par défaut, toutes les lignes le sont.
   */
  readonly isRowClickable?: (row: T) => boolean
  /** Taille de page (défaut 25). `0` = pas de pagination (toutes les lignes). */
  readonly pageSize?: number
  readonly pageSizes?: readonly number[]
  readonly emptyMessage?: React.ReactNode
  readonly className?: string
}

const alignClass = (a?: "left" | "right" | "center") =>
  a === "right" ? "text-right" : a === "center" ? "text-center" : ""

/**
 * Tableau réutilisable et paramétrable (shadcn `Table` + pagination + tri).
 * Un seul composant pour toutes les vues (Signals, My Queue, Members…) → styles homogènes.
 */
export function DataTable<T>({
  columns,
  data,
  rowKey,
  onRowClick,
  isRowClickable,
  pageSize = 25,
  pageSizes = [25, 50, 100],
  emptyMessage = "No data.",
  className,
}: DataTableProps<T>) {
  const [sort, setSort] = React.useState<{ key: string; dir: "asc" | "desc" } | null>(null)

  const sorted = React.useMemo(() => {
    if (!sort) return data
    const col = columns.find((c) => c.key === sort.key)
    if (!col?.sortValue) return data
    const dir = sort.dir === "asc" ? 1 : -1
    return [...data].sort((a, b) => {
      const va = col.sortValue!(a)
      const vb = col.sortValue!(b)
      if (va < vb) return -dir
      if (va > vb) return dir
      return 0
    })
  }, [data, sort, columns])

  const paginate = pageSize > 0
  const { page, setPage, pageSize: ps, setPageSize, pageCount, pageItems, total } = usePagination(sorted, pageSize || 25)
  const rows = paginate ? pageItems : sorted

  const toggleSort = (key: string) =>
    setSort((s) =>
      s?.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : null
    )

  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-card shadow-sm", className)}>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/20 hover:bg-muted/20">
              {columns.map((col) => {
                const sortable = !!col.sortValue
                const active = sort?.key === col.key
                return (
                  <TableHead
                    key={col.key}
                    className={cn("text-xs font-medium uppercase tracking-wide text-muted-foreground", alignClass(col.align), col.className)}
                  >
                    <button
                      type="button"
                      disabled={!sortable}
                      onClick={sortable ? () => toggleSort(col.key) : undefined}
                      className={cn(
                        "inline-flex items-center gap-1.5",
                        col.align === "right" && "flex-row-reverse",
                        sortable && "transition-colors hover:text-foreground",
                        !sortable && "cursor-default"
                      )}
                    >
                      {col.icon}
                      <span>{col.header}</span>
                      {sortable && (
                        active
                          ? (sort!.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)
                          : <ChevronsUpDown className="size-3 opacity-40" />
                      )}
                    </button>
                  </TableHead>
                )
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="py-12 text-center text-sm text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const clickable = Boolean(onRowClick) && (isRowClickable?.(row) ?? true)
                return (
                <TableRow
                  key={rowKey(row)}
                  onClick={clickable ? () => onRowClick?.(row) : undefined}
                  className={cn(clickable && "cursor-pointer")}
                >
                  {columns.map((col) => (
                    <TableCell key={col.key} className={cn(alignClass(col.align), col.className)}>
                      {col.render(row)}
                    </TableCell>
                  ))}
                </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {paginate && (
        <DataTablePagination
          page={page}
          pageCount={pageCount}
          pageSize={ps}
          total={total}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          pageSizes={pageSizes}
        />
      )}
    </div>
  )
}
