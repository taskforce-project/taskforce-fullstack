"use client"

import { useEffect, useMemo } from "react"

import type { ProjectDeliveryEvent } from "@/lib/api/delivery-service"
import { deliveryTopic } from "@/lib/hooks/use-project-live"
import { subscribeTopics } from "@/lib/hooks/use-stomp"
import { useDeliveryStore } from "@/lib/store/delivery-store"

/** Une rafale de décisions ne relit « Waiting for you » qu'une fois, passé ce délai. */
export const WAITING_LIVE_DELAY_MS = 250

/**
 * « Waiting for you » en direct (séance n°25, W1, critère 3) : une demande décidée ailleurs, depuis le nœud du workflow sur
 * un autre poste ou par une autre personne qui signe, quitte la liste en moins de deux secondes, sans attendre la relecture
 * de fond. La fenêtre écoute le topic des missions de chaque projet où une demande l'attend (`/topic/projects.{id}.delivery`,
 * que le serveur ouvre aux seuls membres du projet), et relit ce qui l'attend à chaque demande tranchée. Une demande qui
 * arrive passe toujours par les signaux de l'agent (`useMissionsSync`).
 */
export function useWaitingLive(slug: string | null | undefined): void {
  const openApprovals = useDeliveryStore((s) => s.openApprovals)
  const fetchOpenApprovals = useDeliveryStore((s) => s.fetchOpenApprovals)
  // Les projets où une demande attend la personne, dans un ordre fixe : la connexion ne change qu'avec eux.
  const projects = useMemo(() => [...new Set(openApprovals
    .map((row) => row.projectId)
    .filter((id): id is number => typeof id === "number"))].sort((a, b) => a - b).join(","), [openApprovals])

  useEffect(() => {
    if (!slug || !projects) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const onEvent = (body: string) => {
      let event: ProjectDeliveryEvent | null = null
      try {
        event = JSON.parse(body) as ProjectDeliveryEvent
      } catch {
        return // message non-JSON ignoré
      }
      // Une demande tranchée, signée ou expirée, ou une mission qui finit (ses demandes partent avec elle).
      if (event?.type !== "approval" && event?.type !== "run") return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        void fetchOpenApprovals(slug)
      }, WAITING_LIVE_DELAY_MS)
    }
    const handlers = Object.fromEntries(projects.split(",").map((id) => [deliveryTopic(Number(id)), onEvent]))
    const unsubscribe = subscribeTopics(handlers)
    return () => {
      if (timer) clearTimeout(timer)
      unsubscribe()
    }
  }, [slug, projects, fetchOpenApprovals])
}
