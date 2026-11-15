"use client"

import { useEffect, useState } from "react"

import type { AnalysisJob } from "@/lib/api/analysis-service"
import type { ProjectDeliveryEvent } from "@/lib/api/delivery-service"
import { subscribeTopics } from "@/lib/hooks/use-stomp"
import { useDeliveryStore } from "@/lib/store/delivery-store"
import { useIssueStore } from "@/lib/store/issue-store"
import { useWorkflowStore } from "@/lib/store/workflow-store"

/** Une rafale d'événements d'une même mission ne la relit qu'une fois, passé ce délai. */
export const PROJECT_LIVE_DELAY_MS = 300

/** Les missions en cours dont la chronologie se lit avec la page : chacune coûte un appel. */
export const MAX_FOLLOWED_TIMELINES = 10

/** Sans connexion après ce délai (la première, ou après une coupure), l'écran se dit hors ligne. */
export const OFFLINE_AFTER_MS = 10_000

/** Le topic des missions d'un projet et celui de ses analyses IA. */
export const deliveryTopic = (projectId: number): string => `/topic/projects.${projectId}.delivery`
export const analysisTopic = (projectId: number): string => `/topic/projects.${projectId}.analysis`

/**
 * Où en est le direct (séance n°25, §10) : `connecting` avant la première connexion, `live` connecté, `reconnecting` après
 * une coupure, `offline` quand rien ne revient ; `readAt`, l'heure de la dernière lecture complète (ce que l'écran montre
 * hors ligne).
 */
export type LiveState = "connecting" | "live" | "reconnecting" | "offline"

export interface ProjectLive {
  readonly state: LiveState
  readonly readAt: number | null
  /** La dernière lecture des missions a échoué : l'écran montre ce qu'il a, et le dit. */
  readonly failed: boolean
}

function parse<T>(body: string): T | null {
  try {
    return JSON.parse(body) as T
  } catch {
    return null // message non-JSON ignoré
  }
}

/**
 * Le direct d'un projet ouvert (la vue du workflow, R166) : ses missions et leurs demandes, les liens entre ses issues, ses
 * analyses IA. Au montage, toutes les missions du projet se lisent page par page (jamais en un seul appel), avec la
 * chronologie de celles qui sont en cours, et les liens entre ses issues ; puis `/topic/projects.{id}.delivery` et
 * `/topic/projects.{id}.analysis` s'écoutent sur une seule connexion :
 * - une mission dont l'état, le résultat ou une demande change se relit, sa ligne avec ce que la personne peut décider ;
 * - une étape de plus devient son étape en cours, et sa chronologie prend la suite : `missionSequence` en tire les cinq
 *   étapes, comme sur la vue du travail ;
 * - une analyse qui change remplace la sienne.
 * Après une coupure, tout se relit : ce qui a été publié pendant la coupure est perdu. Les événements des issues (et de
 * leurs liens) passent par `useProjectRealtime`, que l'écran du projet monte aussi. Rend l'état du direct, que la ligne du
 * titre dit en mots.
 */
export function useProjectLive(slug: string | null | undefined, projectId: number | null): ProjectLive {
  const fetchAllProjectRuns = useDeliveryStore((s) => s.fetchAllProjectRuns)
  const fetchProjectRun = useDeliveryStore((s) => s.fetchProjectRun)
  const applyProjectRunStep = useDeliveryStore((s) => s.applyProjectRunStep)
  const fetchActivity = useDeliveryStore((s) => s.fetchActivity)
  const fetchProjectRelations = useIssueStore((s) => s.fetchProjectRelations)
  const applyJobUpdate = useWorkflowStore((s) => s.applyJobUpdate)
  const fetchJobs = useWorkflowStore((s) => s.fetchJobs)
  // L'état du direct, pour un projet : celui d'un autre projet ne vaut rien ici (l'écran change de projet).
  const key = slug && projectId ? `${slug}:${projectId}` : ""
  const [held, setHeld] = useState<ProjectLive & { key: string }>({ key: "", state: "connecting", readAt: null, failed: false })

  useEffect(() => {
    if (!slug || !projectId) return
    let disposed = false
    const mine = `${slug}:${projectId}`
    const setLive = (change: (was: ProjectLive) => ProjectLive) => setHeld((was) => {
      const current: ProjectLive = was.key === mine ? was : { state: "connecting", readAt: null, failed: false }
      return { key: mine, ...change(current) }
    })
    const timers = new Map<string, ReturnType<typeof setTimeout>>()
    const later = (key: string, task: () => void, delay = PROJECT_LIVE_DELAY_MS): void => {
      const pending = timers.get(key)
      if (pending) clearTimeout(pending)
      timers.set(key, setTimeout(() => {
        timers.delete(key)
        task()
      }, delay))
    }
    const goOffline = () => later("offline", () => {
      if (!disposed) setLive((was) => (was.state === "live" ? was : { ...was, state: "offline" }))
    }, OFFLINE_AFTER_MS)

    const load = async (): Promise<void> => {
      const [, rows] = await Promise.all([fetchProjectRelations(slug, projectId), fetchAllProjectRuns(slug, projectId)])
      for (const row of (rows ?? []).filter((r) => r.run.status === "RUNNING").slice(0, MAX_FOLLOWED_TIMELINES)) {
        void fetchActivity(slug, row.run.id)
      }
      if (!disposed) setLive((was) => (rows === null ? { ...was, failed: true } : { ...was, readAt: Date.now(), failed: false }))
    }

    const onDelivery = (body: string): void => {
      const event = parse<ProjectDeliveryEvent>(body)
      if (!event || event.projectId !== projectId || typeof event.runId !== "number") return
      const { runId } = event
      if (event.type === "step" && event.step) {
        applyProjectRunStep(projectId, runId, event.step)
      } else {
        later(`run:${runId}`, () => void fetchProjectRun(slug, projectId, runId))
      }
      // La chronologie lue prend la suite de ce qui s'est passé : nouvelles étapes, demandes ouvertes ou tranchées.
      later(`timeline:${runId}`, () => void fetchActivity(slug, runId))
    }

    const onAnalysis = (body: string): void => {
      const job = parse<AnalysisJob>(body)
      if (job && typeof job.id === "number" && job.projectId === projectId) applyJobUpdate(job)
    }

    void load()
    goOffline()
    let connections = 0
    const unsubscribe = subscribeTopics(
      { [deliveryTopic(projectId)]: onDelivery, [analysisTopic(projectId)]: onAnalysis },
      () => {
        connections++
        const pending = timers.get("offline")
        if (pending) clearTimeout(pending)
        timers.delete("offline")
        if (!disposed) setLive((was) => ({ ...was, state: "live" }))
        if (connections === 1) return
        void load()
        void fetchJobs(slug)
      },
      () => {
        if (disposed) return
        setLive((was) => ({ ...was, state: "reconnecting" }))
        goOffline()
      },
    )
    return () => {
      disposed = true
      timers.forEach((timer) => clearTimeout(timer))
      timers.clear()
      unsubscribe()
    }
  }, [slug, projectId, fetchAllProjectRuns, fetchProjectRun, applyProjectRunStep, fetchActivity, fetchProjectRelations,
    applyJobUpdate, fetchJobs])

  return held.key === key && key
    ? { state: held.state, readAt: held.readAt, failed: held.failed }
    : { state: "connecting", readAt: null, failed: false }
}
