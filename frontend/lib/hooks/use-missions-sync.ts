"use client"

import { useEffect, useMemo } from "react"

import { useDeliveryStore } from "@/lib/store/delivery-store"
import { useNotificationStore } from "@/lib/store/notification-store"
import { useWorkflowStore } from "@/lib/store/workflow-store"
import { isActiveJob, isActiveRun } from "@/lib/window/missions"
import { latestAgentSignal } from "@/lib/window/waiting"

/** Le rythme des relectures tant qu'une mission ou une analyse tourne. */
const POLL_MS = 5_000
/** Missions actives dont on fait avancer l'état à chaque tour (borne le nombre d'appels par intervalle). */
const MAX_REFRESHED_RUNS = 5

/**
 * Le travail des agents que la fenêtre montre (la barre de gauche, « Waiting for you », « Results », « Changes »,
 * « Missions », R121, R122 et R128), tenu à jour depuis le shell, comme le bouton d'AI Workflows le faisait : les
 * analyses, les missions et les demandes ouvertes au montage, puis une relecture toutes les 5 s tant que l'une d'elles
 * est active, et à chaque signal d'un agent reçu : une mission partie d'un autre écran n'est pas encore dans la liste.
 */
export function useMissionsSync(slug: string | null | undefined): void {
  const jobs = useWorkflowStore((s) => s.jobs)
  const fetchJobs = useWorkflowStore((s) => s.fetchJobs)
  const runs = useDeliveryStore((s) => s.workspaceRuns)
  const fetchWorkspaceRuns = useDeliveryStore((s) => s.fetchWorkspaceRuns)
  const fetchOpenApprovals = useDeliveryStore((s) => s.fetchOpenApprovals)
  const fetchRun = useDeliveryStore((s) => s.fetchRun)
  const agentSignal = useNotificationStore((s) => latestAgentSignal(s.signals))

  const activeJobs = useMemo(() => jobs.filter((j) => isActiveJob(j.status)).length, [jobs])
  const activeRunsKey = useMemo(
    () => runs.filter((r) => isActiveRun(r.status)).map((r) => r.issueId).join(","),
    [runs],
  )

  useEffect(() => {
    if (!slug) return
    void fetchJobs(slug)
  }, [slug, fetchJobs])

  // Au montage, puis à chaque signal d'un agent : une demande arrivée, une mission finie comptent tout de suite.
  useEffect(() => {
    if (!slug) return
    void fetchWorkspaceRuns(slug)
    void fetchOpenApprovals(slug)
  }, [slug, agentSignal, fetchWorkspaceRuns, fetchOpenApprovals])

  useEffect(() => {
    if (!slug || activeJobs === 0) return
    const id = setInterval(() => void fetchJobs(slug), POLL_MS)
    return () => clearInterval(id)
  }, [slug, activeJobs, fetchJobs])

  // Lire la mission d'une issue fait AVANCER son état côté serveur (agents asynchrones, runner local perdu) ; la liste de
  // l'espace et les demandes ouvertes, elles, ne font que lire. D'où les deux temps, dans cet ordre.
  useEffect(() => {
    if (!slug || !activeRunsKey) return
    const issueIds = activeRunsKey.split(",").map(Number).slice(0, MAX_REFRESHED_RUNS)
    const id = setInterval(async () => {
      await Promise.all(issueIds.map((issueId) => fetchRun(slug, issueId)))
      await Promise.all([fetchWorkspaceRuns(slug), fetchOpenApprovals(slug)])
    }, POLL_MS)
    return () => clearInterval(id)
  }, [slug, activeRunsKey, fetchRun, fetchWorkspaceRuns, fetchOpenApprovals])
}
