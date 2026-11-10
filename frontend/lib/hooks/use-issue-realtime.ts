"use client"

import { useEffect, useRef } from "react"

import { subscribeTopic } from "@/lib/hooks/use-stomp"

/** Ce qui compte d'un événement du topic d'un projet (IssueService) : de quelle issue il parle, et ce qui lui arrive. */
interface IssueEvent {
  action?: string
  issueId?: number
}

/** Une rafale (plusieurs lignes d'activité d'un même geste) ne relit qu'une fois, passé ce délai. */
export const ISSUE_REFRESH_DELAY_MS = 300

/**
 * Tant que la fiche d'une issue est ouverte, ce qui arrive à cette issue la rafraîchit : le commentaire qu'un agent
 * laisse pendant sa mission, ce qu'il coche, la pull request qu'il ouvre, comme le geste d'un coéquipier (rejeu de la
 * 1.8.0, 02/11/2026 : le commentaire de l'agent n'apparaissait qu'en rouvrant l'issue). Le backend publie sur
 * `/topic/projects.{projectId}` : `activity` quand l'activité de l'issue a bougé, `updated` quand l'issue a changé.
 * Seuls les événements de cette issue comptent ; une issue supprimée n'a plus rien à relire.
 */
export function useIssueRealtime(projectId: number | null, issueId: number | null, onChange: () => void) {
  const latest = useRef(onChange)
  useEffect(() => {
    latest.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!projectId || !issueId) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const unsubscribe = subscribeTopic(`/topic/projects.${projectId}`, (body) => {
      let event: IssueEvent
      try {
        event = JSON.parse(body) as IssueEvent
      } catch {
        return // message non-JSON ignoré
      }
      if (event.issueId !== issueId || event.action === "deleted") return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        latest.current()
      }, ISSUE_REFRESH_DELAY_MS)
    })
    return () => {
      if (timer) clearTimeout(timer)
      unsubscribe()
    }
  }, [projectId, issueId])
}
