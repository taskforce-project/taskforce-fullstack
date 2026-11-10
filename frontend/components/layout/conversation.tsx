"use client"

import { AgentChat } from "@/components/agent/agent-chat"
import { Composer } from "@/components/agent/composer"
import { usePreferencesStore } from "@/lib/store/preferences-store"

/**
 * La conversation avec Cortex dans sa colonne (R119, séance n°18) : elle vit dans le shell, et reste la même d'un
 * écran à l'autre. Son texte tient sur une colonne de 720 px au plus, centrée ; le compositeur est en bas, à la même
 * largeur, avec dessous le modèle et l'indicateur de contexte. Sans volet, elle prend toute la place ; à côté d'un
 * volet, elle garde 360 px au moins.
 */
export function Conversation() {
  const label = usePreferencesStore((s) => s.t.shell.chatLabel)
  return (
    <section aria-label={label} className="cortex-column flex min-h-0 min-w-90 flex-1 flex-col">
      <AgentChat layout="column" />
      <div className="shrink-0 px-3 pb-2 pt-1 md:px-4">
        <div className="mx-auto w-full max-w-[720px]">
          <Composer variant="column" />
        </div>
      </div>
    </section>
  )
}
