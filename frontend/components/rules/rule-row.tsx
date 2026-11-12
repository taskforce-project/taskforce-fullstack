"use client"

import { useState } from "react"
import { Loader2, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import type { RuleStatement } from "@/lib/api/rules-service"
import { dayOf, fill, ruleSentence, type RulesTexts } from "@/lib/rules/rule-words"
import { RuleCaseList } from "./rule-case-list"

/**
 * Une règle de l'entreprise (R157) : la phrase de la personne qui l'a écrite, qui et quand ; ce que TaskForce en a compris
 * et ses cas à un clic ; le format de la règle à deux clics (R133). La retirer se confirme.
 */
export function RuleRow({ statement, t, canEdit, onRemove }: Readonly<{
  statement: RuleStatement
  t: RulesTexts
  canEdit: boolean
  onRemove: () => Promise<boolean>
}>) {
  const [open, setOpen] = useState(false)
  const [raw, setRaw] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const date = dayOf(statement.addedAt)
  const meta = statement.addedBy
    ? fill(t.addedBy, { who: statement.addedBy, date })
    : date ? fill(t.addedOn, { date }) : null

  async function remove() {
    setBusy(true)
    const ok = await onRemove()
    setBusy(false)
    if (ok) setConfirm(false)
  }

  return (
    <li className="flex flex-col gap-1 py-2.5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm text-foreground">{statement.text}</p>
          {meta && <p className="mt-0.5 text-xs text-muted-foreground">{meta}</p>}
        </div>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? t.hideDetails : t.details}
        </Button>
        {canEdit && (
          <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" title={t.remove} aria-label={t.remove}
            onClick={() => setConfirm(true)}>
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>
      {open && (
        <div className="flex flex-col gap-2 border-l border-border pl-3">
          <div className="flex flex-col gap-0.5">
            <p className="text-xs font-medium text-muted-foreground">{t.understood}</p>
            {statement.parts.map((part) => (
              <p key={part.id} className="text-xs text-foreground">
                {ruleSentence(part, t, { approvers: statement.approvers, signatures: statement.signatures,
                  separate: statement.separate })}
              </p>
            ))}
          </div>
          {statement.cases.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-muted-foreground">{t.casesTitle}</p>
              <RuleCaseList cases={statement.cases} t={t} />
            </div>
          )}
          <div>
            <button type="button" className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              aria-expanded={raw} onClick={() => setRaw((v) => !v)}>
              {raw ? t.hideFormat : t.showFormat}
            </button>
            {raw && (
              <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-all bg-muted px-2 py-1.5 font-mono text-[11px]">
                {JSON.stringify(statement.parts.map((p) => p.raw), null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{t.removeTitle}</DialogTitle>
            <DialogDescription>{t.removeBody}</DialogDescription>
          </DialogHeader>
          <p className="break-words text-sm text-foreground">{statement.text}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)} disabled={busy}>{t.cancel}</Button>
            <Button variant="destructive" onClick={remove} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : t.removeConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  )
}
