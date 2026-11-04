"use client"

import { ArrowUpRight } from "lucide-react"

import { TaskForceSays } from "@/components/agent/answer-text"
import { fillModelText } from "@/lib/ai/model-table"
import { useCortexStore, type CortexTurn } from "@/lib/store/cortex-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"

/**
 * Ce que TaskForce dit du modèle sous une réponse (R118, séance n°17) : la banque dit que le modèle de Cortex échoue à
 * ce genre de demande et qu'un autre modèle servi le réussit, et la personne peut lui envoyer la demande d'un clic ; ou
 * la demande vient d'être envoyée à un autre modèle, et la réponse le dit. Jamais en silence, jamais sans elle.
 */
export function ModelOffer({ slug, turn }: Readonly<{ slug: string; turn: CortexTurn }>) {
  const t = usePreferencesStore((s) => s.t.models)
  const escalate = useCortexStore((s) => s.escalate)
  const waiting = useCortexStore((s) => s.sentAt !== null)
  if (turn.sentTo) {
    return <TaskForceSays kind="models" lines={[fillModelText(t.answeredBy, { model: turn.sentTo })]} />
  }
  const offer = turn.escalation
  if (!offer) return null
  return (
    <TaskForceSays kind="models" lines={[offer.text]}>
      {!turn.escalated && (
        <button
          type="button"
          disabled={waiting}
          onClick={() => void escalate(slug, turn.id)}
          className="mt-1.5 inline-flex items-center gap-1 border border-primary/40 px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
        >
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
          {fillModelText(t.offerAsk, { model: offer.to })}
        </button>
      )}
    </TaskForceSays>
  )
}
