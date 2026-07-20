"use client"

import { useEffect, useId, useState } from "react"
import Link from "next/link"
import { Area, AreaChart, ResponsiveContainer, Tooltip } from "recharts"

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
          Débit détaillé disponible avec un forfait supérieur
        </Link>
      </div>
    )
  }
  if (error) return <CardError onRetry={() => setRetry((n) => n + 1)} />

  const data = weekly ? points : points.slice(-windowDays)
  if (data.length === 0) return <CardEmpty />

  const totalResolved = data.reduce((s, p) => s + p.resolved, 0)
  const caption = weekly ? "Résolues · 8 semaines" : `Résolues · ${windowDays} j`

  return (
    <div className="flex h-full flex-col p-4 pb-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-2xl font-semibold tabular-nums tracking-tight">{totalResolved.toLocaleString("fr-FR")}</span>
        <span className="text-[11px] text-muted-foreground">{caption}</span>
      </div>
      <div className="mt-2 h-28 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.28} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
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
              name="Résolues"
              stroke="#3b82f6"
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              fillOpacity={1}
              dot={false}
              activeDot={{ r: 3, fill: "#3b82f6" }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
