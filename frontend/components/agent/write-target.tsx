"use client"

import { AlertTriangle, MapPin } from "lucide-react"

import type { AssistantWhere } from "@/lib/api/assistant-service"
import { fillText } from "@/lib/delivery/result-card"
import { usePreferencesStore } from "@/lib/store/preferences-store"

/**
 * Où une écriture de Cortex arrive, sur sa carte, avant le geste (R204, R201 « demander ») : TaskForce et son espace, ou
 * l'outil connecté. Le 17/11/2026, « crée un projet dans Linear » a créé un projet dans TaskForce sans que la carte le dise.
 * Quand la demande nommait un autre outil, la carte le dit d'abord, en avertissement : la personne décide en le sachant.
 * Rien pour une carte dont le serveur ne dit pas la cible (une réponse d'avant).
 */
export function WriteTarget({ where }: Readonly<{ where?: AssistantWhere | null }>) {
  const t = usePreferencesStore((s) => s.t.thread)
  if (!where?.system) return null
  const place = where.workspace
    ? fillText(t.whereInWorkspace, { system: where.system, workspace: where.workspace })
    : fillText(t.whereIn, { system: where.system })
  return (
    <div className="flex flex-col gap-1 text-xs" aria-label={t.whereLabel} role="group">
      {where.asked && (
        <p role="alert" className="flex items-start gap-1.5 font-medium text-ink-red">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {fillText(t.whereElsewhere, { asked: where.asked, system: where.system })}
        </p>
      )}
      <p className="flex items-center gap-1.5 text-muted-foreground">
        <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
        {place}
      </p>
    </div>
  )
}
