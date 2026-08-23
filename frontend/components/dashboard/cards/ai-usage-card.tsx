"use client"

import { useEffect, useState } from "react"

import type { AiUsage } from "@/lib/api/ai-usage-service"
import { getAiUsageQuiet } from "@/lib/api/dashboard-card-service"
import { TokenMeter } from "@/components/chat/token-meter"
import { cn } from "@/lib/utils"
import type { DashboardCardBodyProps } from "../card-registry"
import { CardError, CardSkeleton } from "../card-states"

const pctOf = (used: number, total: number) => (total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0)

/**
 * Consommation IA du mois vs plafond du forfait — jauge BLEUE de référence
 * (mêmes classes que la jauge de tokens Cortex / Settings « Usage IA »).
 */
export function AiUsageCard({ slug, refreshToken }: DashboardCardBodyProps) {
  const [usage, setUsage] = useState<AiUsage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    if (!slug) return
    let alive = true
    setLoading(true)
    setError(false)
    // Chargement de fond silencieux : la carte gère son propre état d'erreur.
    getAiUsageQuiet(slug)
      .then((d) => {
        if (alive) setUsage(d)
      })
      .catch(() => {
        if (alive) setError(true)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [slug, refreshToken, retry])

  if (loading) return <CardSkeleton />
  if (error || !usage) return <CardError onRetry={() => setRetry((n) => n + 1)} />

  const unlimited = usage.limitTokens < 0
  const pct = unlimited ? 0 : pctOf(usage.usedTokens, usage.limitTokens)

  return (
    <div className="flex h-full flex-col justify-center gap-3 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <TokenMeter value={usage.usedTokens} className="text-xl font-semibold tracking-tight" />
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{usage.plan}</span>
      </div>

      {/* Jauge bleue de référence — classes exactes de la jauge de tokens. */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500",
            pct >= 90
              ? "bg-rose-500"
              : pct >= 70
                ? "bg-amber-500"
                : "bg-gradient-to-r from-blue-600 to-blue-400 dark:from-blue-500 dark:to-blue-300",
          )}
          style={{ width: `${unlimited ? 4 : pct}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="tabular-nums">
          {unlimited
            ? "Unlimited"
            : `${pct}% of ${usage.limitTokens.toLocaleString("en-US")} tokens`}
        </span>
        <span className="tabular-nums">{usage.requestCount.toLocaleString("en-US")} requests</span>
      </div>
      <p className="text-[11px] text-muted-foreground/70">
        Reset on {new Date(usage.resetAt).toLocaleDateString("en-US")}
      </p>
    </div>
  )
}
