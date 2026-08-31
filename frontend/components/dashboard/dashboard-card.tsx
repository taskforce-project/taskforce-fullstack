"use client"

import { useState, type ComponentType } from "react"
import dynamic from "next/dynamic"
import { toast } from "sonner"
import type { DraggableAttributes, DraggableSyntheticListeners } from "@dnd-kit/core"

import type { DashboardCard, DashboardCardSize } from "@/lib/api/dashboard-card-service"
import { useDashboardCardsStore } from "@/lib/store/dashboard-cards-store"
import { Skeleton } from "@/components/ui/skeleton"
import { CARD_REGISTRY, cardTitle, type DashboardCardBodyProps, type GlobalRange } from "./card-registry"
import { CardShell } from "./card-shell"
import { CardEmpty } from "./card-states"
import { AiUsageCard } from "./cards/ai-usage-card"
import { KpiCard, KpiOpenCard } from "./cards/kpi-card"
import { NeedsAttentionCard } from "./cards/needs-attention-card"
import { OpsHealthCard } from "./cards/ops-health-card"
import { WorkloadCard } from "./cards/workload-card"

// Cartes à base de Recharts chargées À LA DEMANDE : Recharts (lourd) sort du bundle critique du
// dashboard → moins de JS d'hydratation → le H1 « Pick up… » (élément LCP mesuré) s'affiche plus tôt.
// Fallback = squelette ; les corps gèrent ensuite leur propre chargement de données par-dessus.
const ChartFallback = () => <Skeleton className="h-[180px] w-full rounded-md" />
const ThroughputCard = dynamic(() => import("./cards/throughput-card").then((m) => m.ThroughputCard), {
  loading: ChartFallback,
  ssr: false,
})
const BurndownCard = dynamic(() => import("./cards/burndown-card").then((m) => m.BurndownCard), {
  loading: ChartFallback,
  ssr: false,
})
const AiChartCard = dynamic(() => import("./cards/ai-chart-card").then((m) => m.AiChartCard), {
  loading: ChartFallback,
  ssr: false,
})

/** Corps de carte par type - tous branchés sur des endpoints réels. */
const CARD_BODIES: Readonly<Record<string, ComponentType<DashboardCardBodyProps>>> = {
  "ops-health": OpsHealthCard,
  "throughput": ThroughputCard,
  "needs-attention": NeedsAttentionCard,
  "ai-usage": AiUsageCard,
  "kpi-resolved": KpiCard,
  "kpi-velocity": KpiCard,
  "kpi-open": KpiOpenCard,
  "burndown": BurndownCard,
  "workload": WorkloadCard,
  "ai-chart": AiChartCard,
}

interface DashboardCardItemProps {
  readonly slug: string
  readonly card: DashboardCard
  readonly globalRange: GlobalRange
  readonly refreshToken: number
  readonly dragAttributes?: DraggableAttributes
  readonly dragListeners?: DraggableSyntheticListeners
  readonly isDragging?: boolean
}

/** Une carte du dashboard : shell commun (menu ⋯) + corps selon le type. */
export function DashboardCardItem({
  slug,
  card,
  globalRange,
  refreshToken,
  dragAttributes,
  dragListeners,
  isDragging,
}: DashboardCardItemProps) {
  const patchCard = useDashboardCardsStore((s) => s.patchCard)
  const removeCard = useDashboardCardsStore((s) => s.removeCard)
  // « Actualiser » de la carte : cumulé avec le refresh global de la section.
  const [localRefresh, setLocalRefresh] = useState(0)

  const def = CARD_REGISTRY[card.cardType]
  const Body = CARD_BODIES[card.cardType]
  const Icon = def?.icon
  const size: DashboardCardSize = card.config.size === "2" ? "2" : "1"

  const handleRange = async (value: string) => {
    const updated = await patchCard(slug, card.id, { timeRange: value })
    if (!updated) toast.error("Couldn't change the period")
  }

  const handleSize = async (next: DashboardCardSize) => {
    if (next === size) return
    const updated = await patchCard(slug, card.id, { config: { ...card.config, size: next } })
    if (!updated) toast.error("Couldn't resize the card")
  }

  const handleRemove = async () => {
    const ok = await removeCard(slug, card.id)
    // Le store a déjà rétabli la carte (revert visuel) - on prévient seulement.
    if (!ok) toast.error("Couldn't remove the card")
  }

  return (
    <CardShell
      title={cardTitle(card)}
      icon={Icon ? <Icon className="size-4" /> : undefined}
      size={size}
      timeRanges={def?.timeRanges}
      activeRange={card.timeRange ?? undefined}
      onRefresh={() => setLocalRefresh((n) => n + 1)}
      onChangeRange={(v) => void handleRange(v)}
      onChangeSize={(s) => void handleSize(s)}
      onRemove={() => void handleRemove()}
      dragAttributes={dragAttributes}
      dragListeners={dragListeners}
      isDragging={isDragging}
    >
      {Body ? (
        <Body slug={slug} card={card} globalRange={globalRange} refreshToken={refreshToken + localRefresh} />
      ) : (
        <CardEmpty message={`Type de carte inconnu : ${card.cardType}`} />
      )}
    </CardShell>
  )
}
