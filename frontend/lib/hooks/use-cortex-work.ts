"use client"

import { useEffect } from "react"

import type { CortexWorkStep } from "@/lib/cortex/work-lines"
import { subscribeTopic } from "@/lib/hooks/use-stomp"
import { useCortexStore } from "@/lib/store/cortex-store"
import { useUserStore } from "@/lib/store/user-store"

/**
 * Écoute ce que Cortex fait pendant une réponse (R137) : le serveur annonce chaque étape sur `/topic/cortex.{userId}`, et la
 * ligne de travail la dit. Abonnée tant que la conversation est montée, pour ne pas manquer la première étape d'une demande ;
 * sans temps réel, la ligne dit seulement « Working… », jamais une étape inventée.
 */
export function useCortexWork(): void {
  const userId = useUserStore((s) => s.user?.id)
  const noteWorkStep = useCortexStore((s) => s.noteWorkStep)

  useEffect(() => {
    if (!userId) return
    return subscribeTopic(`/topic/cortex.${userId}`, (body) => {
      try {
        noteWorkStep(JSON.parse(body) as CortexWorkStep)
      } catch {
        // Un message illisible ne change rien à la ligne.
      }
    })
  }, [userId, noteWorkStep])
}
