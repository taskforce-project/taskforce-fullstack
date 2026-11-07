"use client"

import { useEffect, useMemo } from "react"

import { useDeliveryStore } from "@/lib/store/delivery-store"
import { useWorkflowStore } from "@/lib/store/workflow-store"
import { isActiveJob, isActiveRun } from "@/lib/window/missions"

/** Le rythme des relectures tant qu'une mission ou une analyse tourne. */
const POLL_MS = 5_000
/** Missions actives dont on fait avancer l'état à chaque tour (borne le nombre d'appels par intervalle). */
const MAX_REFRESHED_RUNS = 5

/**
 * Le travail des agents que la fenêtre montre (la barre de gauche, « Results », « Changes », « Missions », R121 et R122),
 * tenu à jour depuis le shell, comme le bouton d'AI Workflows le faisait : les analyses et les missions au montage, puis
 * une relecture toutes les 5 s tant que l'une d'elles est active.
 */
export function useMissionsSync(slug: string | null | undefined): void {
  const jobs = useWorkflowStore((s) => s.jobs)
  const fetchJobs = useWorkflowStore((s) => s.fetchJobs)
  const runs = useDeliveryStore((s) => s.workspaceRuns)
  const fetchWorkspaceRuns = useDeliveryStore((s) => s.fetchWorkspaceRuns)
  const fetchRun = useDeliveryStore((s) => s.fetchRun)

  const activeJobs = useMemo(() => jobs.filter((j) => isActiveJob(j.status)).length, [jobs])
  const activeRunsKey = useMemo(
    () => runs.filter((r) => isActiveRun(r.status)).map((r) => r.issueId).join(","),
    [runs],
  )

  useEffect(() => {
    if (!slug) return
    void fetchJobs(slug)
    void fetchWorkspaceRuns(slug)
  }, [slug, fetchJobs, fetchWorkspaceRuns])

  useEffect(() => {
    if (!slug || activeJobs === 0) return
    const id = setInterval(() => void fetchJobs(slug), POLL_MS)
    return () => clearInterval(id)
  }, [slug, activeJobs, fetchJobs])

  // Lire la mission d'une issue fait AVANCER son état côté serveur (agents asynchrones, runner local perdu) ; la liste de
  // l'espace, elle, ne fait que lire. D'où les deux appels, dans cet ordre.
  useEffect(() => {
    if (!slug || !activeRunsKey) return
    const issueIds = activeRunsKey.split(",").map(Number).slice(0, MAX_REFRESHED_RUNS)
    const id = setInterval(async () => {
      await Promise.all(issueIds.map((issueId) => fetchRun(slug, issueId)))
      await fetchWorkspaceRuns(slug)
    }, POLL_MS)
    return () => clearInterval(id)
  }, [slug, activeRunsKey, fetchRun, fetchWorkspaceRuns])
}
