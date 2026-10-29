"use client"

import { useEffect, useState } from "react"
import { Check, CircleCheck, CircleX, Play, Square, Trash2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { NO_TOOL, type EvalResult } from "@/lib/api/eval-service"
import { IS_DESKTOP } from "@/lib/desktop"
import { useEvalStore } from "@/lib/store/eval-store"
import { useWorkspaceStore } from "@/lib/store/workspace-store"
import { cn } from "@/lib/utils"
import { parseServerDate } from "@/lib/utils/server-date"

/** Le nom que le serveur donne à un rejeu sans modèle nommé. */
const DEFAULT_MODEL = "default"
const modelLabel = (model: string) => (model === DEFAULT_MODEL ? "Default model" : model)

const formatDate = (value: string) =>
  parseServerDate(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })

/** Ce qui entre dans la banque et ce qui en sort : la règle se lit à côté de l'interrupteur. */
const RULES = [
  "A case is added by hand, from one of your own Cortex answers. Nothing is collected on its own.",
  "It keeps the question, its date, the notes Cortex read and what its read tools returned.",
  "A replay never touches your workspace: reads come from the case, and writes are only proposed.",
  "Grades come from code: the expected or forbidden tool, its arguments, the rule's effect, words in the answer.",
  "Cases stay in this workspace.",
]

function ResultView({ result }: { result: EvalResult }) {
  const [open, setOpen] = useState(!result.passed)
  return (
    <li className="py-2">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 text-left">
        {result.passed
          ? <CircleCheck className="size-4 shrink-0 text-ink-green" aria-label="Passed" />
          : <CircleX className="size-4 shrink-0 text-ink-red" aria-label="Failed" />}
        <span className="min-w-0 flex-1 truncate text-sm text-foreground">{result.title}</span>
      </button>
      {open && (
        <div className="mt-1.5 flex flex-col gap-1.5 pl-6">
          <ul className="flex flex-col gap-0.5">
            {result.checks.map((check, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-xs">
                {check.passed
                  ? <Check className="size-3 shrink-0 self-center text-ink-green" aria-label="Met" />
                  : <X className="size-3 shrink-0 self-center text-ink-red" aria-label="Not met" />}
                <span className="text-foreground">{check.criterion}</span>
                {check.detail && <span className="text-muted-foreground">{check.detail}</span>}
              </li>
            ))}
          </ul>
          {result.calls.length > 0 && (
            <p className="font-mono text-[11px] text-muted-foreground">
              {result.calls.map((c) => `${c.tool} (${c.status})`).join(" · ")}
            </p>
          )}
          {result.answer && <p className="whitespace-pre-wrap text-xs text-muted-foreground">{result.answer}</p>}
        </div>
      )}
    </li>
  )
}

/**
 * Réglages « Test bank » du workspace (R61, séance n°10) : l'interrupteur et sa règle, les cas, le
 * rejeu sur un modèle nommé et le score de chaque modèle. Les cas s'ajoutent sous une réponse de Cortex.
 */
export function EvalBankPanel() {
  const slug = useWorkspaceStore((s) => s.activeWorkspace?.slug) ?? ""
  const bank = useEvalStore((s) => s.bank)
  const run = useEvalStore((s) => s.run)
  const progress = useEvalStore((s) => s.progress)
  const error = useEvalStore((s) => s.error)
  const fetchBank = useEvalStore((s) => s.fetchBank)
  const setEnabled = useEvalStore((s) => s.setEnabled)
  const archiveCase = useEvalStore((s) => s.archiveCase)
  const runBank = useEvalStore((s) => s.runBank)
  const stopRun = useEvalStore((s) => s.stopRun)
  const openRun = useEvalStore((s) => s.openRun)
  const [model, setModel] = useState("")

  useEffect(() => { if (slug) void fetchBank(slug) }, [slug, fetchBank])

  if (!bank) return <p className="text-xs text-muted-foreground">Loading the test bank…</p>

  return (
    <div className="flex flex-col gap-4">
      <section className="border-b border-border/60 pb-6">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-foreground">Test bank</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Questions your team asked Cortex, kept with what a good answer does. Replay them on another model to see
            whether it does as well before you switch.
          </p>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-foreground">Collect test cases</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {bank.canManage
                ? "When it's on, anyone in this workspace can turn one of their Cortex answers into a test case."
                : "Only an owner or admin can turn the test bank on or off."}
            </p>
          </div>
          <Switch
            checked={bank.enabled}
            disabled={!bank.canManage}
            onCheckedChange={(on) => void setEnabled(slug, on)}
            aria-label="Collect test cases"
          />
        </div>
        <ul className="mt-4 flex list-disc flex-col gap-1 pl-4 text-xs text-muted-foreground">
          {RULES.map((rule) => <li key={rule}>{rule}</li>)}
        </ul>
      </section>

      <section className="border-b border-border/60 pb-6">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-foreground">Replay on a model</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {IS_DESKTOP
              ? "The name of a model installed in Ollama, such as qwen3:8b. Leave it empty for Cortex's default model."
              : "A model the AI service can reach. Leave it empty for Cortex's default model."}
            {" "}A replay uses the AI allowance like an answer.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="Default model"
            maxLength={128}
            aria-label="Model to replay on"
            className="w-56 font-mono text-xs"
            disabled={progress !== null}
          />
          {progress ? (
            <Button variant="outline" size="sm" onClick={stopRun} disabled={progress.stopping} className="gap-1.5">
              <Square className="size-3" /> {progress.stopping ? "Stopping…" : "Stop"}
            </Button>
          ) : (
            <Button size="sm" onClick={() => void runBank(slug, model)} disabled={bank.cases.length === 0} className="gap-1.5">
              <Play className="size-3" /> Run {bank.cases.length} case{bank.cases.length === 1 ? "" : "s"}
            </Button>
          )}
        </div>
        {progress && (
          <p className="mt-2 text-xs tabular-nums text-muted-foreground">
            {progress.waitSeconds !== null
              ? `Waiting ${progress.waitSeconds} s for the AI rate limit · case ${progress.done + 1} of ${progress.total}`
              : progress.total > 0 ? `Replaying case ${progress.done + 1} of ${progress.total}…` : "Starting…"}
          </p>
        )}
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

        {bank.runs.length > 0 && (
          <div className="mt-4">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Scores by model</p>
            <ul className="divide-y divide-border/50">
              {bank.runs.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => void openRun(slug, r.id)}
                    className={cn("flex w-full items-center gap-3 py-2 text-left text-sm hover:bg-muted/40",
                      run?.run.id === r.id && "bg-muted/40")}
                  >
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">{modelLabel(r.model)}</span>
                    <span className="text-xs text-muted-foreground">{formatDate(r.startedAt)}</span>
                    <span className="w-24 text-right text-xs tabular-nums text-foreground">
                      {r.passed} / {r.total} passed
                    </span>
                    {!r.finishedAt && <span className="text-[10px] uppercase text-ink-yellow">Partial</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {run && (
          <div className="mt-4 border border-border/60 p-3">
            <p className="text-xs text-muted-foreground">
              <span className="font-mono text-foreground">{modelLabel(run.run.model)}</span>
              {run.run.model === DEFAULT_MODEL && run.results[0]?.model && ` (${run.results[0].model})`}
              {" · "}{run.results.filter((r) => r.passed).length} of {run.run.total} passed
              {run.results.length < run.run.total && ` · ${run.run.total - run.results.length} not graded`}
            </p>
            <ul className="mt-1 divide-y divide-border/50">
              {run.results.map((result) => <ResultView key={result.caseId} result={result} />)}
            </ul>
          </div>
        )}
      </section>

      <section>
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-foreground">Cases ({bank.cases.length})</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Under an answer of Cortex that used a tool, choose Add to test bank.
          </p>
        </div>
        {bank.cases.length === 0 ? (
          <p className="text-xs text-muted-foreground">No case yet.</p>
        ) : (
          <ul className="divide-y divide-border/50">
            {bank.cases.map((c) => (
              <li key={c.id} className="flex items-start gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">{c.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {c.tool === NO_TOOL ? "No tool" : c.tool ? <span className="font-mono">{c.tool}</span> : "Tool not checked"}
                    {" · criteria set "}{formatDate(c.criteriaAt)}
                  </p>
                </div>
                {(c.mine || bank.canManage) && (
                  <button
                    type="button"
                    onClick={() => void archiveCase(slug, c.id)}
                    aria-label={`Remove ${c.title}`}
                    title="Remove from the bank"
                    className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
