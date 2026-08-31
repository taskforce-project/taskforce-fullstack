"use client"

import { useMemo, useState } from "react"

/**
 * Pagination client-side réutilisable (QA Q-06).
 * Tranche une liste déjà filtrée/triée et expose l'état de page.
 */
export function usePagination<T>(items: readonly T[], initialSize = 25) {
  const [requestedPage, setRequestedPage] = useState(1)
  const [pageSize, setPageSize] = useState(initialSize)

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))

  // La page est bornée **pendant le rendu** plutôt que corrigée dans un effet : quand la liste
  // rétrécit (filtre, suppression…) l'affichage est juste dès la première passe, sans le rendu en
  // cascade qu'imposait le `setPage` en effet.
  // Effet de bord voulu : la page demandée est conservée telle quelle. Si l'utilisateur est page 5,
  // filtre jusqu'à 2 pages puis retire le filtre, il retrouve la page 5 au lieu de rester bloqué
  // page 2 - le filtre était temporaire, la position de lecture ne devrait pas l'être.
  const page = Math.min(requestedPage, pageCount)

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize
    return items.slice(start, start + pageSize)
  }, [items, page, pageSize])

  return {
    page,
    setPage: setRequestedPage,
    pageSize,
    setPageSize: (size: number) => { setPageSize(size); setRequestedPage(1) },
    pageCount,
    pageItems,
    total: items.length,
  }
}
