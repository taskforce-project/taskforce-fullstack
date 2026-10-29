"use client"

import { useEffect, useState } from "react"
import { FlaskConical, Plus, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { NO_TOOL, type EvalCriteria, type EvalDraft, type EvalDraftCall } from "@/lib/api/eval-service"
import { useEvalStore } from "@/lib/store/eval-store"
import { useSettingsStore } from "@/lib/store/settings-store"
import { cn } from "@/lib/utils"

/** Valeur du sélecteur quand l'outil n'est pas vérifié (Radix refuse une valeur vide). */
const ANY_TOOL = "any"
const ANY_EFFECT = "any"

const CALL_STATUS: Record<string, { label: string; tone: string }> = {
  success: { label: "done", tone: "text-ink-green" },
  approved: { label: "approved by you", tone: "text-ink-green" },
  pending: { label: "proposed", tone: "text-ink-yellow" },
  refused: { label: "refused by the rules", tone: "text-ink-red" },
  error: { label: "failed", tone: "text-destructive" },
}

interface ArgRow {
  key: string
  values: string
}

const split = (text: string, separator: string) =>
  text.split(separator).map((v) => v.trim()).filter(Boolean)

function CallLine({ call }: { call: EvalDraftCall }) {
  const status = CALL_STATUS[call.status] ?? { label: call.status, tone: "text-muted-foreground" }
  return (
    <li className="flex min-w-0 flex-col gap-0.5 py-1.5">
      <p className="flex flex-wrap items-center gap-x-2 text-xs">
        <span className="font-mono text-foreground">{call.tool}</span>
        <span className={status.tone}>{status.label}</span>
        {call.read && <span className="text-muted-foreground">· kept for the replay</span>}
      </p>
      <p className="truncate font-mono text-[11px] text-muted-foreground" title={call.arguments}>{call.arguments}</p>
    </li>
  )
}

/** Le geste sous une réponse qui a un dossier ; le dialogue ne se monte qu'ouvert. */
export function EvalCaseButton({ slug, record }: { slug: string; record: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-6 items-center gap-1 rounded px-1.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <FlaskConical className="size-3" /> Add to test bank
      </button>
      {open && <EvalCaseDialog slug={slug} record={record} open={open} onOpenChange={setOpen} />}
    </>
  )
}

/**
 * Le geste « en faire un cas » : le brouillon vient du dossier de la réponse, la personne confirme
 * ou corrige les critères proposés, puis le serveur fige le cas.
 */
export function EvalCaseDialog({
  slug, record, open, onOpenChange,
}: { slug: string; record: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const draftCase = useEvalStore((s) => s.draftCase)
  const addCase = useEvalStore((s) => s.addCase)
  const error = useEvalStore((s) => s.error)
  const openSettings = useSettingsStore((s) => s.openSettings)

  // Le dialogue se monte ouvert (EvalCaseButton) : le brouillon se lit dès le montage.
  const [draft, setDraft] = useState<EvalDraft | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState("")
  const [tool, setTool] = useState(ANY_TOOL)
  const [args, setArgs] = useState<ArgRow[]>([])
  const [effect, setEffect] = useState(ANY_EFFECT)
  const [forbid, setForbid] = useState<string[]>([])
  const [contains, setContains] = useState("")
  const [notContains, setNotContains] = useState("")

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void draftCase(slug, record).then((next) => {
      if (cancelled) return
      setLoading(false)
      if (!next) return
      setDraft(next)
      setTitle(next.title)
      setTool(next.criteria.tool || ANY_TOOL)
      setArgs(Object.entries(next.criteria.args).map(([key, values]) => ({ key, values: values.join(" | ") })))
      setEffect(next.criteria.effect || ANY_EFFECT)
      setForbid(next.criteria.forbid)
      setContains(next.criteria.contains.join(", "))
      setNotContains(next.criteria.notContains.join(", "))
    })
    return () => { cancelled = true }
  }, [open, slug, record, draftCase])

  const tools = draft ? [...new Set(draft.calls.map((c) => c.tool))] : []
  const checksTool = tool !== ANY_TOOL && tool !== NO_TOOL

  const criteria = (): EvalCriteria => ({
    tool: tool === ANY_TOOL ? "" : tool,
    args: checksTool
      ? Object.fromEntries(args.filter((a) => a.key.trim() && a.values.trim()).map((a) => [a.key.trim(), split(a.values, "|")]))
      : {},
    effect: checksTool && effect !== ANY_EFFECT ? (effect as EvalCriteria["effect"]) : "",
    forbid: forbid.filter((t) => t !== tool),
    contains: split(contains, ","),
    notContains: split(notContains, ","),
  })

  const save = async () => {
    setSaving(true)
    const added = await addCase(slug, record, title, criteria())
    setSaving(false)
    if (!added) return
    onOpenChange(false)
    toast.success("Added to the test bank", { action: { label: "Open", onClick: () => openSettings("evals") } })
  }

  const setArg = (index: number, patch: Partial<ArgRow>) =>
    setArgs((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))

  const label = "text-xs font-medium uppercase tracking-wide text-muted-foreground"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-muted-foreground" />
            Add to the test bank
          </DialogTitle>
          <DialogDescription>
            The case keeps this question, its date, the notes Cortex read and what its read tools returned. Confirm
            what a good answer does: a replay on another model is graded against it.
          </DialogDescription>
        </DialogHeader>

        {loading && <p className="text-xs text-muted-foreground">Reading this answer&apos;s record…</p>}
        {!loading && !draft && <p className="text-xs text-destructive">{error ?? "This answer can't become a test case."}</p>}

        {draft && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="eval-case-title" className={label}>Title</label>
              <Input id="eval-case-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
              <p className="text-xs text-muted-foreground">
                Asked{draft.askedOn ? ` on ${draft.askedOn}` : ""}: &ldquo;{draft.question}&rdquo;
                {draft.notes.length > 0 && ` · ${draft.notes.length} note${draft.notes.length > 1 ? "s" : ""} read`}
              </p>
            </div>

            <div className="flex flex-col gap-1">
              <p className={label}>What Cortex did</p>
              {draft.calls.length === 0 ? (
                <p className="text-xs text-muted-foreground">No tool call.</p>
              ) : (
                <ul className="divide-y divide-border/50">
                  {draft.calls.map((call, i) => <CallLine key={i} call={call} />)}
                </ul>
              )}
            </div>

            <div className="flex flex-col gap-3 border-t border-border/60 pt-3">
              <p className={label}>A good answer</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs text-foreground">Calls the tool</span>
                  <Select value={tool} onValueChange={setTool}>
                    <SelectTrigger aria-label="Expected tool"><SelectValue /></SelectTrigger>
                    <SelectContent position="popper">
                      <SelectItem value={ANY_TOOL}>Not checked</SelectItem>
                      <SelectItem value={NO_TOOL}>No tool at all</SelectItem>
                      {tools.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className={cn("text-xs text-foreground", !checksTool && "opacity-50")}>The rule&apos;s effect on it</span>
                  <Select value={effect} onValueChange={setEffect} disabled={!checksTool}>
                    <SelectTrigger aria-label="Expected rule effect"><SelectValue /></SelectTrigger>
                    <SelectContent position="popper">
                      <SelectItem value={ANY_EFFECT}>Not checked</SelectItem>
                      <SelectItem value="allow">Allowed</SelectItem>
                      <SelectItem value="ask">Asks first</SelectItem>
                      <SelectItem value="deny">Refused</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {checksTool && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs text-foreground">
                    With the arguments <span className="text-muted-foreground">(separate accepted values with |)</span>
                  </span>
                  {args.map((row, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input aria-label="Argument name" value={row.key} maxLength={64} className="w-36 font-mono text-xs"
                        onChange={(e) => setArg(i, { key: e.target.value })} />
                      <Input aria-label={`Accepted values for ${row.key || "this argument"}`} value={row.values}
                        className="flex-1 font-mono text-xs" onChange={(e) => setArg(i, { values: e.target.value })} />
                      <button type="button" aria-label="Remove this argument"
                        onClick={() => setArgs((rows) => rows.filter((_, j) => j !== i))}
                        className="rounded p-1 text-muted-foreground hover:text-foreground">
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ))}
                  {args.length < 10 && (
                    <button type="button" onClick={() => setArgs((rows) => [...rows, { key: "", values: "" }])}
                      className="flex w-fit items-center gap-1 text-xs font-medium text-primary hover:underline">
                      <Plus className="size-3" /> Add an argument
                    </button>
                  )}
                </div>
              )}

              {tools.some((t) => t !== tool) && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs text-foreground">Never calls</span>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    {tools.filter((t) => t !== tool).map((t) => (
                      <label key={t} className="flex items-center gap-1.5 font-mono text-xs">
                        <Checkbox checked={forbid.includes(t)}
                          onCheckedChange={(on) => setForbid((list) => (on === true ? [...list, t] : list.filter((x) => x !== t)))} />
                        {t}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="eval-case-contains" className="text-xs text-foreground">Says the words</label>
                  <Input id="eval-case-contains" value={contains} placeholder="Separated by commas"
                    onChange={(e) => setContains(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="eval-case-not-contains" className="text-xs text-foreground">Never says</label>
                  <Input id="eval-case-not-contains" value={notContains} placeholder="Separated by commas"
                    onChange={(e) => setNotContains(e.target.value)} />
                </div>
              </div>
            </div>

            {error && !saving && <p className="text-xs text-destructive">{error}</p>}
            <p className="text-xs text-muted-foreground">
              The case stays in this workspace. Its criteria are dated now, before any replay, and can&apos;t change
              after a model has been graded on them.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={!draft || saving}>{saving ? "Adding…" : "Add case"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
