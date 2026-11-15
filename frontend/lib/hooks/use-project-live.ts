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
 * analyses IA. Au montage, la première page des missions du projet se lit, chacune avec son étape en cours, et les liens
 * entre ses issues ; puis `/topic/projects.{id}.delivery` et `/topic/projects.{id}.analysis` s'écoutent sur une seule
 * connexion :
 * - chaque événement d'une mission porte son étape en cours, que le serveur calcule avec les règles de la vue du travail
 *   (`contracts/mission-steps`) : elle se pose tout de suite, sans lire la chronologie de la mission ;
 * - une mission dont l'état, le résultat ou une demande change se relit aussi, sa ligne avec ce que la personne peut
 *   décider ; une étape de plus, non ;
 * - une analyse qui change remplace la sienne.
 * À chaque connexion, la première comprise, tout se relit, analyses comprises : ce qui a été publié entre la lecture du
 * montage et l'abonnement, ou pendant une coupure, est perdu pour le topic. Les événements des issues (et de leurs liens)
 * passent par `useProjectRealtime`, que l'écran du projet monte aussi.
 */
export function useProjectLive(slug: string | null | undefined, projectId: number | null): void {
  const fetchProjectRuns = useDeliveryStore((s) => s.fetchProjectRuns)
  const fetchProjectRun = useDeliveryStore((s) => s.fetchProjectRun)
  const applyProjectRunStep = useDeliveryStore((s) => s.applyProjectRunStep)
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

    const load = (): void => {
      void fetchProjectRelations(slug, projectId)
      void fetchProjectRuns(slug, projectId)
    }

    const onDelivery = (body: string): void => {
      const event = parse<ProjectDeliveryEvent>(body)
      if (!event || event.projectId !== projectId || typeof event.runId !== "number") return
      const { runId } = event
      if (event.step) applyProjectRunStep(projectId, runId, event.step)
      // Une étape de plus ne change que l'étape ; le reste, et ce que la personne peut décider, se relit.
      if (event.type !== "step" || !event.step) later(`run:${runId}`, () => void fetchProjectRun(slug, projectId, runId))
    }

    const onAnalysis = (body: string): void => {
      const job = parse<AnalysisJob>(body)
      if (job && typeof job.id === "number" && job.projectId === projectId) applyJobUpdate(job)
    }

    load()
    const unsubscribe = subscribeTopics(
      { [deliveryTopic(projectId)]: onDelivery, [analysisTopic(projectId)]: onAnalysis },
      () => {
        // À chaque connexion, la première comprise : ce qui a été publié avant l'abonnement, ou pendant une coupure,
        // n'arrive jamais par le topic.
        load()
        void fetchJobs(slug)
      },
    )
    return () => {
      timers.forEach((timer) => clearTimeout(timer))
      timers.clear()
      unsubscribe()
    }
  }, [slug, projectId, fetchProjectRuns, fetchProjectRun, applyProjectRunStep, fetchProjectRelations, applyJobUpdate,
    fetchJobs])
}
