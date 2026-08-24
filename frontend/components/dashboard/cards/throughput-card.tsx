"use client"

import { useEffect, useId, useState } from "react"
import Link from "next/link"
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from "recharts"

import { AreaGradient, chartBaseline } from "@/components/ui/sparkline"
import { getAnalyticsThroughput, type ThroughputPoint } from "@/lib/api/analytics-service"
import { GLOBAL_RANGE_DAYS, type DashboardCardBodyProps } from "../card-registry"
import { CardEmpty, CardError, CardSkeleton } from "../card-states"

/**
 * Débit de résolution — série réelle (analytics/throughput), gated par plan (409).
 * Périodes carte : « 30d » (quotidien) / « 8w » (hebdo). Sans réglage propre, la
 * période globale sert de fenêtre (série quotidienne tronquée côté client).
 */
export function ThroughputCard({ slug, card, globalRange, refreshToken }: DashboardCardBodyProps) {
  const gradientId = useId().replace(/:/g, "")
  const [points, setPoints] = useState<ThroughputPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [gated, setGated] = useState(false)
  const [retry, setRetry] = useState(0)

  const weekly = card.timeRange === "8w"
  const bucket = weekly ? "week" : "day"
  const windowDays = card.timeRange ? 30 : GLOBAL_RANGE_DAYS[globalRange]

  useEffect(() => {
    if (!slug) return
    let alive = true
    setLoading(true)
    setError(false)
    setGated(false)
    getAnalyticsThroughput(slug, null, bucket)
      .then((d) => {
        if (alive) setPoints(d)
      })
      .catch((e: unknown) => {
        if (!alive) return
        setPoints([])
        // 409 = mur de plan (FREE) — à distinguer d'un vrai manque de données.
        const status = (e as { response?: { status?: number } }).response?.status
        if (status === 409) setGated(true)
        else setError(true)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [slug, bucket, refreshToken, retry])

  if (loading) return <CardSkeleton />
  if (gated) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <Link href="./analytics" className="text-xs text-primary hover:underline">
          Detailed throughput available on a higher plan
        </Link>
      </div>
    )
  }
  if (error) return <CardError onRetry={() => setRetry((n) => n + 1)} />

  const data = weekly ? points : points.slice(-windowDays)
  if (data.length === 0) return <CardEmpty />

  const totalResolved = data.reduce((s, p) => s + p.resolved, 0)
  const caption = weekly ? "Resolved · 8 weeks" : `Resolved · ${windowDays}d`

  // Même traitement que les sparklines des opérations : le tracé s'arrête au-dessus du bas de
  // carte, l'aplat descend jusqu'à lui. Géométrie et dégradé viennent du module partagé pour que
  // toutes les courbes de l'app aient exactement le même rendu.
  const CHART_HEIGHT = 112 // h-28
  const CHART_MARGIN_TOP = 4
  const domainMax = Math.max(1, ...data.map((p) => p.resolved))
  const baseline = chartBaseline({ height: CHART_HEIGHT, domainMax, marginTop: CHART_MARGIN_TOP })

  return (
    <div className="flex h-full flex-col p-4 pb-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-2xl font-semibold tabular-nums tracking-tight">{totalResolved.toLocaleString("fr-FR")}</span>
        <span className="text-[11px] text-muted-foreground">{caption}</span>
      </div>
      <div className="mt-2 h-28 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: CHART_MARGIN_TOP, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <AreaGradient id={gradientId} color="#3b82f6" />
            </defs>
            <YAxis hide domain={[baseline, domainMax]} />
            <Tooltip
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                fontSize: 11,
                padding: "2px 8px",
              }}
              labelStyle={{ display: "none" }}
              cursor={false}
            />
            <Area
              type="monotone"
              dataKey="resolved"
              name="Resolved"
              stroke="#3b82f6"
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              fillOpacity={1}
              dot={false}
              activeDot={{ r: 3, fill: "#3b82f6" }}
              isAnimationActive={false}
              baseValue={baseline}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
