"use client"

import { useState } from "react"
import { ExternalLink, FileCheck2, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { fillText, resultCard, resultLine } from "@/lib/delivery/result-card"
import { useDeliveryStore } from "@/lib/store/delivery-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { cn } from "@/lib/utils"

/**
 * « Relire » (R78, séance n°13 ; J3, R50) : la carte de résultat d'une mission finie, sous le titre de l'issue. Le
 * résultat, les contrôles tirés du dossier (jamais du résumé de l'agent), ce qui changera si l'on applique, les mots de
 * l'agent pour ce qu'ils sont, puis trois gestes : « Discard », « Try again », « Apply ». Seule la personne qui a délégué
 * tranche : le serveur le vérifie, la carte le dit s'il refuse.
 */
export function MissionResultCard({ slug, issueId, issueKey, issueTitle, responsible }: Readonly<{
  slug: string
  issueId: number
  issueKey: string | null
  issueTitle: string
  responsible: string | null
}>) {
  const t = usePreferencesStore((s) => s.t.missions)
  const run = useDeliveryStore((s) => s.runs[issueId])
  const activity = useDeliveryStore((s) => (run ? s.activity[run.id] : undefined))
  const error = useDeliveryStore((s) => (run ? s.resultErrors[run.id] : undefined))
  const applyRun = useDeliveryStore((s) => s.applyRun)
  const discardRun = useDeliveryStore((s) => s.discardRun)
  const retryRun = useDeliveryStore((s) => s.retryRun)
  const downloadEvidence = useDeliveryStore((s) => s.downloadEvidence)
  const [busy, setBusy] = useState<"apply" | "discard" | "retry" | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [note, setNote] = useState("")

  if (!run || run.status !== "DONE" || run.outcome) return null
  const r = t.result
  const card = resultCard(run, activity, issueKey, r)
  const who = [
    responsible ? fillText(r.responsible, { who: responsible }) : null,
    fillText(r.delegatedTo, { agent: t.agent }),
    card.minutes === null ? null : card.minutes < 1 ? r.underAMinute : fillText(r.minutes, { minutes: card.minutes }),
  ].filter(Boolean).join(" · ")

  async function act(kind: "apply" | "discard" | "retry") {
    if (!run) return
    setBusy(kind)
    const ok = kind === "apply" ? await applyRun(slug, issueId, run.id)
      : kind === "discard" ? await discardRun(slug, issueId, run.id)
      : (await retryRun(slug, issueId, run.id, note)) !== null
    setBusy(null)
    if (ok) toast.success(kind === "apply" ? r.apply : kind === "discard" ? r.discard : r.tryAgain)
  }

  async function download(format: "json" | "md") {
    if (run) await downloadEvidence(slug, run.id, format)
  }

  return (
    <section className="flex flex-col border border-border text-xs" aria-label={`${r.theResult}: ${issueTitle}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-semibold text-foreground">{issueTitle}</span>
          <span className="text-muted-foreground">{who}</span>
        </div>
        <span className="border border-shape-green/40 px-1.5 py-0.5 text-[11px] text-ink-green">{r.ready}</span>
      </div>

      <Zone label={r.theResult}>
        <p className="text-foreground">{resultLine(run, r)}</p>
        {card.pr && (
          <a href={card.pr.url} target="_blank" rel="noopener noreferrer"
            className="inline-flex w-fit items-center gap-1 border border-border px-2 py-1 text-foreground hover:bg-muted">
            <ExternalLink className="size-3" /> {r.openPullRequest}
          </a>
        )}
      </Zone>

      <Zone label={r.isItGood}>
        <ul className="flex flex-col gap-1">
          {card.checks.map((check) => (
            <li key={check.label} className="grid grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-2">
              <span aria-hidden="true" className={cn("size-2.5",
                check.ok === true ? "bg-shape-green" : check.ok === false ? "bg-shape-red" : "bg-muted-foreground/40")} />
              <span className="text-foreground">{check.label}</span>
              <span className="tabular-nums text-muted-foreground">{check.value}</span>
            </li>
          ))}
        </ul>
      </Zone>

      {card.changes.length > 0 && (
        <Zone label={r.willChange}>
          <ul className="flex flex-col gap-1">
            {card.changes.map((change) => (
              <li key={change.text} className="flex items-baseline justify-between gap-2">
                <span className="text-foreground">{change.text}</span>
                <span className={change.final ? "text-ink-red" : "text-ink-green"}>{change.final ? r.final : r.canBeUndone}</span>
              </li>
            ))}
          </ul>
        </Zone>
      )}

      {run.summary && (
        <Zone label={r.inItsWords}>
          <p className="line-clamp-6 whitespace-pre-wrap break-words text-muted-foreground">{run.summary}</p>
        </Zone>
      )}

      <div className="flex flex-col gap-2 border-b border-border px-3 py-2.5">
        {retrying ? (
          <div className="flex flex-col gap-1.5">
            <textarea aria-label={r.tryAgain} placeholder={r.retryNote} rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000}
              className="w-full border border-input bg-transparent px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
            <div className="flex gap-2">
              <Button size="sm" className="h-7 px-2.5 text-xs" disabled={busy !== null} onClick={() => void act("retry")}>
                {busy === "retry" ? <Loader2 className="size-3 animate-spin" /> : r.tryAgain}
              </Button>
              <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs" disabled={busy !== null} onClick={() => setRetrying(false)}>
                {r.cancel}
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <Button variant="outline" size="sm" className="h-8 text-xs" disabled={busy !== null} onClick={() => void act("discard")}>
              {busy === "discard" ? <Loader2 className="size-3 animate-spin" /> : r.discard}
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" disabled={busy !== null} onClick={() => setRetrying(true)}>
              {r.tryAgain}
            </Button>
            <Button size="sm" className="h-8 text-xs" disabled={busy !== null || !card.pr} onClick={() => void act("apply")}>
              {busy === "apply" ? <Loader2 className="size-3 animate-spin" /> : r.apply}
            </Button>
          </div>
        )}
        {error && <p className="whitespace-pre-wrap break-words text-destructive">{error}</p>}
      </div>

      <details className="px-3 py-2">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">{r.howItWasDone}</summary>
        <p className="mt-1.5 text-muted-foreground">{card.how}</p>
        <p className="mt-1 flex items-center gap-1.5 text-muted-foreground">
          <FileCheck2 className="size-3 shrink-0" />
          {r.downloadRecord}
          <button type="button" className="hover:text-foreground hover:underline" onClick={() => void download("json")}>JSON</button>
          <span aria-hidden="true">·</span>
          <button type="button" className="hover:text-foreground hover:underline" onClick={() => void download("md")}>Markdown</button>
        </p>
      </details>
    </section>
  )
}

function Zone({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <div className="flex flex-col gap-1.5 border-b border-border px-3 py-2.5">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}
