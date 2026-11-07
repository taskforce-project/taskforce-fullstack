"use client"

import { ShieldCheck } from "lucide-react"

import { useAnswerLinks } from "@/components/agent/answer-links"
import { Markdown } from "@/components/ui/lightweight-markdown"
import type { AssistantToolCall } from "@/lib/api/assistant-service"
import { splitAnswer, type AnswerKind } from "@/lib/cortex/taskforce-says"
import { usePreferencesStore } from "@/lib/store/preferences-store"

/**
 * Le texte d'une réponse de Cortex : son markdown, et ce que TaskForce y dit à la place d'une phrase où Cortex disait
 * avoir fait ce qu'aucune action du tour n'a fait (R116), à propos du modèle qui répond (R118), ou les questions qu'il
 * pose avant un geste (R115), sous son nom et dans son style, jamais mêlé aux mots du modèle. Quand la carte de ces
 * questions est là (`withCard`), c'est elle qui les montre : le bloc ne les répète pas. Les issues et les projets que
 * Cortex nomme sont des liens vers leur volet (R120) ; les gestes de la réponse (`toolCalls`) disent quelles issues.
 */
export function AnswerText({ text, withCard = false, toolCalls }: Readonly<{
  text: string
  withCard?: boolean
  toolCalls?: readonly AssistantToolCall[]
}>) {
  const links = useAnswerLinks(toolCalls)
  return (
    <>
      {splitAnswer(text).map((part, i) => {
        if (part.by === "cortex") return <Markdown key={i} content={part.text} renderText={links} />
        if (part.kind === "asks" && withCard) return null
        return <TaskForceSays key={i} lines={part.lines} kind={part.kind} />
      })}
    </>
  )
}

/**
 * Ce que TaskForce dit, depuis les résultats du tour ou de sa banque ; ce que veut dire le bloc se lit au survol. Les
 * {@code children} suivent ses mots : le geste qu'il propose.
 */
export function TaskForceSays({ lines, kind, children }: Readonly<{
  lines: string[]
  kind?: AnswerKind
  children?: React.ReactNode
}>) {
  const t = usePreferencesStore((s) => s.t.cortex)
  const m = usePreferencesStore((s) => s.t.models)
  const says = kind === "models"
    ? { label: m.saysLabel, hint: m.saysHint, what: m.saysWhat }
    : kind === "asks"
      ? { label: t.taskforceAsksLabel, hint: t.taskforceAsksHint, what: t.taskforceAsksWhat }
      : { label: t.taskforceSaysLabel, hint: t.taskforceSaysHint, what: t.taskforceSaysWhat }
  return (
    <div
      role="note"
      aria-label={says.label}
      title={says.hint}
      data-by="taskforce"
      className="my-2 flex gap-2 border-l-2 border-primary bg-primary/[0.06] px-3 py-2"
    >
      <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
      <div className="min-w-0 space-y-0.5 text-sm leading-relaxed">
        <p className="text-xs">
          <span className="font-semibold text-primary">{t.taskforceSays}</span>
          <span className="text-muted-foreground"> · {says.what}</span>
        </p>
        {lines.map((line, i) => (
          <p key={i} className="text-foreground">{line}</p>
        ))}
        {children}
      </div>
    </div>
  )
}
