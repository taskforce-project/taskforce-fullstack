"use client"

/**
 * Rendu compact d'une {@link ChartSpec} pour le dashboard (cartes « ai-chart » et
 * aperçu du dialog d'ajout). Réimplémentation locale : le SpecChart de
 * `components/analytics/chart-explorer.tsx` n'est pas exporté.
 *
 * - `breakdown`   → ré-exécute runBreakdown pour des données FRAÎCHES (graphe épinglé) ;
 * - `timeseries`  → recharge le dataset réel référencé par la spec ;
 * - `unsupported` → message honnête, jamais de données inventées.
 */
import { useEffect, useId, useState } from "react"
import { AlertCircle, Loader2 } from "lucide-react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts"

import {
  getAnalyticsBurndown,
  getAnalyticsCapacity,
  getAnalyticsThroughput,
  getAnalyticsWorkload,
  runBreakdown,
  type ChartSpec,
  type NamedValue,
} from "@/lib/api/analytics-service"
import { listProjectsQuiet } from "@/lib/api/dashboard-card-service"
import { CardEmpty, CardError } from "./card-states"

// Palette sémantique des séries (miroir de chart-explorer — le backend n'envoie que la clé).
const SERIES_META: Record<string, { label: string; color: string }> = {
  resolved: { label: "Résolues", color: "#10b981" },
  opened: { label: "Ouvertes", color: "#3b82f6" },
  remaining: { label: "Restant", color: "#f43f5e" },
  ideal: { label: "Idéal", color: "#94a3b8" },
  openIssues: { label: "Issues ouvertes", color: "#6366f1" },
  completion: { label: "Avancement (%)", color: "#6366f1" },
  done: { label: "Terminées", color: "#10b981" },
  open: { label: "Ouvertes", color: "#f59e0b" },
}

const FALLBACK_COLORS = ["#3b82f6", "#10b981", "#f43f5e", "#6366f1", "#f59e0b", "#14b8a6"]

const DATASET_XKEY: Record<string, string> = {
  throughput: "week",
  burndown: "day",
  capacity: "name",
  projects: "name",
}

const seriesLabel = (key: string) => SERIES_META[key]?.label ?? key
const seriesColor = (key: string, index = 0) => SERIES_META[key]?.color ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length]

/** Style de tooltip compact partagé (identique au sparkline historique du dashboard). */
const TOOLTIP_STYLE = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  fontSize: 11,
  padding: "2px 8px",
} as const

type ChartRow = Record<string, string | number>

interface DashboardSpecChartProps {
  readonly slug: string
  readonly spec: ChartSpec
  /** Recharge les données quand il change. */
  readonly refreshToken?: number
  /** Aperçu d'une spec fraîchement générée : utiliser spec.data si présent (pas de re-fetch). */
  readonly preferInlineData?: boolean
}

export function DashboardSpecChart({ slug, spec, refreshToken = 0, preferInlineData = false }: DashboardSpecChartProps) {
  if (spec.mode === "unsupported" || spec.unsupported) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
        <AlertCircle className="size-4 text-amber-500" />
        <p className="text-xs text-muted-foreground">{spec.unsupported ?? "Demande non satisfiable."}</p>
      </div>
    )
  }
  if (spec.mode === "breakdown") {
    return <BreakdownBody slug={slug} spec={spec} refreshToken={refreshToken} preferInlineData={preferInlineData} />
  }
  return <TimeseriesBody slug={slug} spec={spec} refreshToken={refreshToken} />
}

// ---------------------------------------------------------------------------
// Répartition « X par Y » — ré-exécutée en base pour rester à jour
// ---------------------------------------------------------------------------

function BreakdownBody({
  slug,
  spec,
  refreshToken,
  preferInlineData,
}: Readonly<{ slug: string; spec: ChartSpec; refreshToken: number; preferInlineData: boolean }>) {
  const inline = preferInlineData && spec.data != null && spec.data.length > 0
  const canFetch = spec.dimension != null
  const [rows, setRows] = useState<NamedValue[] | null>(inline ? spec.data : null)
  const [loading, setLoading] = useState(!inline && canFetch)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    if (inline || !slug || !spec.dimension) return
    let alive = true
    setLoading(true)
    setError(false)
    runBreakdown(slug, spec.dimension, spec.measure, spec.scope)
      .then((fresh) => {
        if (alive) setRows(fresh.data ?? [])
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
  }, [inline, slug, spec.dimension, spec.measure, spec.scope, refreshToken, retry])

  if (loading) return <Centered><Loader2 className="size-4 animate-spin text-muted-foreground" /></Centered>
  if (error) return <CardError onRetry={() => setRetry((n) => n + 1)} />

  const data = rows ?? spec.data ?? []
  if (data.length === 0) return <CardEmpty message="Aucune donnée pour cette répartition" />

  const color = "#6366f1"
  const yName = spec.yLabel ?? "Valeur"
  const margin = { top: 4, right: 0, left: 0, bottom: 0 }

  if (spec.chartType === "line") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={margin}>
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={false} />
          <Line type="monotone" dataKey="value" name={yName} stroke={color} strokeWidth={2} dot={false} activeDot={{ r: 3, fill: color }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    )
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={margin} barGap={3}>
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--muted)", fillOpacity: 0.4 }} />
        <Bar dataKey="value" name={yName} fill={color} radius={[3, 3, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ---------------------------------------------------------------------------
// Timeseries — recharge le dataset réel référencé par la spec
// ---------------------------------------------------------------------------

function TimeseriesBody({ slug, spec, refreshToken }: Readonly<{ slug: string; spec: ChartSpec; refreshToken: number }>) {
  const gradientId = useId().replace(/:/g, "")
  const [rows, setRows] = useState<ChartRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)

  const dataset = spec.dataset
  const bucket = spec.bucket

  useEffect(() => {
    if (!slug || !dataset) return
    let alive = true
    const load = async () => {
      setLoading(true)
      setError(false)
      try {
        if (dataset === "throughput") {
          const d = await getAnalyticsThroughput(slug, null, bucket ?? "week")
          if (alive) setRows(d.map((p) => ({ week: p.week, opened: p.opened, resolved: p.resolved })))
        } else if (dataset === "burndown") {
          const d = await getAnalyticsBurndown(slug, null)
          if (alive) setRows(d.map((p) => ({ day: p.day, remaining: p.remaining, ideal: p.ideal })))
        } else if (dataset === "capacity") {
          const d = await getAnalyticsCapacity(slug, null)
          if (alive) setRows(d.map((m) => ({ name: m.displayName, openIssues: m.openIssues })))
        } else if (dataset === "workload") {
          // Charge par membre : la heatmap complète vit dans Intelligence — ici, total ouvert par membre.
          const w = await getAnalyticsWorkload(slug, 14)
          if (alive) setRows(w.members.map((m) => ({ name: m.displayName, openIssues: m.openIssues })))
        } else {
          // projects : avancement (%) + volumes par opération (chargement silencieux).
          const d = await listProjectsQuiet(slug)
          if (alive) {
            setRows(d.map((p) => ({
              name: p.name,
              completion: p.totalIssues > 0 ? Math.round(((p.totalIssues - p.openIssues) / p.totalIssues) * 100) : 0,
              done: p.totalIssues - p.openIssues,
              open: p.openIssues,
            })))
          }
        }
      } catch {
        if (alive) setError(true)
      } finally {
        if (alive) setLoading(false)
      }
    }
    void load()
    return () => {
      alive = false
    }
  }, [slug, dataset, bucket, refreshToken, retry])

  if (!dataset) return <CardEmpty message="Spec de graphe incomplète" />
  if (loading) return <Centered><Loader2 className="size-4 animate-spin text-muted-foreground" /></Centered>
  if (error) return <CardError onRetry={() => setRetry((n) => n + 1)} />
  if (rows.length === 0) return <CardEmpty />

  const xKey = DATASET_XKEY[dataset] ?? "name"
  const series = spec.series.length > 0 ? spec.series : Object.keys(rows[0]).filter((k) => k !== xKey)
  const margin = { top: 4, right: 0, left: 0, bottom: 0 }

  if (spec.chartType === "bar" || dataset === "capacity" || dataset === "workload") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={margin} barGap={3}>
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--muted)", fillOpacity: 0.4 }} />
          {series.map((key, i) => (
            <Bar key={key} dataKey={key} name={seriesLabel(key)} fill={seriesColor(key, i)} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    )
  }

  if (spec.chartType === "line") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={margin}>
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={false} />
          {series.map((key, i) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              name={seriesLabel(key)}
              stroke={seriesColor(key, i)}
              strokeWidth={2}
              strokeDasharray={key === "ideal" ? "4 4" : undefined}
              dot={false}
              activeDot={{ r: 3 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    )
  }

  // area (défaut) — silhouette dégradée style dashboard.
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={rows} margin={margin}>
        <defs>
          {series.map((key, i) => (
            <linearGradient key={key} id={`${gradientId}-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={seriesColor(key, i)} stopOpacity={0.3} />
              <stop offset="100%" stopColor={seriesColor(key, i)} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={false} />
        {series.map((key, i) => (
          <Area
            key={key}
            type="monotone"
            dataKey={key}
            name={seriesLabel(key)}
            stroke={seriesColor(key, i)}
            strokeWidth={2}
            fill={`url(#${gradientId}-${i})`}
            fillOpacity={1}
            dot={false}
            activeDot={{ r: 3 }}
            isAnimationActive={false}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}

function Centered({ children }: { readonly children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center">{children}</div>
}
