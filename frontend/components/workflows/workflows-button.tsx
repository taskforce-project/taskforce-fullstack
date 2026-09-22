"use client"

import { useEffect, useMemo } from "react"
import { Layers } from "lucide-react"

import { useWorkspaceStore } from "@/lib/store/workspace-store"
import { useWorkflowStore } from "@/lib/store/workflow-store"
import { useDeliveryStore } from "@/lib/store/delivery-store"
import { toggleWorkflowPanel, isActiveJob, isActiveRun } from "@/components/workflows/workflow-dock"

/** Runs actifs dont on fait avancer l'état à chaque tour (borne le nombre d'appels par intervalle). */
const MAX_REFRESHED_RUNS = 5

/**
 * Bouton topbar « Workflows IA » - ouvre le panneau et porte le cycle de vie des données :
 * charge les analyses ET les délégations au montage puis **poll tant que l'une d'elles est active** (le
 * badge reflète le nombre en cours, même quand le panneau est fermé). STOMP viendra compléter le polling.
 */
export function WorkflowsButton() {
  const slug = useWorkspaceStore((s) => s.activeWorkspace?.slug) ?? ""
  const jobs = useWorkflowStore((s) => s.jobs)
  const fetchJobs = useWorkflowStore((s) => s.fetchJobs)
  const runs = useDeliveryStore((s) => s.workspaceRuns)
  const fetchWorkspaceRuns = useDeliveryStore((s) => s.fetchWorkspaceRuns)
  const fetchRun = useDeliveryStore((s) => s.fetchRun)

  const activeJobs = useMemo(() => jobs.filter((j) => isActiveJob(j.status)).length, [jobs])
  const activeRunIssueIds = useMemo(
    () => runs.filter((r) => isActiveRun(r.status)).map((r) => r.issueId),
    [runs],
  )
  const activeCount = activeJobs + activeRunIssueIds.length
  const activeRunsKey = activeRunIssueIds.join(",")

  useEffect(() => {
    if (!slug) return
    fetchJobs(slug)
    fetchWorkspaceRuns(slug)
  }, [slug, fetchJobs, fetchWorkspaceRuns])

  useEffect(() => {
    if (!slug || activeJobs === 0) return
    const t = setInterval(() => fetchJobs(slug), 5000)
    return () => clearInterval(t)
  }, [slug, activeJobs, fetchJobs])

  // Délégations actives : lire le run d'une issue fait AVANCER son état côté serveur (agents asynchrones,
  // runner local perdu) ; la liste du workspace, elle, ne fait que lire. D'où les deux appels, dans cet ordre.
  useEffect(() => {
    if (!slug || !activeRunsKey) return
    const issueIds = activeRunsKey.split(",").map(Number).slice(0, MAX_REFRESHED_RUNS)
    const t = setInterval(async () => {
      await Promise.all(issueIds.map((issueId) => fetchRun(slug, issueId)))
      fetchWorkspaceRuns(slug)
    }, 5000)
    return () => clearInterval(t)
  }, [slug, activeRunsKey, fetchRun, fetchWorkspaceRuns])

  return (
    <button
      type="button"
      onClick={toggleWorkflowPanel}
      title="Workflows IA"
      aria-label="Open AI workflows"
      className="relative flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <Layers className="size-4" />
      {activeCount > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-500 px-1 text-[9px] font-bold tabular-nums text-white">
          {activeCount}
        </span>
      )}
    </button>
  )
}
