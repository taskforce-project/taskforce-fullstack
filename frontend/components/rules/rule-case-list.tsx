"use client"

import { CircleCheck, CircleX } from "lucide-react"

import type { RuleCaseView } from "@/lib/api/rules-service"
import { decisionWords, factsSentence, fill, type RulesTexts } from "@/lib/rules/rule-words"

/**
 * Les cas d'une règle (R98), rejoués par le moteur : l'action en une phrase, ce que les règles en décident, et si c'est ce
 * que la règle dit. La phrase du modèle quand il l'a écrite, sinon celle que TaskForce tire des faits. Un cas qui ne
 * tient pas dit aussi ce que la règle en attendait (R161).
 */
export function RuleCaseList({ cases, t }: Readonly<{ cases: RuleCaseView[]; t: RulesTexts }>) {
  if (cases.length === 0) return null
  return (
    <ul className="flex flex-col gap-1" aria-label={t.casesTitle}>
      {cases.map((c, i) => (
        <li key={i} className="flex items-start gap-1.5 text-xs">
          {c.passed
            ? <CircleCheck className="mt-px size-3.5 shrink-0 text-ink-green" aria-label={t.casePasses} />
            : <CircleX className="mt-px size-3.5 shrink-0 text-ink-red" aria-label={t.caseFails} />}
          <span className="min-w-0 break-words text-foreground">
            {c.text ?? factsSentence(c.facts, t)}
            <span className="text-muted-foreground">
              {": "}{decisionWords(c.decision, t)}
              {!c.passed && fill(t.caseExpected, { decision: expected(c, t) })}
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}

/** Ce que la règle attendait d'un cas, en minuscule au milieu de la ligne : « allowed », « asks Marie Martin first ». */
function expected(c: RuleCaseView, t: RulesTexts): string {
  const words = decisionWords({ effect: c.expect, approvers: c.expectApprovers ? [c.expectApprovers] : [] }, t)
  return words.charAt(0).toLowerCase() + words.slice(1)
}
