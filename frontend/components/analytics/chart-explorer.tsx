"use client"

import { useCallback, useEffect, useId, useState } from "react"
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts"
import {
  Activity, TrendingDown, Users, CalendarRange, Sparkles, Loader2,
  Maximize2, AlertCircle, Send, Lock, X, FolderKanban, Pin, Trash2, BarChart3, Box,
} from "lucide-react"

import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerClose, DrawerTitle, DrawerDescription } from "@/components/ui/drawer"
import { WorkloadHeatmap } from "@/components/analytics/workload-heatmap"
import { Bars3D } from "@/components/analytics/bars-3d"
import {
  getAnalyticsThroughput, getAnalyticsBurndown, getAnalyticsCapacity, getAnalyticsWorkload,
  generateChart, runBreakdown, listSavedCharts, saveChart, deleteSavedChart,
  type ChartSpec, type Workload, type NamedValue, type SavedChart,
} from "@/lib/api/analytics-service"
import { listProjects } from "@/lib/api/project-service"

// ─── Métadonnées de séries ──────────────────────────────────────────────────
// Le libellé et la couleur d'une série vivent ici (le backend n'envoie que la clé).

// Palette sémantique explicite (le thème garde ses --chart-* en niveaux de gris ; ici on veut
// des séries distinctes et colorées, lisibles en clair comme en sombre).
const SERIES_META: Record<string, { label: string; color: string }> = {
  resolved:   { label: "Resolved",        color: "#10b981" },  // emerald - terminé
  opened:     { label: "Opened",        color: "#3b82f6" },  // blue - entrant
  remaining:  { label: "Remaining",         color: "#f43f5e" },  // rose - reste à faire
  ideal:      { label: "Ideal",           color: "#94a3b8" },  // slate - repère (pointillé)
  openIssues: { label: "Open issues", color: "#6366f1" },  // indigo - charge
  completion: { label: "Completion (%)",  color: "#6366f1" },  // indigo - % de complétion projet
  done:       { label: "Done",       color: "#10b981" },  // emerald
  open:       { label: "Open",        color: "#f59e0b" },  // amber
}

/** Palette de repli pour une série hors catalogue (rotation stable). */
const FALLBACK_COLORS = ["#3b82f6", "#10b981", "#f43f5e", "#6366f1", "#f59e0b", "#14b8a6"]

const DATASET_XKEY: Record<string, string> = {
  throughput: "week",   // ThroughputPoint.week sert de libellé, quel que soit le bucket
  burndown:   "day",
  capacity:   "name",   // dérivé (displayName)
  projects:   "name",   // nom du projet
}

const seriesLabel = (key: string) => SERIES_META[key]?.label ?? key
const seriesColor = (key: string, index = 0) => SERIES_META[key]?.color ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length]

// ─── Catalogue (sidebar du modal) ────────────────────────────────────────────
// Presets sur données réelles - aucun n'appelle l'IA, ils cadrent des séries connues.

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
      title: label, description: "", mode: "timeseries", dataset: null, chartType: null, bucket: null,
      series: [], data: null, dimension: null, measure: null, scope: null,
      xLabel: null, yLabel: null, unsupported: null, suggestions: [], ...spec,
    },
  }
}

const PRESETS: Preset[] = [
  preset("throughput-week", "Weekly throughput", Activity,
    { dataset: "throughput", chartType: "area", bucket: "week", series: ["resolved", "opened"] }),
  preset("throughput-day", "Daily throughput (30 days)", Activity,
    { dataset: "throughput", chartType: "area", bucket: "day", series: ["resolved", "opened"] }),
  preset("burndown", "Sprint burndown", TrendingDown,
    { dataset: "burndown", chartType: "line", series: ["remaining", "ideal"] }),
  preset("capacity", "Workload per member", Users,
    { dataset: "capacity", chartType: "bar", series: ["openIssues"] }),
  preset("workload", "Team workload (14 days)", CalendarRange,
    { dataset: "workload", chartType: null, series: [] }),
  preset("projects", "Project progress", FolderKanban,
    { dataset: "projects", chartType: "bar", series: ["completion"] }),
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
        } else if (dataset === "projects") {
          // Comparaison workspace : avancement (%) + volumes par projet. Ignore le filtre projet.
          const d = await listProjects(slug)
          if (alive) setRows(d.map((p) => ({
            name: p.name,
            completion: p.totalIssues > 0 ? Math.round(((p.totalIssues - p.openIssues) / p.totalIssues) * 100) : 0,
            done: p.totalIssues - p.openIssues,
            open: p.openIssues,
          })))
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

// ─── Tooltip riche (partagé) ──────────────────────────────────────────────────

interface TooltipEntry {
  dataKey?: string | number
  name?: string
  value?: number | string
  color?: string
  fill?: string
  stroke?: string
}

/** Carte de tooltip détaillée : la catégorie en tête, puis chaque série avec sa pastille couleur. */
function ChartTooltip({
  active, payload, label,
}: Readonly<{ active?: boolean; payload?: TooltipEntry[]; label?: string | number }>) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      {label != null && <p className="mb-1.5 font-medium text-popover-foreground">{label}</p>}
      <div className="flex flex-col gap-1">
        {payload.map((entry) => (
          <div key={String(entry.dataKey)} className="flex items-center gap-2">
            <span className="size-2 shrink-0 rounded-full" style={{ background: entry.color ?? entry.fill ?? entry.stroke ?? "var(--chart-1)" }} />
            <span className="text-muted-foreground">{entry.name}</span>
            <span className="ml-3 font-semibold tabular-nums text-popover-foreground">
              {typeof entry.value === "number" ? entry.value.toLocaleString("en-US") : entry.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Rendu d'une spec ─────────────────────────────────────────────────────────

/**
 * Rend une {@link ChartSpec} depuis les vraies séries. `variant="preview"` = silhouette sans
 * axes (style dashboard, dégradé) ; `variant="full"` = axes + légende cliquable + tooltip riche +
 * surlignage au survol (dans le sheet).
 */
function SpecChart({
  slug, projectId, spec, variant, threeD = false, onSuggestion,
}: Readonly<{ slug: string; projectId: number | null; spec: ChartSpec; variant: "preview" | "full"; threeD?: boolean; onSuggestion?: (prompt: string) => void }>) {
  const gradientId = useId().replace(/:/g, "")
  const { rows, workload, loading, error } = useChartData(slug, projectId, spec)
  const preview = variant === "preview"
  const height = "100%"   // rempli par le conteneur (aperçu compact, ou pane du sheet plein écran)

  // Légende interactive : cliquer une série la masque / la réaffiche.
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const toggleSeries = (key: string) => setHidden((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })

  if (spec.unsupported) {
    return (
      <Centered>
        <AlertCircle className="size-5 text-amber-500" />
        <p className="max-w-md text-sm text-muted-foreground">{spec.unsupported}</p>
        {onSuggestion && spec.suggestions.length > 0 && (
          <div className="mt-2 flex flex-col items-center gap-2">
            <p className="text-xs font-medium text-muted-foreground">Try instead:</p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {spec.suggestions.map((s) => (
                <button
                  key={s.prompt}
                  type="button"
                  onClick={() => onSuggestion(s.prompt)}
                  className="flex items-center gap-1 rounded-full border border-primary/30 bg-primary/[0.06] px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                >
                  <Sparkles className="size-3" /> {s.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </Centered>
    )
  }

  // Répartition « X par Y » : données déjà calculées en base (mode breakdown).
  if (spec.mode === "breakdown") {
    return <BreakdownChart slug={slug} spec={spec} preview={preview} threeD={threeD} />
  }

  if (loading) return <Centered><Loader2 className="size-5 animate-spin text-muted-foreground" /></Centered>
  if (error) return <Centered><p className="text-xs text-muted-foreground">Data unavailable</p></Centered>

  // Charge de l'équipe → heatmap (le type de graphe ne s'applique pas).
  if (spec.dataset === "workload") {
    if (preview) return <MiniHeatmap workload={workload} />
    return <WorkloadHeatmap data={workload} />
  }

  const xKey = DATASET_XKEY[spec.dataset ?? ""] ?? "name"
  const series = spec.series.length > 0 ? spec.series : Object.keys(SERIES_META)
  // Marges pleines : de la place pour les axes (gauche/bas) et la légende - sinon ils sont rognés.
  const margin = preview ? { top: 4, right: 0, left: 0, bottom: 0 } : { top: 12, right: 20, left: 4, bottom: 4 }

  if (rows.length === 0) return <Centered><p className="text-xs text-muted-foreground">Not enough data yet</p></Centered>

  // Grille (les deux sens, subtile), axes, tooltip riche, légende cliquable.
  const legendClick = (data: { dataKey?: unknown }) => {
    const key = data.dataKey
    if (typeof key === "string" || typeof key === "number") toggleSeries(String(key))
  }
  // ⚠️ Recharts n'inspecte QUE ses enfants directs (et les tableaux, qu'il aplatit) pour repérer
  // grille/axes/légende/tooltip - il n'entre PAS dans un <Fragment>. On renvoie donc un *tableau*
  // d'éléments (surtout pas un <>…</>) : sinon Grid/XAxis/YAxis/Tooltip/Legend sont ignorés et le
  // graphe sort « nu » (courbes seules, ni grille ni survol). C'était la cause du « pas de tooltip ».
  const axes = preview ? null : [
    <CartesianGrid key="grid" strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.7} />,
    <XAxis key="x" dataKey={xKey} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />,
    <YAxis key="y" tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} allowDecimals={false} />,
    <Tooltip key="tip" content={<ChartTooltip />} cursor={{ fill: "var(--muted)", fillOpacity: 0.4 }} />,
    <Legend key="legend" wrapperStyle={{ fontSize: 12, cursor: "pointer" }} onClick={legendClick} />,
  ]

  if (spec.chartType === "bar") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={rows} margin={margin} barGap={3}>
          {axes}
          {series.map((key, i) => (
            <Bar key={key} dataKey={key} name={seriesLabel(key)} fill={seriesColor(key, i)} radius={[3, 3, 0, 0]}
              hide={hidden.has(key)} activeBar={{ stroke: "var(--foreground)", strokeWidth: 1 }} isAnimationActive={!preview} />
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
          {series.map((key, i) => (
            <Line key={key} type="monotone" dataKey={key} name={seriesLabel(key)}
              stroke={seriesColor(key, i)} strokeWidth={2} strokeDasharray={key === "ideal" ? "4 4" : undefined}
              hide={hidden.has(key)} dot={false} activeDot={{ r: 5, strokeWidth: 2 }} isAnimationActive={!preview} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    )
  }

  // area (défaut) - dégradé style dashboard sur la première série.
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={rows} margin={margin}>
        <defs>
          {series.map((key, i) => (
            <linearGradient key={key} id={`${gradientId}-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={seriesColor(key, i)} stopOpacity={0.3} />
              <stop offset="100%" stopColor={seriesColor(key, i)} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        {axes}
        {series.map((key, i) => (
          <Area key={key} type="monotone" dataKey={key} name={seriesLabel(key)}
            stroke={seriesColor(key, i)} strokeWidth={2} fill={`url(#${gradientId}-${i})`} fillOpacity={1}
            hide={hidden.has(key)} dot={false} activeDot={{ r: 5, strokeWidth: 2 }} isAnimationActive={!preview} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}

function Centered({ children }: { readonly children: React.ReactNode }) {
  return <div className="flex h-full flex-col items-center justify-center gap-2 text-center">{children}</div>
}

/**
 * Rend une répartition « X par Y » (mode breakdown) - une série `value` par catégorie `label`.
 * Les points arrivent avec le spec (génération IA) ; pour un graphe **épinglé** (spec sans data,
 * mais avec dimension/measure/scope), on ré-exécute la requête pour des données à jour.
 */
function BreakdownChart({
  slug, spec, preview, threeD = false,
}: Readonly<{ slug: string; spec: ChartSpec; preview: boolean; threeD?: boolean }>) {
  const [fetched, setFetched] = useState<NamedValue[] | null>(null)
  const [loading, setLoading] = useState(false)
  const needsFetch = (!spec.data || spec.data.length === 0) && spec.dimension != null

  useEffect(() => {
    if (!needsFetch || !slug || !spec.dimension) return
    let alive = true
    const load = async () => {
      setLoading(true)
      try {
        const fresh = await runBreakdown(slug, spec.dimension!, spec.measure, spec.scope)
        if (alive) setFetched(fresh.data ?? [])
      } catch {
        if (alive) setFetched([])
      } finally {
        if (alive) setLoading(false)
      }
    }
    void load()
    return () => { alive = false }
  }, [needsFetch, slug, spec.dimension, spec.measure, spec.scope])

  if (loading) return <Centered><Loader2 className="size-5 animate-spin text-muted-foreground" /></Centered>
  const data = fetched ?? spec.data ?? []
  if (data.length === 0) {
    return <Centered><p className="text-xs text-muted-foreground">No data for this breakdown</p></Centered>
  }
  const color = "#6366f1"
  const yName = spec.yLabel ?? "Value"

  // Vue 3D (barres) - Three.js, interactive (rotation + survol).
  if (threeD && !preview && spec.chartType !== "line") {
    return <Bars3D data={data} color={color} yLabel={yName} />
  }
  const margin = preview ? { top: 4, right: 0, left: 0, bottom: 0 } : { top: 12, right: 20, left: 4, bottom: 4 }
  // Tableau (pas de <Fragment>) : recharts n'unwrappe pas les fragments - cf. SpecChart.
  const axes = preview ? null : [
    <CartesianGrid key="grid" strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.7} vertical={false} />,
    <XAxis key="x" dataKey="label" tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false}
      interval={0} angle={data.length > 6 ? -20 : 0} textAnchor={data.length > 6 ? "end" : "middle"} height={data.length > 6 ? 48 : 24} />,
    <YAxis key="y" tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} allowDecimals={false} />,
    <Tooltip key="tip" content={<ChartTooltip />} cursor={{ fill: "var(--muted)", fillOpacity: 0.4 }} />,
    <Legend key="legend" wrapperStyle={{ fontSize: 12 }} />,
  ]

  if (spec.chartType === "line") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={margin}>
          {axes}
          <Line type="monotone" dataKey="value" name={yName} stroke={color} strokeWidth={2}
            dot={!preview} activeDot={{ r: 5, strokeWidth: 2 }} isAnimationActive={!preview} />
        </LineChart>
      </ResponsiveContainer>
    )
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={margin}>
        {axes}
        <Bar dataKey="value" name={yName} fill={color} radius={[3, 3, 0, 0]}
          activeBar={{ stroke: "var(--foreground)", strokeWidth: 1 }} isAnimationActive={!preview} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Aperçu compact de la heatmap : quelques barres d'intensité, sans axes. */
function MiniHeatmap({ workload }: { readonly workload: Workload | null }) {
  const totals = (workload?.members ?? []).map((m) => m.openIssues)
  if (totals.length === 0) return <Centered><p className="text-xs text-muted-foreground/60">-</p></Centered>
  const max = Math.max(...totals, 1)
  return (
    <div className="flex h-full items-end gap-1">
      {totals.slice(0, 12).map((v, i) => (
        <div key={i} className="flex-1 rounded-t" style={{ backgroundColor: "#6366f1", height: `${Math.max((v / max) * 100, 6)}%`, opacity: 0.35 + (v / max) * 0.65 }} />
      ))}
    </div>
  )
}

// ─── La carte 3-parties (style dashboard) ─────────────────────────────────────

const TRIPTYCH: ReadonlyArray<{ preset: Preset; caption: string }> = [
  { preset: PRESETS[0], caption: "resolved vs opened" },
  { preset: PRESETS[2], caption: "work remaining" },
  { preset: PRESETS[3], caption: "issues per member" },
]

/**
 * Carte unique en 3 volets - le point d'entrée de l'exploration analytique.
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
            <Activity className="size-4" /> Analytics previews
          </span>
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => openAt(PRESETS[0].id)}>
            {gated
              ? <><Lock className="size-3.5 text-amber-600 dark:text-amber-400" /> Pro</>
              : <><Sparkles className="size-3.5 text-primary" /> Explore</>}
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
  // Le graphe affiché : soit un preset du catalogue, soit un graphe épinglé, soit une spec IA.
  const [activeSpec, setActiveSpec] = useState<ChartSpec | null>(null)
  const [activePresetId, setActivePresetId] = useState<string | null>(null)
  const [activeSavedId, setActiveSavedId] = useState<number | null>(null)
  const [prompt, setPrompt] = useState("")
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState(false)
  const [saved, setSaved] = useState<SavedChart[]>([])
  const [pinning, setPinning] = useState(false)
  const [view3d, setView3d] = useState(false)

  const refreshSaved = useCallback(() => {
    listSavedCharts(slug).then(setSaved).catch(() => { /* non bloquant */ })
  }, [slug])

  // À l'ouverture, positionner sur le preset demandé + charger les graphes épinglés.
  useEffect(() => {
    if (!open) return
    const p = PRESETS.find((x) => x.id === initialPresetId) ?? PRESETS[0]
    setActivePresetId(p.id)
    setActiveSavedId(null)
    setActiveSpec(p.spec)
    setPrompt("")
    setGenError(false)
    setView3d(false)
    refreshSaved()
  }, [open, initialPresetId, refreshSaved])

  function pickPreset(p: Preset) {
    setActivePresetId(p.id)
    setActiveSavedId(null)
    setActiveSpec(p.spec)
    setGenError(false)
    setView3d(false)
  }

  function pickSaved(chart: SavedChart) {
    setActivePresetId(null)
    setActiveSavedId(chart.id)
    setActiveSpec(chart.spec)
    setGenError(false)
    setView3d(false)
  }

  async function runGenerate(override?: string) {
    const q = (override ?? prompt).trim()
    if (!q || generating) return
    setGenerating(true)
    setGenError(false)
    try {
      const spec = await generateChart(slug, q, projectId)
      setActivePresetId(null)   // on quitte les presets : c'est une spec IA
      setActiveSavedId(null)
      setActiveSpec(spec)
      setView3d(false)
    } catch {
      setGenError(true)
    } finally {
      setGenerating(false)
    }
  }

  async function pinActive() {
    if (!activeSpec || pinning) return
    setPinning(true)
    try {
      const chart = await saveChart(slug, activeSpec.title || "Chart", activeSpec)
      toast.success("Chart pinned to 'Custom'")
      setSaved((s) => [chart, ...s])
      setActivePresetId(null)
      setActiveSavedId(chart.id)
    } catch {
      toast.error("Could not pin the chart")
    } finally {
      setPinning(false)
    }
  }

  async function removeSaved(id: number) {
    try {
      await deleteSavedChart(slug, id)
      setSaved((s) => s.filter((c) => c.id !== id))
      if (activeSavedId === id) pickPreset(PRESETS[0])
    } catch {
      toast.error("Could not delete the chart")
    }
  }

  const aiGenerated = activePresetId === null && activeSavedId === null && activeSpec !== null
  // Épinglable : UNIQUEMENT les graphes générés par l'IA (les permanents sont déjà là, un
  // graphe déjà épinglé n'a pas à l'être deux fois).
  const canPin = aiGenerated && activeSpec !== null && activeSpec.mode !== "unsupported"
  // Vue 3D proposée pour les répartitions en barres (une valeur par catégorie).
  const can3d = activeSpec !== null && activeSpec.mode === "breakdown" && activeSpec.chartType !== "line"

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="bottom">
      <DrawerContent className="h-[80vh]">
        {/* Barre de titre du sheet (la poignée est rendue par DrawerContent). */}
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 pb-3 pt-1">
          <div className="flex items-center gap-2">
            <Activity className="size-4 text-primary" />
            <DrawerTitle className="text-sm">Chart explorer</DrawerTitle>
            <DrawerDescription className="sr-only">
              Chart catalog and AI generation, rendered from real data.
            </DrawerDescription>
          </div>
          <DrawerClose asChild>
            <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground">
              <X className="size-4" />
            </Button>
          </DrawerClose>
        </div>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          {/* Sidebar : catalogue + input IA */}
          <aside className="flex w-full shrink-0 flex-col border-b border-border bg-muted/30 sm:w-64 sm:border-b-0 sm:border-r">
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              {/* 1) Graphes permanents (base) - toujours là, non épinglables. */}
              <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Permanent</p>
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

              {/* 2) Graphes épinglés - les graphes IA que tu as sauvegardés. Toujours visible. */}
              <p className="mt-4 flex items-center gap-1.5 px-1 pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Pin className="size-3" /> Pinned {saved.length > 0 && <span className="tabular-nums opacity-60">{saved.length}</span>}
              </p>
              {saved.length === 0 ? (
                <p className="px-2.5 py-2 text-xs leading-relaxed text-muted-foreground/70">
                  Generate a chart with AI, then click <span className="font-medium text-foreground">Pin</span> to keep it here.
                </p>
              ) : (
                <div className="flex flex-col gap-0.5">
                  {saved.map((chart) => (
                    <div
                      key={chart.id}
                      className={cn(
                        "group/item flex items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors",
                        activeSavedId === chart.id ? "bg-primary/10 text-primary" : "text-foreground hover:bg-accent/60",
                      )}
                    >
                      <button type="button" onClick={() => pickSaved(chart)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                        <BarChart3 className="size-4 shrink-0" /> <span className="truncate">{chart.title}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => removeSaved(chart.id)}
                        className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-rose-500 group-hover/item:opacity-100"
                        title="Remove"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Input IA - ancré en bas de la sidebar */}
            <div className="shrink-0 border-t border-border p-3">
              <p className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Sparkles className="size-3 text-primary" /> Generate with AI
              </p>
              <div className="flex gap-1.5">
                <input
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); runGenerate() } }}
                  placeholder="e.g. workload per member"
                  className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:border-primary/50"
                />
                <Button size="sm" className="h-9 shrink-0 px-2.5" onClick={() => runGenerate()} disabled={!prompt.trim() || generating}>
                  {generating ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                </Button>
              </div>
              {genError && <p className="mt-1.5 px-1 text-[11px] text-rose-500">Generation failed, try again.</p>}
              <p className="mt-1.5 px-1 text-[11px] text-muted-foreground/70">Rendered from your real data.</p>
            </div>
          </aside>

          {/* Zone principale : le graphe */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col p-5">
            {activeSpec && (
              <>
                <div className="mb-1 flex items-center gap-2">
                  <h2 className="text-base font-semibold text-foreground">{activeSpec.title}</h2>
                  {aiGenerated && !activeSpec.unsupported && (
                    <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                      <Sparkles className="size-2.5" /> AI
                    </span>
                  )}
                  <div className="ml-auto flex shrink-0 items-center gap-1.5">
                    {can3d && (
                      <div className="flex rounded-lg border border-border bg-background p-0.5">
                        {([["2D", false], ["3D", true]] as const).map(([lbl, val]) => (
                          <button
                            key={lbl}
                            type="button"
                            onClick={() => setView3d(val)}
                            className={cn(
                              "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                              view3d === val ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
                            )}
                          >
                            {val && <Box className="size-3.5" />}{lbl}
                          </button>
                        ))}
                      </div>
                    )}
                    {canPin && (
                      <Button
                        variant="outline" size="sm"
                        className="h-7 gap-1.5 text-xs"
                        onClick={pinActive}
                        disabled={pinning}
                        title="Pin to 'Custom' to keep it"
                      >
                        {pinning ? <Loader2 className="size-3.5 animate-spin" /> : <Pin className="size-3.5" />}
                        Pin
                      </Button>
                    )}
                  </div>
                </div>
                {activeSpec.description && (
                  <p className="mb-3 text-sm text-muted-foreground">{activeSpec.description}</p>
                )}
                {/* overflow-hidden (pas auto) : recharts mesure mal sa taille et perd le hover dans
                    un conteneur scrollable. Le heatmap gère son propre scroll en interne. */}
                <div className="min-h-0 flex-1 overflow-hidden">
                  <SpecChart
                    slug={slug} projectId={projectId} spec={activeSpec} variant="full" threeD={view3d}
                    onSuggestion={(p) => { setPrompt(p); void runGenerate(p) }}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  )
}


