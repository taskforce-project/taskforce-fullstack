"use client"

import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { Check, Copy, ThumbsDown, ThumbsUp } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useEvalStore } from "@/lib/store/eval-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { cn } from "@/lib/utils"
import { withConversation } from "@/lib/window/address"
import { progressPath } from "@/lib/window/pane"

import { EvalCaseDialog } from "./eval-case-dialog"

const ICON_BUTTON = "flex size-6 items-center justify-center rounded text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground disabled:pointer-events-none motion-reduce:transition-none"

/** Un geste de 24 px : son nom au survol et pour un lecteur d'écran (R129). */
function ActionButton({ name, pressed, disabled, onClick, children }: Readonly<{
  name: string
  pressed?: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}>) {
  return (
    <button type="button" aria-label={name} title={name} aria-pressed={pressed} disabled={disabled} onClick={onClick} className={ICON_BUTTON}>
      {children}
    </button>
  )
}

/**
 * Sous une réponse, au survol, 24 px (R137) : copier, bien, pas bien. « Bien » garde le cas d'un clic, avec ce qui a été
 * observé comme attendu. « Pas bien » demande une phrase : ce qu'il aurait fallu faire ; le cas attend ses critères, et le
 * formulaire d'avant reste sous « Advanced » (« Oula jsp si il y a ce qu'il faut la dedans mdr »). Sans dossier, ou la banque
 * coupée, il n'y a rien à garder : copier seul (R15).
 */
export function AnswerActions({ slug, text, record }: Readonly<{ slug: string; text: string; record: string | null | undefined }>) {
  const t = usePreferencesStore((s) => s.t.thread)
  const keepGood = useEvalStore((s) => s.keepGood)
  const keepBad = useEvalStore((s) => s.keepBad)
  const bankOff = useEvalStore((s) => s.bank !== null && !s.bank.enabled)
  const router = useRouter()

  const [copied, setCopied] = useState(false)
  const [kept, setKept] = useState<"good" | "bad" | null>(null)
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState(false)
  const [advanced, setAdvanced] = useState(false)
  const [sentence, setSentence] = useState("")
  const [problem, setProblem] = useState<string | null>(null)
  const fieldId = useId()
  const field = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (asking) field.current?.focus()
  }, [asking])

  const copy = () => {
    void navigator.clipboard?.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const confirmed = (verdict: "good" | "bad") => {
    setKept(verdict)
    setAsking(false)
    setProblem(null)
    toast.success(t.keptToast, {
      action: {
        label: t.keptOpen,
        onClick: () => router.push(withConversation(progressPath(slug), globalThis.location?.search ?? ""), { scroll: false }),
      },
    })
  }

  const failed = () => setProblem(useEvalStore.getState().error ?? t.failServer)

  const good = async () => {
    if (!record || busy) return
    setBusy(true)
    const done = await keepGood(slug, record)
    setBusy(false)
    if (done) confirmed("good")
    else {
      setAsking(false)
      failed()
    }
  }

  const bad = async () => {
    const said = sentence.trim()
    if (!record || busy || !said) return
    setBusy(true)
    const done = await keepBad(slug, record, said)
    setBusy(false)
    if (done) confirmed("bad")
    else failed()
  }

  const canKeep = Boolean(record) && !bankOff
  return (
    <div>
      <div
        className={cn(
          "flex h-6 items-center gap-0.5 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover/answer:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100",
          (asking || kept) && "opacity-100",
        )}
      >
        <ActionButton name={copied ? t.copied : t.copy} onClick={copy}>
          {copied ? <Check className="size-3.5 text-ink-green" /> : <Copy className="size-3.5" />}
        </ActionButton>
        {canKeep && (
          <>
            <ActionButton name={kept === "good" ? t.keptName : t.good} pressed={kept === "good"} disabled={busy || kept !== null} onClick={() => void good()}>
              <ThumbsUp className={cn("size-3.5", kept === "good" && "fill-current text-ink-green")} />
            </ActionButton>
            <ActionButton name={kept === "bad" ? t.keptName : t.bad} pressed={kept === "bad" || asking} disabled={busy || kept !== null} onClick={() => { setProblem(null); setAsking((v) => !v) }}>
              <ThumbsDown className={cn("size-3.5", kept === "bad" && "fill-current text-ink-red")} />
            </ActionButton>
          </>
        )}
      </div>

      {problem !== null && !asking && <p role="alert" className="text-xs text-destructive">{problem}</p>}

      {asking && record && (
        <form
          className="mt-1 flex max-w-[420px] flex-col gap-1.5"
          onSubmit={(e) => { e.preventDefault(); void bad() }}
          onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); setAsking(false) } }}
        >
          <label htmlFor={fieldId} className="text-xs text-muted-foreground">{t.badLabel}</label>
          <Input
            id={fieldId}
            ref={field}
            value={sentence}
            maxLength={500}
            placeholder={t.badPlaceholder}
            onChange={(e) => setSentence(e.target.value)}
            className="h-8 text-xs"
          />
          {problem !== null && <p role="alert" className="text-xs text-destructive">{problem}</p>}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setAdvanced(true)}
              className="mr-auto text-xs text-muted-foreground underline-offset-2 transition-colors duration-150 hover:text-foreground hover:underline motion-reduce:transition-none"
            >
              {t.advanced}
            </button>
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2.5 text-xs" onClick={() => setAsking(false)}>{t.cancel}</Button>
            <Button type="submit" size="sm" className="h-7 px-2.5 text-xs" disabled={busy || !sentence.trim()}>{busy ? t.keeping : t.keep}</Button>
          </div>
        </form>
      )}

      {advanced && record && (
        <EvalCaseDialog
          slug={slug}
          record={record}
          expected={sentence.trim() || undefined}
          open={advanced}
          onOpenChange={(open) => { setAdvanced(open) }}
          onSaved={() => { setAdvanced(false); setKept("bad"); setAsking(false) }}
        />
      )}
    </div>
  )
}
