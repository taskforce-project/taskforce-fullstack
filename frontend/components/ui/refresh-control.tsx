"use client"

import { useEffect, useState } from "react"
import { RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** Écart relatif entre deux instants — pure, donc sûre à appeler pendant le rendu. */
function formatSince(from: number, now: number): string {
  const seconds = Math.floor((now - from) / 1000)
  if (seconds < 15)   return "just now"
  if (seconds < 60)   return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`
  return `${Math.floor(seconds / 3600)}h ago`
}

/**
 * Libellé relatif de la dernière synchro, réévalué toutes les 30 s.
 *
 * Seul `now` est en état, alimenté par le minuteur (callback asynchrone) ; le libellé est DÉRIVÉ.
 * Le rendu reste donc pur — pas de `Date.now()` pendant le rendu — et aucun état n'est
 * réinitialisé depuis un effet.
 */
function useSyncedLabel(lastSyncAt: number | null): string | null {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (lastSyncAt === null) return
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [lastSyncAt])

  // Juste après un refresh, `lastSyncAt` peut devancer `now` (le minuteur n'a pas encore tiré) :
  // l'écart est alors négatif et retombe naturellement sur « just now ».
  return lastSyncAt === null ? null : formatSince(lastSyncAt, now)
}

/**
 * État de synchro + rafraîchissement manuel — <b>même contrôle sur toutes les vues de flux</b>
 * (Signal Center, Ma file…).
 *
 * Le libellé seul ne suffit pas : afficher « à jour il y a 2 min » sans offrir le moyen
 * d'actualiser laisse l'utilisateur devant une information périmée et sans recours. Ici le
 * libellé qualifie une action disponible.
 */
export function RefreshControl({
  lastSyncAt,
  onRefresh,
  className,
}: {
  readonly lastSyncAt: number | null
  readonly onRefresh: () => Promise<void>
  readonly className?: string
}) {
  const [refreshing, setRefreshing] = useState(false)
  const synced = useSyncedLabel(lastSyncAt)

  async function handleRefresh() {
    setRefreshing(true)
    try {
      // Durée minimale de spin (~550 ms) : un refresh instantané (données en cache / API rapide) ne
      // laissait pas voir l'animation → l'utilisateur ne « sentait » pas que ça s'était rechargé.
      await Promise.all([onRefresh(), new Promise((resolve) => setTimeout(resolve, 550))])
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {synced && <span className="hidden text-xs text-muted-foreground sm:inline">Updated {synced}</span>}
      <Button
        variant="outline" size="sm" className="gap-1.5"
        onClick={() => void handleRefresh()}
        disabled={refreshing}
      >
        <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
        Refresh
      </Button>
    </div>
  )
}
