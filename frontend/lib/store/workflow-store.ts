import { create } from "zustand"

import {
  launchAnalysis, listAnalysisJobs, answerAnalysis, dismissAnalysisJob,
  getLatestBrief, acceptPriority, pinPriority, dismissPriority, editPriority,
  type AnalysisJob, type AnalysisDepth, type StoredBrief, type StoredPriority,
} from "@/lib/api/analysis-service"

// ---------------------------------------------------------------------------
// Store des workflows d'analyse IA (dock « Workflows IA » + décisions persistées).
// Un store par domaine (règle d'or #7). Les composants gèrent les toasts.
// ---------------------------------------------------------------------------

interface WorkflowState {
  jobs: AnalysisJob[]
  briefByProject: Record<number, StoredBrief | null>
  loadingJobs: boolean

  // Workflows
  fetchJobs: (slug: string) => Promise<void>
  launch: (slug: string, projectId: number, depth: AnalysisDepth) => Promise<AnalysisJob | null>
  answer: (slug: string, jobId: number, answer: string) => Promise<boolean>
  /** Archive un job terminé. Renvoie `false` si l'appel échoue (échec détectable côté composant). */
  dismissJob: (slug: string, jobId: number) => Promise<boolean>
  /** Upsert d'un job reçu en temps réel (STOMP) ou par polling. */
  applyJobUpdate: (job: AnalysisJob) => void

  // Décisions persistées
  fetchBrief: (slug: string, projectId: number) => Promise<void>
  accept: (slug: string, projectId: number, priorityId: number) => Promise<StoredPriority | null>
  pin: (slug: string, projectId: number, priorityId: number) => Promise<void>
  dismissPriority: (slug: string, projectId: number, priorityId: number) => Promise<void>
  editPriority: (slug: string, projectId: number, priorityId: number, payload: { title?: string; rationale?: string }) => Promise<void>
}

/** Remplace une priorité dans le brief d'un projet (immutable). */
function patchPriority(
  briefByProject: Record<number, StoredBrief | null>,
  projectId: number,
  updated: StoredPriority,
): Record<number, StoredBrief | null> {
  const brief = briefByProject[projectId]
  if (!brief) return briefByProject
  return {
    ...briefByProject,
    [projectId]: { ...brief, priorities: brief.priorities.map((p) => (p.id === updated.id ? updated : p)) },
  }
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  jobs: [],
  briefByProject: {},
  loadingJobs: false,

  fetchJobs: async (slug) => {
    set({ loadingJobs: true })
    try {
      set({ jobs: await listAnalysisJobs(slug) })
    } catch {
      /* non bloquant - le dock affiche l'état vide */
    } finally {
      set({ loadingJobs: false })
    }
  },

  launch: async (slug, projectId, depth) => {
    try {
      const job = await launchAnalysis(slug, projectId, depth)
      set((s) => ({ jobs: [job, ...s.jobs.filter((j) => j.id !== job.id)] }))
      return job
    } catch {
      return null
    }
  },

  answer: async (slug, jobId, answer) => {
    try {
      get().applyJobUpdate(await answerAnalysis(slug, jobId, answer))
      return true
    } catch {
      return false
    }
  },

  dismissJob: async (slug, jobId) => {
    try {
      await dismissAnalysisJob(slug, jobId)
      set((s) => ({ jobs: s.jobs.filter((j) => j.id !== jobId) }))
      return true
    } catch {
      return false
    }
  },

  applyJobUpdate: (job) =>
    set((s) => ({
      jobs: s.jobs.some((j) => j.id === job.id)
        ? s.jobs.map((j) => (j.id === job.id ? job : j))
        : [job, ...s.jobs],
    })),

  fetchBrief: async (slug, projectId) => {
    try {
      const brief = await getLatestBrief(slug, projectId)
      set((s) => ({ briefByProject: { ...s.briefByProject, [projectId]: brief } }))
    } catch {
      /* non bloquant */
    }
  },

  accept: async (slug, projectId, priorityId) => {
    try {
      const p = await acceptPriority(slug, priorityId)
      set((s) => ({ briefByProject: patchPriority(s.briefByProject, projectId, p) }))
      return p
    } catch {
      return null
    }
  },

  pin: async (slug, projectId, priorityId) => {
    try {
      const p = await pinPriority(slug, priorityId)
      set((s) => ({ briefByProject: patchPriority(s.briefByProject, projectId, p) }))
    } catch {
      /* ignore */
    }
  },

  dismissPriority: async (slug, projectId, priorityId) => {
    try {
      const p = await dismissPriority(slug, priorityId)
      set((s) => ({ briefByProject: patchPriority(s.briefByProject, projectId, p) }))
    } catch {
      /* ignore */
    }
  },

  editPriority: async (slug, projectId, priorityId, payload) => {
    try {
      const p = await editPriority(slug, priorityId, payload)
      set((s) => ({ briefByProject: patchPriority(s.briefByProject, projectId, p) }))
    } catch {
      /* ignore */
    }
  },
}))
