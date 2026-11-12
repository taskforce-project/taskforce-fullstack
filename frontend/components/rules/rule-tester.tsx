"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { RuleCheck } from "@/lib/api/rules-service"
import { decisionWords, factsSentence, fill, fromWords, type RulesTexts } from "@/lib/rules/rule-words"
import { useRulesStore } from "@/lib/store/rules-store"

/**
 * « What would happen? » : une action décrite en mots, lue en faits par le modèle de l'espace, puis jugée par le moteur,
 * sans le modèle. La décision d'abord, en une phrase ; comment TaskForce a lu l'action et la règle qui a décidé, dessous.
 */
export function RuleTester({ slug, projectId, t }: Readonly<{ slug: string; projectId: number | null; t: RulesTexts }>) {
  const checkAction = useRulesStore((s) => s.checkAction)
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<RuleCheck | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  async function check(event: React.FormEvent) {
    event.preventDefault()
    const words = text.trim()
    if (!words) return
    setBusy(true)
    setFailed(null)
    const answer = await checkAction(slug, words, projectId)
    setBusy(false)
    if (!answer) {
      setResult(null)
      setFailed(useRulesStore.getState().error ?? t.tester.failed)
      return
    }
    setResult(answer)
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">{t.tester.hint}</p>
      <form onSubmit={check} className="flex flex-col gap-1.5">
        <Label htmlFor="rule-tester">{t.tester.label}</Label>
        <div className="flex gap-2">
          <Input id="rule-tester" value={text} maxLength={300} placeholder={t.tester.placeholder}
            onChange={(e) => setText(e.target.value)} />
          <Button type="submit" variant="outline" disabled={busy || !text.trim()}>
            {busy ? <><Loader2 className="size-4 animate-spin" />{t.tester.checking}</> : t.tester.check}
          </Button>
        </div>
      </form>
      {failed && <p className="text-sm text-destructive" role="alert">{failed}</p>}
      {result && (
        <div className="flex flex-col gap-1 rounded-md border border-border p-3" aria-live="polite">
          {result.decision && result.facts ? (
            <>
              <p className="text-sm font-medium text-foreground">{decisionWords(result.decision, t)}</p>
              <p className="text-xs text-muted-foreground">{fill(t.tester.readAs, { action: factsSentence(result.facts, t) })}</p>
              {result.decision.ruleText && (
                <p className="text-xs text-muted-foreground">{fill(t.tester.because, { reason: result.decision.ruleText })}</p>
              )}
              <p className="text-xs text-muted-foreground">{fill(t.tester.from, { layer: fromWords(result.decision, t) })}</p>
            </>
          ) : (
            <p className="text-sm text-foreground">{fill(t.tester.cantJudge, { text: result.unclear ?? "" })}</p>
          )}
        </div>
      )}
    </div>
  )
}
