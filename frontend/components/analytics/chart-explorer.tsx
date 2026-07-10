"use client"

import { useEffect, useId, useState } from "react"
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts"
import {
  Activity, TrendingDown, Users, CalendarRange, Sparkles, Loader2,
  Maximize2, AlertCircle, Send, Lock,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { WorkloadHeatmap } from "@/components/analytics/workload-heatmap"
import {
  getAnalyticsThroughput, getAnalyticsBurndown, getAnalyticsCapacity, getAnalyticsWorkload,
  generateChart,
  type ChartSpec, type Workload,
} from "@/lib/api/analytics-service"

// ─── Métadonnées de séries ──────────────────────────────────────────────────
// Le libellé et la couleur d'une série vivent ici (le backend n'envoie que la clé).

const SERIES_META: Record<string, { label: string; color: string }> = {
  resolved:   { label: "Résolues",        color: "var(--chart-1)" },
  opened:     { label: "Ouvertes",        color: "var(--chart-2)" },
  remaining:  { label: "Restant",         color: "var(--chart-1)" },
  ideal:      { label: "Idéal",           color: "var(--chart-2)" },
  openIssues: { label: "Issues ouvertes", color: "var(--chart-1)" },
}

const DATASET_XKEY: Record<string, string> = {
  throughput: "week",   // ThroughputPoint.week sert de libellé, quel que soit le bucket
  burndown:   "day",
  capacity:   "name",   // dérivé (displayName)
}

const TOOLTIP_STYLE: React.CSSProperties = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  fontSize: 12,
  color: "var(--popover-foreground)",
}

const seriesLabel = (key: string) => SERIES_META[key]?.label ?? key
const seriesColor = (key: string) => SERIES_META[key]?.color ?? "var(--chart-1)"

// ─── Catalogue (sidebar du modal) ────────────────────────────────────────────
// Presets sur données réelles — aucun n'appelle l'IA, ils cadrent des séries connues.

interface Preset {
  id: string
  label: string
  icon: React.ElementType
  spec: ChartSpec
}

function preset(id: string, label: string, icon: React.ElementType, spec: Partial<ChartSpec>): Preset {
  return {
    id, label, icon,
    spec: {
      title: label, description: "", dataset: null, chartType: null, bucket: null,
      series: [], unsupported: null, ...spec,
    },
  }
}

const PRESETS: Preset[] = [
  preset("throughput-week", "Débit hebdomadaire", Activity,
    { dataset: "throughput", chartType: "area", bucket: "week", series: ["resolved", "opened"] }),
  preset("throughput-day", "Débit quotidien (30 j)", Activity,
    { dataset: "throughput", chartType: "area", bucket: "day", series: ["resolved", "opened"] }),
  preset("burndown", "Burndown du sprint", TrendingDown,
    { dataset: "burndown", chartType: "line", series: ["remaining", "ideal"] }),
  preset("capacity", "Charge par membre", Users,
    { dataset: "capacity", chartType: "bar", series: ["openIssues"] }),
  preset("workload", "Charge de l'équipe (14 j)", CalendarRange,
    { dataset: "workload", chartType: null, series: [] }),
]

// ─── Chargement des données réelles d'une spec ────────────────────────────────

type ChartRow = Record<string, string | number>

function useChartData(slug: string, projectId: number | null, spec: ChartSpec) {
  const [rows, setRows] = useState<ChartRow[]>([])
  const [workload, setWorkload] = useState<Workload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  const dataset = spec.dataset
  const bucket = spec.bucket

  useEffect(() => {
    if (!slug || !dataset) return
    let alive = true

    // Le fetch vit dans une fonction async (callback) : les setState n'y sont pas appelés
    // synchronement dans le corps de l'effet (évite les rendus en cascade).
    const load = async () => {
      setLoading(true)
      setError(false)
      try {
        if (dataset === "throughput") {
          const d = await getAnalyticsThroughput(slug, projectId, bucket ?? "week")
          if (alive) setRows(d as unknown as ChartRow[])
        } else if (dataset === "burndown") {
          const d = await getAnalyticsBurndown(slug, projectId)
          if (alive) setRows(d as unknown as ChartRow[])
        } else if (dataset === "capacity") {
          const d = await getAnalyticsCapacity(slug, projectId)
          if (alive) setRows(d.map((m) => ({ name: m.displayName, openIssues: m.openIssues })))
        } else if (dataset === "workload") {
          const d = await getAnalyticsWorkload(slug, 14)
          if (alive) setWorkload(d)
        }
      } catch {
        if (alive) setError(true)
      } finally {
        if (alive) setLoading(false)
      }
    }

    void load()
    return () => { alive = false }
  }, [slug, projectId, dataset, bucket])

  return { rows, workload, loading, error }
}

// ─── Rendu d'une spec ─────────────────────────────────────────────────────────

/**
 * Rend une {@link ChartSpec} depuis les vraies séries. `variant="preview"` = silhouette sans
 * axes (style dashboard, dégradé) ; `variant="full"` = axes + légende + tooltip (dans le modal).
 */
function SpecChart({
  slug, projectId, spec, variant,
}: Readonly<{ slug: string; projectId: number | null; spec: ChartSpec; variant: "preview" | "full" }>) {
  const gradientId = useId().replace(/:/g, "")
  const { rows, workload, loading, error } = useChartData(slug, projectId, spec)
  const preview = variant === "preview"
  const height = preview ? "100%" : 340

  if (spec.unsupported) {
    return (
      <Centered>
        <AlertCircle className="size-5 text-amber-500" />
        <p className="max-w-sm text-sm text-muted-foreground">{spec.unsupported}</p>
      </Centered>
    )
  }
  if (loading) return <Centered><Loader2 className="size-5 animate-spin text-muted-foreground" /></Centered>
  if (error) return <Centered><p className="text-xs text-muted-foreground">Données indisponibles</p></Centered>

  // Charge de l'équipe → heatmap (le type de graphe ne s'applique pas).
  if (spec.dataset === "workload") {
    if (preview) return <MiniHeatmap workload={workload} />
    return <WorkloadHeatmap data={workload} />
  }

  const xKey = DATASET_XKEY[spec.dataset ?? ""] ?? "name"
  const series = spec.series.length > 0 ? spec.series : Object.keys(SERIES_META)
  const margin = preview ? { top: 4, right: 0, left: 0, bottom: 0 } : { top: 8, right: 8, left: -12, bottom: 0 }

  if (rows.length === 0) return <Centered><p className="text-xs text-muted-foreground">Pas encore assez de données</p></Centered>

  const axes = !preview && (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
      <XAxis dataKey={xKey} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
      <YAxis tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
      <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--muted)" }} />
      <Legend wrapperStyle={{ fontSize: 12 }} />
    </>
  )

  if (spec.chartType === "bar") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={rows} margin={margin} barGap={3}>
          {axes}
          {series.map((key) => (
            <Bar key={key} dataKey={key} name={seriesLabel(key)} fill={seriesColor(key)} radius={[3, 3, 0, 0]} isAnimationActive={!preview} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    )
  }

  if (spec.chartType === "line") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={rows} margin={margin}>
          {axes}
          {series.map((key) => (
            <Line key={key} type="monotone" dataKey={key} name={seriesLabel(key)}
              stroke={seriesColor(key)} strokeWidth={2} strokeDasharray={key === "ideal" ? "4 4" : undefined}
              dot={false} isAnimationActive={!preview} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    )
  }

  // area (défaut) — dégradé style dashboard sur la première série.
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={rows} margin={margin}>
        <defs>
          {series.map((key, i) => (
            <linearGradient key={key} id={`${gradientId}-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={seriesColor(key)} stopOpacity={0.28} />
              <stop offset="100%" stopColor={seriesColor(key)} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        {axes}
        {series.map((key, i) => (
          <Area key={key} type="monotone" dataKey={key} name={seriesLabel(key)}
            stroke={seriesColor(key)} strokeWidth={2} fill={`url(#${gradientId}-${i})`} fillOpacity={1}
            dot={false} activeDot={{ r: 3 }} isAnimationActive={!preview} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}

function Centered({ children }: { readonly children: React.ReactNode }) {
  return <div className="flex h-full flex-col items-center justify-center gap-2 text-center">{children}</div>
}

/** Aperçu compact de la heatmap : quelques barres d'intensité, sans axes. */
function MiniHeatmap({ workload }: { readonly workload: Workload | null }) {
  const totals = (workload?.members ?? []).map((m) => m.openIssues)
  if (totals.length === 0) return <Centered><p className="text-xs text-muted-foreground/60">—</p></Centered>
  const max = Math.max(...totals, 1)
  return (
    <div className="flex h-full items-end gap-1">
      {totals.slice(0, 12).map((v, i) => (
        <div key={i} className="flex-1 rounded-t bg-[var(--chart-1)]" style={{ height: `${Math.max((v / max) * 100, 6)}%`, opacity: 0.35 + (v / max) * 0.65 }} />
      ))}
    </div>
  )
}

// ─── La carte 3-parties (style dashboard) ─────────────────────────────────────

const TRIPTYCH: ReadonlyArray<{ preset: Preset; caption: string }> = [
  { preset: PRESETS[0], caption: "résolues vs ouvertes" },
  { preset: PRESETS[2], caption: "reste à faire" },
  { preset: PRESETS[3], caption: "issues par membre" },
]

/**
 * Carte unique en 3 volets — le point d'entrée de l'exploration analytique.
 * Chaque volet est un aperçu de graphe (style dashboard, dégradé) ; cliquer ouvre le
 * modal d'exploration, pré-positionné sur le graphe cliqué.
 */
export function ChartExplorer({
  slug, projectId, gated = false, onUpgrade,
}: Readonly<{ slug: string; projectId: number | null; gated?: boolean; onUpgrade?: () => void }>) {
  const [open, setOpen] = useState(false)
  const [initialPresetId, setInitialPresetId] = useState<string>(PRESETS[0].id)

  function openAt(presetId: string) {
    if (gated) { onUpgrade?.(); return }
    setInitialPresetId(presetId)
    setOpen(true)
  }

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-3">
          <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Activity className="size-4" /> Aperçus analytiques
          </span>
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => openAt(PRESETS[0].id)}>
            {gated
              ? <><Lock className="size-3.5 text-amber-600 dark:text-amber-400" /> Pro</>
              : <><Sparkles className="size-3.5 text-primary" /> Explorer</>}
          </Button>
        </div>

        <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {TRIPTYCH.map(({ preset: p, caption }) => (
            <button
              key={p.id}
              type="button"
              onClick={() => openAt(p.id)}
              className="group flex flex-col gap-2 p-4 text-left transition-colors hover:bg-accent/40"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <p.icon className="size-3.5" /> {p.label}
                </span>
                <Maximize2 className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
              <p className="text-[11px] text-muted-foreground/70">{caption}</p>
              <div className="h-20 w-full">
                {gated
                  ? <div className="flex h-full items-center justify-center rounded-md bg-muted/50"><Lock className="size-4 text-muted-foreground/50" /></div>
                  : <SpecChart slug={slug} projectId={projectId} spec={p.spec} variant="preview" />}
              </div>
            </button>
          ))}
        </div>
      </div>

      <ChartExplorerModal
        slug={slug}
        projectId={projectId}
        open={open}
        onOpenChange={setOpen}
        initialPresetId={initialPresetId}
      />
    </>
  )
}

// ─── Le modal d'exploration ───────────────────────────────────────────────────

function ChartExplorerModal({
  slug, projectId, open, onOpenChange, initialPresetId,
}: Readonly<{
  slug: string
  projectId: number | null
  open: boolean
  onOpenChange: (open: boolean) => void
  initialPresetId: string
}>) {
  // Le graphe affiché : soit un preset du catalogue, soit une spec produite par l'IA.
  const [activeSpec, setActiveSpec] = useState<ChartSpec | null>(null)
  const [activePresetId, setActivePresetId] = useState<string | null>(null)
  const [prompt, setPrompt] = useState("")
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState(false)

  // À l'ouverture, positionner sur le preset demandé.
  useEffect(() => {
    if (!open) return
    const p = PRESETS.find((x) => x.id === initialPresetId) ?? PRESETS[0]
    setActivePresetId(p.id)
    setActiveSpec(p.spec)
    setPrompt("")
    setGenError(false)
  }, [open, initialPresetId])

  function pickPreset(p: Preset) {
    setActivePresetId(p.id)
    setActiveSpec(p.spec)
    setGenError(false)
  }

  async function runGenerate() {
    const q = prompt.trim()
    if (!q || generating) return
    setGenerating(true)
    setGenError(false)
    try {
      const spec = await generateChart(slug, q, projectId)
      setActivePresetId(null)   // on quitte les presets : c'est une spec IA
      setActiveSpec(spec)
    } catch {
      setGenError(true)
    } finally {
      setGenerating(false)
    }
  }

  const aiGenerated = activePresetId === null && activeSpec !== null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">Explorateur de graphes</DialogTitle>
        <div className="flex h-[560px] flex-col sm:flex-row">
          {/* Sidebar : catalogue + input IA */}
          <aside className="flex w-full shrink-0 flex-col border-b border-border bg-muted/30 sm:w-64 sm:border-b-0 sm:border-r">
            <div className="px-3 py-3">
              <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Catalogue</p>
              <div className="flex flex-col gap-0.5">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => pickPreset(p)}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                      activePresetId === p.id ? "bg-primary/10 text-primary" : "text-foreground hover:bg-accent/60",
                    )}
                  >
                    <p.icon className="size-4 shrink-0" /> <span className="truncate">{p.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Input IA — pousse en bas de la sidebar */}
            <div className="mt-auto border-t border-border p-3">
              <p className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Sparkles className="size-3 text-primary" /> Générer avec l&apos;IA
              </p>
              <div className="flex gap-1.5">
                <input
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); runGenerate() } }}
                  placeholder="ex. charge par membre"
                  className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:border-primary/50"
                />
                <Button size="sm" className="h-9 shrink-0 px-2.5" onClick={runGenerate} disabled={!prompt.trim() || generating}>
                  {generating ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                </Button>
              </div>
              {genError && <p className="mt-1.5 px-1 text-[11px] text-rose-500">Génération impossible, réessaie.</p>}
              <p className="mt-1.5 px-1 text-[11px] text-muted-foreground/70">Rendu depuis tes vraies données.</p>
            </div>
          </aside>

          {/* Zone principale : le graphe */}
          <div className="flex min-w-0 flex-1 flex-col p-5">
            {activeSpec && (
              <>
                <div className="mb-1 flex items-center gap-2">
                  <h2 className="text-base font-semibold text-foreground">{activeSpec.title}</h2>
                  {aiGenerated && !activeSpec.unsupported && (
                    <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                      <Sparkles className="size-2.5" /> IA
                    </span>
                  )}
                </div>
                {activeSpec.description && (
                  <p className="mb-3 text-sm text-muted-foreground">{activeSpec.description}</p>
                )}
                <div className="min-h-0 flex-1">
                  <SpecChart slug={slug} projectId={projectId} spec={activeSpec} variant="full" />
                </div>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
