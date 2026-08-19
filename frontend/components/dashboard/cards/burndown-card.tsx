"use client"

import { useEffect, useState } from "react"
import { Line, LineChart, ResponsiveContainer, Tooltip, YAxis } from "recharts"

import { chartBaseline } from "@/components/ui/sparkline"
import { getAnalyticsBurndown, type BurndownPoint } from "@/lib/api/analytics-service"
import type { DashboardCardBodyProps } from "../card-registry"
import { CardEmpty, CardError, CardSkeleton } from "../card-states"

/** Burndown du sprint : reste à faire (rose) vs trajectoire idéale (pointillé). */
export function BurndownCard({ slug, refreshToken }: DashboardCardBodyProps) {
  const [points, setPoints] = useState<BurndownPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    if (!slug) return
    let alive = true
    setLoading(true)
    setError(false)
    getAnalyticsBurndown(slug, null)
      .then((d) => {
        if (alive) setPoints(d)
      })
      .catch(() => {
        if (alive) {
          setPoints([])
          setError(true)
        }
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [slug, refreshToken, retry])

  if (loading) return <CardSkeleton />
  if (error) return <CardError onRetry={() => setRetry((n) => n + 1)} />
  if (points.length === 0) return <CardEmpty message="No sprint in progress" />

  const remaining = points.at(-1)?.remaining ?? 0

  // Même bande basse que les autres courbes de l'app : les tracés s'arrêtent au-dessus du bas de
  // carte au lieu de s'y coller. Pertinent ici en particulier — un burndown réussi finit à zéro,
  // et c'est précisément là que la ligne se confondrait avec le bord.
  // Pas de dégradé (deux lignes, aucun remplissage) : seule la géométrie est partagée.
  const CHART_HEIGHT = 112 // h-28
  const CHART_MARGIN_TOP = 4
  const domainMax = Math.max(1, ...points.map((p) => Math.max(p.remaining, p.ideal)))
  const baseline = chartBaseline({ height: CHART_HEIGHT, domainMax, marginTop: CHART_MARGIN_TOP })

  return (
    <div className="flex h-full flex-col p-4 pb-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-2xl font-semibold tabular-nums tracking-tight">{remaining.toLocaleString("fr-FR")}</span>
        <span className="text-[11px] text-muted-foreground">Remaining vs ideal</span>
      </div>
      <div className="mt-2 h-28 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: CHART_MARGIN_TOP, right: 0, left: 0, bottom: 0 }}>
            <YAxis hide domain={[baseline, domainMax]} />
            <Tooltip
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                fontSize: 11,
                padding: "2px 8px",
              }}
              cursor={false}
            />
            <Line
              type="monotone"
              dataKey="remaining"
              name="Restant"
              stroke="#f43f5e"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3 }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="ideal"
              name="Ideal"
              stroke="#94a3b8"
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={false}
              activeDot={{ r: 3 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
