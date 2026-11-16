"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { useProjectLive, type ProjectLive } from "@/lib/hooks/use-project-live"
import { useProjectRealtime, type ProjectChange } from "@/lib/hooks/use-project-realtime"
import { useDeliveryStore } from "@/lib/store/delivery-store"
import { useIssueStore } from "@/lib/store/issue-store"
import { useProjectStore } from "@/lib/store/project-store"

/** Ce que le workflow a lu : en cours, prêt, ou en échec (l'écran le dit, avec « Try again »). */
export type WorkflowLoad = "loading" | "ready" | "error"

/** Plusieurs documents ajoutés d'un coup ne relisent les nombres qu'une fois, ce délai après le dernier. */
export const DOCUMENTS_SETTLE_MS = 300

/** Les missions qui tardent ne retiennent pas la carte au-delà : elle se montre, et leurs nœuds se mettent à jour à leur arrivée. */
export const RUNS_WAIT_MS = 6_000

export interface WorkflowData {
  readonly load: WorkflowLoad
  readonly live: ProjectLive
  readonly retry: () => void
}

/**
 * Ce que le workflow d'un projet lit (séance n°25, W1), sur les données vivantes seulement : ses colonnes, toutes ses
 * issues (page par page, jamais en un seul appel), toutes ses missions et leurs demandes ouvertes (les pages de W0), les
 * liens entre ses issues, le nombre de leurs documents, son objectif et les agents du projet. Puis le direct : le topic
 * du projet pour les issues et leurs liens (`useProjectRealtime`), celui de ses missions et de ses analyses
 * (`useProjectLive`). Après une coupure, ce que le direct ne relit pas lui-même se relit ici.
 */
export function useWorkflowData(slug: string, projectId: number): WorkflowData {
  const fetchStatuses = useIssueStore((s) => s.fetchStatuses)
  const fetchWorkflowIssues = useIssueStore((s) => s.fetchWorkflowIssues)
  const fetchDocumentCounts = useIssueStore((s) => s.fetchDocumentCounts)
  const fetchObjective = useProjectStore((s) => s.fetchObjective)
  const fetchProjectProviders = useDeliveryStore((s) => s.fetchProjectProviders)
  const runsRead = useDeliveryStore((s) => s.projectRuns[projectId] !== undefined)

  // L'objectif et les documents changés ailleurs (une autre personne, la fiche d'une issue) : la vue les relit.
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onChange = useCallback((change: ProjectChange) => {
    if (!slug || change.projectId !== projectId) return
    if (change.action === "objective.changed") {
      void fetchObjective(slug, projectId)
      return
    }
    if (settle.current) clearTimeout(settle.current)
    settle.current = setTimeout(() => {
      settle.current = null
      void fetchDocumentCounts(slug, projectId)
    }, DOCUMENTS_SETTLE_MS)
  }, [slug, projectId, fetchObjective, fetchDocumentCounts])
  useEffect(() => () => { if (settle.current) clearTimeout(settle.current) }, [])

  useProjectRealtime(projectId || null, onChange)
  const live = useProjectLive(slug, projectId || null)

  const [read, setRead] = useState<{ key: string; state: "loading" | "ready" | "error" }>({ key: "", state: "loading" })
  const [waited, setWaited] = useState<string>("")
  const [attempt, setAttempt] = useState(0)
  const key = `${slug}:${projectId}:${attempt}`

  useEffect(() => {
    if (!slug || !projectId) return
    let cancelled = false
    const timer = setTimeout(() => { if (!cancelled) setWaited(key) }, RUNS_WAIT_MS)
    void (async () => {
      const [statuses, issues] = await Promise.all([
        fetchStatuses(slug, projectId),
        fetchWorkflowIssues(slug, projectId),
        fetchDocumentCounts(slug, projectId),
        fetchObjective(slug, projectId),
        fetchProjectProviders(slug, projectId),
      ])
      if (cancelled) return
      // Les colonnes qui manquent faute de réponse (et non parce que le projet n'en a pas) : le store garde l'erreur.
      const failed = issues === null || (statuses.length === 0 && useIssueStore.getState().error !== null)
      setRead({ key, state: failed ? "error" : "ready" })
    })()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [slug, projectId, key, fetchStatuses, fetchWorkflowIssues, fetchDocumentCounts, fetchObjective, fetchProjectProviders])

  // Après une coupure du direct, les issues, leurs documents et l'objectif se relisent aussi : ce qui a été publié pendant
  // la coupure est perdu.
  const was = useRef(live.state)
  useEffect(() => {
    const before = was.current
    was.current = live.state
    if (live.state === "live" && (before === "reconnecting" || before === "offline") && slug && projectId) {
      void fetchWorkflowIssues(slug, projectId)
      void fetchDocumentCounts(slug, projectId)
      void fetchObjective(slug, projectId)
    }
  }, [live.state, slug, projectId, fetchWorkflowIssues, fetchDocumentCounts, fetchObjective])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  const state = read.key === key ? read.state : "loading"
  // La carte attend ses missions un moment : sans elles, une issue au travail se lirait « Not started ».
  const load: WorkflowLoad = state === "ready" && !runsRead && !live.failed && waited !== key ? "loading" : state
  return { load, live, retry }
}
