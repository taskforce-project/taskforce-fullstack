"use client"

import { useEffect, useMemo, useState } from "react"

/**
 * Pagination client-side réutilisable (QA Q-06).
 * Tranche une liste déjà filtrée/triée et expose l'état de page.
 */
export function usePagination<T>(items: readonly T[], initialSize = 25) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(initialSize)

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))

  // Re-clamp si la liste rétrécit (filtre, suppression…) ou si pageSize change.
  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize
    return items.slice(start, start + pageSize)
  }, [items, page, pageSize])

  return {
    page,
    setPage,
    pageSize,
    setPageSize: (size: number) => { setPageSize(size); setPage(1) },
    pageCount,
    pageItems,
    total: items.length,
  }
}
