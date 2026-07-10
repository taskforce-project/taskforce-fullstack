"use client"

import { useEffect, useMemo } from "react"
import { Layers } from "lucide-react"

import { useWorkspaceStore } from "@/lib/store/workspace-store"
import { useWorkflowStore } from "@/lib/store/workflow-store"
import { toggleWorkflowPanel, isActiveJob } from "@/components/workflows/workflow-dock"

/**
 * Bouton topbar « Workflows IA » — ouvre le panneau et porte le cycle de vie des données :
 * charge les workflows au montage puis **poll tant qu'un job est actif** (le badge reflète le
 * nombre en cours, même quand le panneau est fermé). STOMP viendra compléter le polling.
 */
export function WorkflowsButton() {
  const slug = useWorkspaceStore((s) => s.activeWorkspace?.slug) ?? ""
  const jobs = useWorkflowStore((s) => s.jobs)
  const fetchJobs = useWorkflowStore((s) => s.fetchJobs)

  const activeCount = useMemo(() => jobs.filter((j) => isActiveJob(j.status)).length, [jobs])
  const hasActive = activeCount > 0

  useEffect(() => { if (slug) fetchJobs(slug) }, [slug, fetchJobs])

  useEffect(() => {
    if (!slug || !hasActive) return
    const t = setInterval(() => fetchJobs(slug), 5000)
    return () => clearInterval(t)
  }, [slug, hasActive, fetchJobs])

  return (
    <button
      type="button"
      onClick={toggleWorkflowPanel}
      title="Workflows IA"
      aria-label="Ouvrir les workflows IA"
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
