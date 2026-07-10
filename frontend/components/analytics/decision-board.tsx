"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  Sparkles, Loader2, AlertTriangle, Plus, Compass, Zap, BrainCircuit,
  Pin, PinOff, Pencil, X, Check, ExternalLink, Undo2,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Markdown } from "@/components/ui/lightweight-markdown"
import { cn } from "@/lib/utils"
import { useWorkflowStore } from "@/lib/store/workflow-store"
import { openWorkflowPanel, isActiveJob } from "@/components/workflows/workflow-dock"
import type { AnalysisDepth, StoredBrief, StoredPriority } from "@/lib/api/analysis-service"
import type { DecisionSnapshot } from "@/lib/api/analytics-service"

const LEVEL: Record<StoredPriority["level"], { label: string; cls: string }> = {
  HIGH:   { label: "Haute",   cls: "text-rose-500 border-rose-500/30 bg-rose-500/10" },
  MEDIUM: { label: "Moyenne", cls: "text-amber-500 border-amber-500/30 bg-amber-500/10" },
  LOW:    { label: "Basse",   cls: "text-blue-500 border-blue-500/30 bg-blue-500/10" },
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

/** Édition en place du titre / de la justification, avant acceptation. */
function PriorityEditor({
  priority, onCancel, onSave,
}: Readonly<{ priority: StoredPriority; onCancel: () => void; onSave: (t: string, r: string) => Promise<void> }>) {
  const [title, setTitle] = useState(priority.title)
  const [rationale, setRationale] = useState(priority.rationale)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!title.trim() || saving) return
    setSaving(true)
    await onSave(title.trim(), rationale.trim())
    setSaving(false)
  }

  return (
    <div className="min-w-0 flex-1">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm font-medium outline-none focus:border-primary/50"
      />
      <textarea
        value={rationale}
        onChange={(e) => setRationale(e.target.value)}
        rows={2}
        className="mt-1.5 w-full resize-none rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary/50"
      />
      <div className="mt-1.5 flex gap-1.5">
        <Button size="sm" className="h-7 gap-1 text-xs" onClick={save} disabled={!title.trim() || saving}>
          {saving ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />} Enregistrer
        </Button>
        <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={onCancel} disabled={saving}>
          <X className="size-3" /> Annuler
        </Button>
      </div>
    </div>
  )
}

/** Une priorité persistée : acceptable (→ issue), épinglable, éditable, écartable. */
function PriorityCard({
  slug, projectId, priority,
}: Readonly<{ slug: string; projectId: number; priority: StoredPriority }>) {
  const { accept, pin, dismissPriority, editPriority } = useWorkflowStore()
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)

  const dismissed = priority.status === "DISMISSED"
  const accepted = priority.status === "ACCEPTED"
  const pinned = priority.status === "PINNED"

  async function run(action: () => Promise<unknown>, errorMessage: string, successMessage?: string) {
    setBusy(true)
    try {
      await action()
      if (successMessage) toast.success(successMessage)
    } catch {
      toast.error(errorMessage)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={cn(
      "flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors",
      pinned ? "border-primary/40 bg-primary/[0.04]" : "border-border bg-card",
      dismissed && "opacity-50",
    )}>
      <span className={cn("mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium", LEVEL[priority.level].cls)}>
        {LEVEL[priority.level].label}
      </span>

      {editing ? (
        <PriorityEditor
          priority={priority}
          onCancel={() => setEditing(false)}
          onSave={async (title, rationale) => {
            await run(() => editPriority(slug, projectId, priority.id, { title, rationale }), "Édition impossible")
            setEditing(false)
          }}
        />
      ) : (
        <div className="min-w-0 flex-1">
          <p className={cn("text-sm font-medium text-foreground", dismissed && "line-through")}>{priority.title}</p>
          {priority.rationale && <p className="mt-0.5 text-xs text-muted-foreground">{priority.rationale}</p>}

          {accepted && priority.issueId && (
            <Link
              href={`/${slug}/projects/${projectId}?issue=${priority.issueId}`}
              className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-emerald-500 hover:underline"
            >
              <Check className="size-3" /> {priority.issueIdentifier ?? "Issue créée"}
              <ExternalLink className="size-3" />
            </Link>
          )}
        </div>
      )}

      {!editing && !accepted && (
        <div className="mt-0.5 flex shrink-0 items-center gap-0.5">
          {dismissed ? (
            <button
              type="button" disabled={busy}
              onClick={() => run(() => dismissPriority(slug, projectId, priority.id), "Action impossible")}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Réactiver la priorité"
            >
              <Undo2 className="size-3" /> Restaurer
            </button>
          ) : (
            <>
              <Button
                variant="outline" size="sm" className="h-7 gap-1 text-xs"
                disabled={busy}
                onClick={() => run(
                  () => accept(slug, projectId, priority.id).then((p) => { if (!p) throw new Error() }),
                  "Création de l'issue échouée", "Issue créée dans le projet",
                )}
              >
                {busy ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
                Créer l&apos;issue
              </Button>
              <button
                type="button" disabled={busy} title={pinned ? "Détacher" : "Épingler"}
                onClick={() => run(() => pin(slug, projectId, priority.id), "Action impossible")}
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
              </button>
              <button
                type="button" disabled={busy} title="Éditer"
                onClick={() => setEditing(true)}
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Pencil className="size-3.5" />
              </button>
              <button
                type="button" disabled={busy} title="Écarter"
                onClick={() => run(() => dismissPriority(slug, projectId, priority.id), "Action impossible")}
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-rose-500"
              >
                <X className="size-3.5" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Decision board (boucle OODA) — aide à la décision par projet sur la page Analytics.
 *
 * L'analyse est un **workflow asynchrone** : « Analyser » le lance et ouvre le dock, où l'on suit
 * les étapes en direct ; le brief produit est persisté, et chaque priorité reste actionnable
 * (accepter → issue, épingler, éditer, écarter) au rechargement de la page.
 */
export function DecisionBoard({
  slug, projectId, projectName,
}: Readonly<{ slug: string; projectId: number; projectName: string }>) {
  const jobs = useWorkflowStore((s) => s.jobs)
  const brief: StoredBrief | null = useWorkflowStore((s) => s.briefByProject[projectId] ?? null)
  const { fetchBrief, launch } = useWorkflowStore()
  const [depth, setDepth] = useState<AnalysisDepth>("QUICK")
  const [launching, setLaunching] = useState(false)

  /** Le workflow en cours pour ce projet (le dock en montre le détail). */
  const runningJob = useMemo(
    () => jobs.find((j) => j.projectId === projectId && isActiveJob(j.status)) ?? null,
    [jobs, projectId],
  )

  /** Change dès qu'une analyse aboutit → on recharge le brief persisté. */
  const latestBriefId = useMemo(
    () => jobs.find((j) => j.projectId === projectId && j.status === "DONE")?.briefId ?? null,
    [jobs, projectId],
  )

  useEffect(() => { fetchBrief(slug, projectId) }, [slug, projectId, latestBriefId, fetchBrief])

  async function analyse() {
    setLaunching(true)
    const job = await launch(slug, projectId, depth)
    setLaunching(false)
    if (!job) {
      toast.error("Impossible de lancer l'analyse")
      return
    }
    openWorkflowPanel()
  }

  const busy = launching || runningJob !== null

  return (
    <section className="rounded-xl border border-primary/20 bg-primary/[0.03] p-4">
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
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
          {/* Rapide (8B) ou approfondi (14B + raisonnement, peut poser une question). */}
          <div className="flex rounded-lg border border-border bg-background p-0.5">
            {([
              { value: "QUICK", label: "Rapide", Icon: Zap, hint: "8B — quelques secondes" },
              { value: "DEEP", label: "Approfondi", Icon: BrainCircuit, hint: "14B + raisonnement — peut poser une question" },
            ] as const).map((option) => (
              <button
                key={option.value}
                type="button"
                title={option.hint}
                onClick={() => setDepth(option.value)}
                className={cn(
                  "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                  depth === option.value ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <option.Icon className="size-3.5" /> {option.label}
              </button>
            ))}
          </div>

          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={analyse} disabled={busy}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            {(() => {
              if (runningJob) return "Analyse en cours…"
              return brief ? "Ré-analyser" : "Analyser"
            })()}
          </Button>
        </div>
      </header>

      {runningJob && (
        <button
          type="button"
          onClick={openWorkflowPanel}
          className="mt-3 flex w-full items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/[0.06] px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-blue-500/[0.1]"
        >
          <Loader2 className="size-3.5 shrink-0 animate-spin text-blue-500" />
          {runningJob.status === "WAITING_FOR_INPUT"
            ? "L'IA attend une précision de ta part — ouvrir le workflow"
            : "Analyse en cours — suivre les étapes dans le dock"}
        </button>
      )}

      {!brief && !runningJob && (
        <p className="mt-3 text-xs text-muted-foreground">
          L&apos;IA lit les métriques réelles du projet + le Brain OS, puis propose la situation, les risques et
          les <span className="font-medium text-foreground">3 priorités</span> de demain — que tu peux transformer en issues d&apos;un clic.
          L&apos;analyse tourne en arrière-plan : tu peux quitter la page.
        </p>
      )}

      {brief && (
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
                {brief.risks.map((risk) => (
                  <li key={risk} className="flex gap-1.5 text-xs text-muted-foreground">
                    <span className="text-amber-500">•</span>{risk}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground">Les 3 priorités de demain</span>
            {brief.priorities.map((priority) => (
              <PriorityCard key={priority.id} slug={slug} projectId={projectId} priority={priority} />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
