"use client"

import { CircleCheck, CircleX } from "lucide-react"

import type { RuleCaseView } from "@/lib/api/rules-service"
import { decisionWords, factsSentence, type RulesTexts } from "@/lib/rules/rule-words"

/**
 * Les cas d'une règle (R98), rejoués par le moteur : l'action en une phrase, ce que les règles en décident, et si c'est ce
 * que la règle dit. La phrase du modèle quand il l'a écrite, sinon celle que TaskForce tire des faits.
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
            <span className="text-muted-foreground">{": "}{decisionWords(c.decision, t)}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}
