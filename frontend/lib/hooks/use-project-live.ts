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

/** Sans connexion après ce délai (la première, ou après une coupure), l'écran se dit hors ligne. */
export const OFFLINE_AFTER_MS = 10_000

/** Le topic des missions d'un projet et celui de ses analyses IA. */
export const deliveryTopic = (projectId: number): string => `/topic/projects.${projectId}.delivery`
export const analysisTopic = (projectId: number): string => `/topic/projects.${projectId}.analysis`

/**
 * Où en est le direct (séance n°25, §10) : `connecting` avant la première connexion, `live` connecté, `reconnecting` après
 * une coupure, `offline` quand rien ne revient ; `readAt`, l'heure de la dernière lecture complète (ce que l'écran montre
 * hors ligne) ; `failed`, la dernière lecture des missions a échoué.
 */
export type LiveState = "connecting" | "live" | "reconnecting" | "offline"

export interface ProjectLive {
  readonly state: LiveState
  readonly readAt: number | null
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
 * analyses IA. Au montage, toutes les missions du projet se lisent, page par page (jamais en un seul appel : le workflow
 * tient des projets de 300 missions), chacune avec son étape en cours, et les liens entre ses issues ; puis
 * `/topic/projects.{id}.delivery` et `/topic/projects.{id}.analysis` s'écoutent sur une seule connexion :
 * - chaque événement d'une mission porte son étape en cours, que le serveur calcule avec les règles de la vue du travail
 *   (`contracts/mission-steps`) : elle se pose tout de suite, sans lire la chronologie de la mission ;
 * - une mission dont l'état, le résultat ou une demande change se relit aussi, sa ligne avec ce que la personne peut
 *   décider ; une étape de plus, non ;
 * - une analyse qui change remplace la sienne.
 * À chaque connexion, la première comprise, tout se relit, analyses comprises : ce qui a été publié entre la lecture du
 * montage et l'abonnement, ou pendant une coupure, est perdu pour le topic. Les événements des issues (et de leurs liens)
 * passent par `useProjectRealtime`, que l'écran du projet monte aussi. Rend l'état du direct, que la ligne du titre du
 * workflow dit en mots.
 */
export function useProjectLive(slug: string | null | undefined, projectId: number | null): ProjectLive {
  const fetchAllProjectRuns = useDeliveryStore((s) => s.fetchAllProjectRuns)
  const fetchProjectRun = useDeliveryStore((s) => s.fetchProjectRun)
  const applyProjectRunStep = useDeliveryStore((s) => s.applyProjectRunStep)
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
    const later = (name: string, task: () => void, delay = PROJECT_LIVE_DELAY_MS): void => {
      const pending = timers.get(name)
      if (pending) clearTimeout(pending)
      timers.set(name, setTimeout(() => {
        timers.delete(name)
        task()
      }, delay))
    }
    const goOffline = () => later("offline", () => {
      if (!disposed) setLive((was) => (was.state === "live" ? was : { ...was, state: "offline" }))
    }, OFFLINE_AFTER_MS)

    const load = async (): Promise<void> => {
      const [, rows] = await Promise.all([fetchProjectRelations(slug, projectId), fetchAllProjectRuns(slug, projectId)])
      if (!disposed) setLive((was) => (rows === null ? { ...was, failed: true } : { ...was, readAt: Date.now(), failed: false }))
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

    void load()
    goOffline()
    const unsubscribe = subscribeTopics(
      { [deliveryTopic(projectId)]: onDelivery, [analysisTopic(projectId)]: onAnalysis },
      () => {
        const pending = timers.get("offline")
        if (pending) clearTimeout(pending)
        timers.delete("offline")
        if (!disposed) setLive((was) => ({ ...was, state: "live" }))
        // À chaque connexion, la première comprise : ce qui a été publié avant l'abonnement, ou pendant une coupure,
        // n'arrive jamais par le topic.
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
  }, [slug, projectId, fetchAllProjectRuns, fetchProjectRun, applyProjectRunStep, fetchProjectRelations, applyJobUpdate,
    fetchJobs])

  return held.key === key && key
    ? { state: held.state, readAt: held.readAt, failed: held.failed }
    : { state: "connecting", readAt: null, failed: false }
}
