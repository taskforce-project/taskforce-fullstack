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
import { useElementWidth } from "@/hooks/use-element-width"
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
  /**
   * Dans un volet étroit, le tableau devient une liste (R141) : ce que la colonne met sur la ligne. Sans, elle n'y est
   * pas ; elle revient en pleine largeur.
   */
  readonly listCell?: (row: T) => React.ReactNode
  /** La colonne qui prend la place qui reste sur la ligne (la phrase). */
  readonly listGrow?: boolean
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

/** Sous cette largeur, un tableau devient une liste (R141 : aucun tableau dans un volet de moins de 720 px). */
const LIST_UNDER = 720
/** Une liste montre tout jusque-là : pas de pagination sous quelques dizaines de lignes. */
const LIST_WHOLE = 50

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

  const box = React.useRef<HTMLDivElement>(null)
  const width = useElementWidth(box)
  // Un tableau ne tient pas dans un volet à côté de la conversation (R141) : une ligne par chose, sans en-tête, et pas de
  // pagination sous quelques dizaines de lignes. En pleine largeur, le tableau revient, avec son tri.
  const asList = width > 0 && width < LIST_UNDER && columns.some((c) => c.listCell)

  const paginate = pageSize > 0 && !(asList && sorted.length <= LIST_WHOLE)
  const { page, setPage, pageSize: ps, setPageSize, pageCount, pageItems, total } = usePagination(sorted, pageSize || 25)
  const rows = paginate ? pageItems : sorted

  const toggleSort = (key: string) =>
    setSort((s) =>
      s?.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : null
    )

  if (asList) {
    return (
      <div ref={box} className={className}>
        {rows.length === 0 ? (
          <p className="px-2.5 py-2 text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <ul className="flex flex-col">
            {rows.map((row) => {
              const clickable = Boolean(onRowClick) && (isRowClickable?.(row) ?? true)
              return (
                <li
                  key={rowKey(row)}
                  role={clickable ? "button" : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  onClick={clickable ? () => onRowClick?.(row) : undefined}
                  onKeyDown={clickable ? (e) => { if (e.key === "Enter") onRowClick?.(row) } : undefined}
                  className={cn(
                    "flex h-9 items-center gap-2 rounded-md px-2.5 text-sm transition-colors duration-150 motion-reduce:transition-none",
                    clickable && "cursor-pointer hover:bg-muted",
                  )}
                >
                  {columns.filter((col) => col.listCell).map((col) => (
                    <span key={col.key} className={cn("min-w-0", col.listGrow ? "flex-1 truncate" : "shrink-0")}>
                      {col.listCell?.(row)}
                    </span>
                  ))}
                </li>
              )
            })}
          </ul>
        )}
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

  return (
    <div ref={box} className={cn("overflow-hidden rounded-xl border border-border bg-card shadow-sm", className)}>
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
