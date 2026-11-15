"use client"

import { useEffect, useRef } from "react"
import { Client, type IMessage } from "@stomp/stompjs"

import { getSessionToken } from "@/lib/api/session-token"
import { API_URL } from "@/lib/config/urls"
import { buildRealtimeUrls } from "@/lib/hooks/use-stomp"
import { useIssueStore } from "@/lib/store/issue-store"
import type { Issue, ProjectIssueRelation } from "@/lib/api/issue-service"

interface IssueRealtimeEvent {
  action: "created" | "updated" | "deleted" | "activity" | "relation.added" | "relation.removed"
  projectId: number
  issueId: number
  issue: Issue | null
  /** Le lien posé ou retiré, pour `relation.added` et `relation.removed` (R166). */
  relation?: ProjectIssueRelation | null
}

/**
 * Abonne le board d'un projet aux événements d'issues en temps réel (PROD-1.6).
 * Le backend publie sur `/topic/projects.{projectId}` (IssueService) ; on patche le store
 * (upsert/remove) - idempotent par id, donc pas de doublon avec ses propres actions. Les liens entre issues posés ou
 * retirés y passent aussi (R166) : ceux du projet, s'ils sont lus, se mettent à jour.
 */
export function useProjectRealtime(projectId: number | null) {
  const upsert = useIssueStore((s) => s.upsertIssueLocal)
  const remove = useIssueStore((s) => s.removeIssueLocal)
  const upsertRelation = useIssueStore((s) => s.upsertRelationLocal)
  const removeRelation = useIssueStore((s) => s.removeRelationLocal)
  const clientRef = useRef<Client | null>(null)

  useEffect(() => {
    if (globalThis.window === undefined || !projectId) return

    let disposed = false
    let fallbackTriggered = false
    let connectedOnce = false
    const token = getSessionToken()
    const { wsUrl, sockJsUrl } = buildRealtimeUrls(API_URL)
    const connectHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}

    function handle(msg: IMessage) {
      try {
        const evt = JSON.parse(msg.body) as IssueRealtimeEvent
        if (evt.action === "deleted") {
          remove(evt.issueId)
        } else if (evt.action === "relation.added" && evt.relation) {
          upsertRelation(evt.projectId, evt.relation)
        } else if (evt.action === "relation.removed" && evt.relation) {
          removeRelation(evt.projectId, evt.relation.id)
        } else if (evt.issue) {
          upsert(evt.issue)
        }
      } catch {
        // message non-JSON ignoré
      }
    }

    async function activate(useSockJs: boolean) {
      if (disposed) return
      // Fallback chargé À LA DEMANDE : sur le chemin nominal (WS natif), SockJS n'est jamais importé,
      // donc son écouteur `unload` - déprécié (audit Lighthouse best-practices) - n'est pas enregistré
      // et il ne pèse pas sur le bundle initial. Le repli reste identique si le WS natif échoue.
      const SockJS = useSockJs ? (await import("sockjs-client")).default : null
      if (disposed) return
      const client = new Client({
        brokerURL: useSockJs ? undefined : wsUrl,
        webSocketFactory: SockJS ? () => new SockJS(sockJsUrl) : undefined,
        connectHeaders,
        reconnectDelay: 5000,
        onConnect: () => {
          connectedOnce = true
          client.subscribe(`/topic/projects.${projectId}`, handle)
        },
        onWebSocketClose: () => {
          if (!connectedOnce && !useSockJs && !fallbackTriggered && !disposed) {
            fallbackTriggered = true
            void client.deactivate().finally(() => void activate(true))
          }
        },
      })
      client.activate()
      clientRef.current = client
    }

    void activate(false)

    return () => {
      disposed = true
      const current = clientRef.current
      clientRef.current = null
      if (current) void current.deactivate()
    }
  }, [projectId, upsert, remove, upsertRelation, removeRelation])
}
