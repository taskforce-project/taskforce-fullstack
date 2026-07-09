"use client"

import { useState } from "react"
import { Sparkles, Loader2, AlertTriangle, Plus, Check, Compass, BrainCircuit } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Markdown } from "@/components/ui/lightweight-markdown"
import { cn } from "@/lib/utils"
import {
  getProjectDecision,
  type DecisionBrief,
  type DecisionPriority,
  type DecisionSnapshot,
} from "@/lib/api/analytics-service"
import { createIssue } from "@/lib/api/issue-service"

const LEVEL: Record<DecisionPriority["level"], { label: string; cls: string }> = {
  HIGH:   { label: "Haute",  cls: "text-rose-500 border-rose-500/30 bg-rose-500/10" },
  MEDIUM: { label: "Moyenne", cls: "text-amber-500 border-amber-500/30 bg-amber-500/10" },
  LOW:    { label: "Basse",  cls: "text-blue-500 border-blue-500/30 bg-blue-500/10" },
}

function Chip({ label, value, alert = false }: Readonly<{ label: string; value: number; alert?: boolean }>) {
  return (
    <span className={cn(
      "inline-flex items-baseline gap-1 rounded-md border px-2 py-0.5 text-xs tabular-nums",
      alert && value > 0 ? "border-rose-500/30 bg-rose-500/10 text-rose-500" : "border-border bg-background text-muted-foreground"
    )}>
      <span className={cn("font-semibold", alert && value > 0 ? "text-rose-500" : "text-foreground")}>{value}</span>
      {label}
    </span>
  )
}

function SnapshotRow({ s }: Readonly<{ s: DecisionSnapshot }>) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <Chip label="issues" value={s.total} />
      <Chip label="ouvertes" value={s.open} />
      <Chip label="en cours" value={s.inProgress} />
      <Chip label="terminées" value={s.completed} />
      <Chip label="en retard" value={s.overdue} alert />
      <Chip label="échéance ≤7j" value={s.dueSoon} alert />
    </div>
  )
}

/**
 * Decision board (boucle OODA) — aide à la décision par projet sur la page Analytics.
 * Observe (métriques réelles) → l'IA propose situation + risques + 3 priorités → l'humain
 * transforme une priorité en issue (act).
 */
export function DecisionBoard({
  slug, projectId, projectName,
}: Readonly<{ slug: string; projectId: number; projectName: string }>) {
  const [brief, setBrief] = useState<DecisionBrief | null>(null)
  const [loading, setLoading] = useState(false)
  const [created, setCreated] = useState<Record<number, boolean>>({})
  const [creating, setCreating] = useState<number | null>(null)

  async function generate(deep = false) {
    setLoading(true)
    try {
      setBrief(await getProjectDecision(slug, projectId, deep))
      setCreated({})
    } catch {
      toast.error("Impossible de générer la décision")
    } finally {
      setLoading(false)
    }
  }

  async function act(p: DecisionPriority, i: number) {
    setCreating(i)
    try {
      await createIssue(slug, projectId, { title: p.title, description: p.rationale, priority: p.level })
      setCreated((c) => ({ ...c, [i]: true }))
      toast.success("Issue créée dans le projet")
    } catch {
      toast.error("Création de l'issue échouée")
    } finally {
      setCreating(null)
    }
  }

  return (
    <section className="rounded-xl border border-primary/20 bg-primary/[0.03] p-4">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Compass className="size-4 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">Décision du jour</h3>
              {brief?.mode === "fallback" && (
                <Badge variant="secondary" className="text-[10px]">métriques seules</Badge>
              )}
            </div>
            <p className="truncate text-xs text-muted-foreground">{projectName}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => generate(false)} disabled={loading}>
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            {brief ? "Régénérer" : "Analyser le projet"}
          </Button>
          <Button
            size="sm" variant="outline"
            className="h-8 gap-1.5 text-xs"
            onClick={() => generate(true)}
            disabled={loading}
            title="14B + raisonnement — plus lent (~1-3 min), analyse plus fine"
          >
            <BrainCircuit className="size-3.5" />
            Approfondir
          </Button>
        </div>
      </header>

      {!brief && !loading && (
        <p className="mt-3 text-xs text-muted-foreground">
          L&apos;IA lit les métriques réelles du projet + le Brain OS, puis propose la situation, les risques et
          les <span className="font-medium text-foreground">3 priorités</span> de demain — que tu peux transformer en issues d&apos;un clic.
        </p>
      )}

      {loading && (
        <div className="mt-4 flex flex-col items-center gap-2 py-6 text-center">
          <Loader2 className="size-5 animate-spin text-primary" />
          <p className="text-xs text-muted-foreground">L&apos;IA analyse le projet (observe → décide)…</p>
        </div>
      )}

      {brief && !loading && (
        <div className="mt-3 flex flex-col gap-4">
          <SnapshotRow s={brief.snapshot} />

          {brief.situation && (
            <div className="text-xs leading-relaxed text-foreground">
              <Markdown content={brief.situation} />
            </div>
          )}

          {brief.risks.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <AlertTriangle className="size-3.5 text-amber-500" /> Risques
              </div>
              <ul className="flex flex-col gap-1">
                {brief.risks.map((r) => (
                  <li key={r} className="flex gap-1.5 text-xs text-muted-foreground">
                    <span className="text-amber-500">•</span>{r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground">Les 3 priorités de demain</span>
            {brief.priorities.map((p, i) => (
              <div key={p.title} className="flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
                <span className={cn("mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium", LEVEL[p.level].cls)}>
                  {LEVEL[p.level].label}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{p.title}</p>
                  {p.rationale && <p className="mt-0.5 text-xs text-muted-foreground">{p.rationale}</p>}
                </div>
                {created[i] ? (
                  <span className="mt-0.5 flex shrink-0 items-center gap-1 text-xs text-emerald-500">
                    <Check className="size-3.5" /> Créée
                  </span>
                ) : (
                  <Button
                    variant="outline" size="sm"
                    className="mt-0.5 h-7 shrink-0 gap-1 text-xs"
                    onClick={() => act(p, i)}
                    disabled={creating === i}
                  >
                    {creating === i ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
                    Créer l&apos;issue
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
