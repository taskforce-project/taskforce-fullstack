"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Network } from "lucide-react"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { WorkflowCanvas } from "@/components/workflows/workflow-canvas"
import { useWorkflowStore } from "@/lib/store/workflow-store"
import { useDeliveryStore } from "@/lib/store/delivery-store"

/**
 * Ouvre le canvas React Flow unifie du workflow IA en grand (les workflows d'analyse + les delegations
 * vers agents). Charge a l'ouverture les runs du workspace + les providers ; les jobs viennent du dock.
 */
export function WorkflowCanvasDialog({ open, onOpenChange }: Readonly<{ open: boolean; onOpenChange: (o: boolean) => void }>) {
  const params = useParams()
  const router = useRouter()
  const slug = typeof params?.workspace === "string" ? params.workspace : ""

  const jobs = useWorkflowStore((s) => s.jobs)
  const fetchJobs = useWorkflowStore((s) => s.fetchJobs)
  const workspaceRuns = useDeliveryStore((s) => s.workspaceRuns)
  const providers = useDeliveryStore((s) => s.providers)
  const fetchWorkspaceRuns = useDeliveryStore((s) => s.fetchWorkspaceRuns)
  const fetchProviders = useDeliveryStore((s) => s.fetchProviders)

  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !slug) return
    setLoading(true)
    Promise.all([
      fetchJobs(slug),
      fetchWorkspaceRuns(slug),
      providers.length ? Promise.resolve(providers) : fetchProviders(slug),
    ]).finally(() => setLoading(false))
    // providers.length volontairement hors deps : on ne recharge pas a chaque changement de liste.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, slug, fetchJobs, fetchWorkspaceRuns, fetchProviders])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[86vh] max-w-[92vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[92vw]">
        <DialogHeader className="flex-row items-center gap-2 border-b px-4 py-3">
          <Network className="size-4 text-primary" />
          <DialogTitle className="text-sm font-semibold">AI Workflow canvas</DialogTitle>
          <span className="ml-1 text-xs text-muted-foreground">
            {jobs.length} workflow(s) · {workspaceRuns.length} delegation(s)
          </span>
        </DialogHeader>
        <div className="relative min-h-0 flex-1">
          {loading && jobs.length === 0 && workspaceRuns.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading the graph…</div>
          ) : (
            <WorkflowCanvas
              jobs={jobs}
              runs={workspaceRuns}
              providers={providers}
              onSelectProject={() => { onOpenChange(false); router.push(`/${slug}/analytics`) }}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
