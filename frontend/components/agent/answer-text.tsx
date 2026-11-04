"use client"

import { ShieldCheck } from "lucide-react"

import { Markdown } from "@/components/ui/lightweight-markdown"
import { splitAnswer } from "@/lib/cortex/taskforce-says"
import { usePreferencesStore } from "@/lib/store/preferences-store"

/**
 * Le texte d'une réponse de Cortex : son markdown, et ce que TaskForce y dit à la place d'une phrase où Cortex disait
 * avoir fait ce qu'aucune action du tour n'a fait (R116), ou à propos du modèle qui répond (R118), sous son nom et dans
 * son style, jamais mêlé aux mots du modèle.
 */
export function AnswerText({ text }: Readonly<{ text: string }>) {
  return (
    <>
      {splitAnswer(text).map((part, i) =>
        part.by === "cortex"
          ? <Markdown key={i} content={part.text} />
          : <TaskForceSays key={i} lines={part.lines} kind={part.kind} />,
      )}
    </>
  )
}

/**
 * Ce que TaskForce dit, depuis les résultats du tour ou de sa banque ; ce que veut dire le bloc se lit au survol. Les
 * {@code children} suivent ses mots : le geste qu'il propose.
 */
export function TaskForceSays({ lines, kind, children }: Readonly<{
  lines: string[]
  kind?: "models"
  children?: React.ReactNode
}>) {
  const t = usePreferencesStore((s) => s.t.cortex)
  const m = usePreferencesStore((s) => s.t.models)
  const models = kind === "models"
  return (
    <div
      role="note"
      aria-label={models ? m.saysLabel : t.taskforceSaysLabel}
      title={models ? m.saysHint : t.taskforceSaysHint}
      data-by="taskforce"
      className="my-2 flex gap-2 border-l-2 border-primary bg-primary/[0.06] px-3 py-2"
    >
      <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
      <div className="min-w-0 space-y-0.5 text-sm leading-relaxed">
        <p className="text-xs">
          <span className="font-semibold text-primary">{t.taskforceSays}</span>
          <span className="text-muted-foreground"> · {models ? m.saysWhat : t.taskforceSaysWhat}</span>
        </p>
        {lines.map((line, i) => (
          <p key={i} className="text-foreground">{line}</p>
        ))}
        {children}
      </div>
    </div>
  )
}
