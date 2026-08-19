"use client"

import type { DashboardCardBodyProps } from "../card-registry"
import { CardEmpty } from "../card-states"
import { DashboardSpecChart } from "../spec-chart"

/**
 * Graphe généré par l'IA : rend `config.spec` depuis les données réelles.
 * breakdown → runBreakdown ré-exécuté ; timeseries → dataset rechargé ; unsupported → message.
 */
export function AiChartCard({ slug, card, refreshToken }: DashboardCardBodyProps) {
  const spec = card.config.spec
  if (!spec) return <CardEmpty message="No chart spec attached to this card" />

  return (
    <div className="flex h-full flex-col p-4 pb-2">
      {spec.description && (
        <p className="mb-2 line-clamp-1 text-[11px] text-muted-foreground">{spec.description}</p>
      )}
      <div className="min-h-0 w-full flex-1">
        <DashboardSpecChart slug={slug} spec={spec} refreshToken={refreshToken} />
      </div>
    </div>
  )
}
