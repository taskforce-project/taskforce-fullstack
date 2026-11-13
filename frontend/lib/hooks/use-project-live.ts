"use client"

import { useEffect } from "react"

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

/** Le topic des missions d'un projet et celui de ses analyses IA. */
export const deliveryTopic = (projectId: number): string => `/topic/projects.${projectId}.delivery`
export const analysisTopic = (projectId: number): string => `/topic/projects.${projectId}.analysis`

function parse<T>(body: string): T | null {
  try {
    return JSON.parse(body) as T
  } catch {
    return null // message non-JSON ignoré
  }
}

/**
 * Le direct d'un projet ouvert (la vue du workflow, R166) : ses missions et leurs demandes, les liens entre ses issues, ses
 * analyses IA. Au montage, la première page des missions du projet se lit, avec la chronologie de celles qui sont en
 * cours, et les liens entre ses issues ; puis `/topic/projects.{id}.delivery` et `/topic/projects.{id}.analysis`
 * s'écoutent sur une seule connexion :
 * - une mission dont l'état, le résultat ou une demande change se relit, sa ligne avec ce que la personne peut décider ;
 * - une étape de plus devient son étape en cours, et sa chronologie prend la suite : `missionSequence` en tire les cinq
 *   étapes, comme sur la vue du travail ;
 * - une analyse qui change remplace la sienne.
 * Après une coupure, tout se relit : ce qui a été publié pendant la coupure est perdu. Les événements des issues (et de
 * leurs liens) passent par `useProjectRealtime`, que l'écran du projet monte aussi.
 */
export function useProjectLive(slug: string | null | undefined, projectId: number | null): void {
  const fetchProjectRuns = useDeliveryStore((s) => s.fetchProjectRuns)
  const fetchProjectRun = useDeliveryStore((s) => s.fetchProjectRun)
  const applyProjectRunStep = useDeliveryStore((s) => s.applyProjectRunStep)
  const fetchActivity = useDeliveryStore((s) => s.fetchActivity)
  const fetchProjectRelations = useIssueStore((s) => s.fetchProjectRelations)
  const applyJobUpdate = useWorkflowStore((s) => s.applyJobUpdate)
  const fetchJobs = useWorkflowStore((s) => s.fetchJobs)

  useEffect(() => {
    if (!slug || !projectId) return
    const timers = new Map<string, ReturnType<typeof setTimeout>>()
    const later = (key: string, task: () => void): void => {
      const pending = timers.get(key)
      if (pending) clearTimeout(pending)
      timers.set(key, setTimeout(() => {
        timers.delete(key)
        task()
      }, PROJECT_LIVE_DELAY_MS))
    }

    const load = async (): Promise<void> => {
      void fetchProjectRelations(slug, projectId)
      const rows = await fetchProjectRuns(slug, projectId)
      for (const row of (rows ?? []).filter((r) => r.run.status === "RUNNING").slice(0, MAX_FOLLOWED_TIMELINES)) {
        void fetchActivity(slug, row.run.id)
      }
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
    let connections = 0
    const unsubscribe = subscribeTopics(
      { [deliveryTopic(projectId)]: onDelivery, [analysisTopic(projectId)]: onAnalysis },
      () => {
        connections++
        if (connections === 1) return
        void load()
        void fetchJobs(slug)
      },
    )
    return () => {
      timers.forEach((timer) => clearTimeout(timer))
      timers.clear()
      unsubscribe()
    }
  }, [slug, projectId, fetchProjectRuns, fetchProjectRun, applyProjectRunStep, fetchActivity, fetchProjectRelations,
    applyJobUpdate, fetchJobs])
}
