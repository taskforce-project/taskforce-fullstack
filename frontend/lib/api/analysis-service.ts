/**
 * Service des **workflows d'analyse IA** — async, persistés, actionnables.
 * Un workflow (`AnalysisJob`) tourne en arrière-plan ; son plan (`AgentPlan`) reflète
 * les étapes en direct ; quand il aboutit, il produit un `StoredBrief` dont chaque
 * priorité est actionnable (accepter → issue, épingler, écarter, éditer).
 *
 * Routes : lib/config/api-routes.ts (ANALYSIS_ROUTES). Enveloppe `response.data.data`.
 */
import { apiClient, AI_TIMEOUT_MS } from "./client"
import { ANALYSIS_ROUTES } from "../config/api-routes"
import type { PlanTask } from "@/components/ui/agent-plan"
import type { DecisionSnapshot } from "./analytics-service"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type JobStatus = "QUEUED" | "RUNNING" | "WAITING_FOR_INPUT" | "DONE" | "FAILED"
export type AnalysisDepth = "QUICK" | "DEEP"

/** Un workflow d'analyse en cours / terminé. */
export interface AnalysisJob {
  id: number
  projectId: number
  projectName: string
  depth: AnalysisDepth
  status: JobStatus
  /** Étapes du workflow (arbre agent-plan) — mis à jour en direct. */
  plan: PlanTask[]
  /** HITL : question du modèle quand `status === "WAITING_FOR_INPUT"`. */
  question: string | null
  /** Message d'erreur quand `status === "FAILED"`. */
  error: string | null
  /** Brief produit quand `status === "DONE"`. */
  briefId: number | null
  createdAt: string
  updatedAt: string
}

export type PriorityStatus = "NEW" | "ACCEPTED" | "PINNED" | "DISMISSED"

/** Une priorité persistée & actionnable. */
export interface StoredPriority {
  id: number
  level: "HIGH" | "MEDIUM" | "LOW"
  title: string
  rationale: string
  status: PriorityStatus
  /** Issue créée à l'acceptation (null sinon). */
  issueId: number | null
  issueIdentifier: string | null
  position: number
}

/** Décision du jour persistée (situation + risques + priorités). */
export interface StoredBrief {
  id: number
  projectId: number
  situation: string
  risks: string[]
  snapshot: DecisionSnapshot
  priorities: StoredPriority[]
  mode: "generated" | "fallback"
  createdAt: string
}

// ---------------------------------------------------------------------------
// Workflows
// ---------------------------------------------------------------------------

/** Lance un workflow d'analyse (retour immédiat — il tourne en arrière-plan). */
export async function launchAnalysis(slug: string, projectId: number, depth: AnalysisDepth): Promise<AnalysisJob> {
  const res = await apiClient.post<{ data: AnalysisJob }>(ANALYSIS_ROUTES.JOBS(slug), { projectId, depth })
  return res.data.data
}

/** Liste les workflows récents du workspace (pour le dock). */
export async function listAnalysisJobs(slug: string): Promise<AnalysisJob[]> {
  const res = await apiClient.get<{ data: AnalysisJob[] }>(ANALYSIS_ROUTES.JOBS(slug))
  return res.data.data
}

export async function getAnalysisJob(slug: string, jobId: number): Promise<AnalysisJob> {
  const res = await apiClient.get<{ data: AnalysisJob }>(ANALYSIS_ROUTES.JOB(slug, jobId))
  return res.data.data
}

/** Répond à la question du modèle (HITL) → le workflow reprend. */
export async function answerAnalysis(slug: string, jobId: number, answer: string): Promise<AnalysisJob> {
  const res = await apiClient.post<{ data: AnalysisJob }>(
    ANALYSIS_ROUTES.ANSWER(slug, jobId), { answer }, { timeout: AI_TIMEOUT_MS },
  )
  return res.data.data
}

/** Retire un workflow du dock (terminé/échoué). */
export async function dismissAnalysisJob(slug: string, jobId: number): Promise<void> {
  await apiClient.delete(ANALYSIS_ROUTES.JOB(slug, jobId))
}

// ---------------------------------------------------------------------------
// Brief persisté + actions sur les priorités
// ---------------------------------------------------------------------------

/** Dernier brief persisté d'un projet (null si aucune analyse). */
export async function getLatestBrief(slug: string, projectId: number): Promise<StoredBrief | null> {
  const res = await apiClient.get<{ data: StoredBrief | null }>(ANALYSIS_ROUTES.BRIEF(slug, projectId))
  return res.data.data
}

/** Accepte une priorité → crée l'issue liée + statut ACCEPTED. */
export async function acceptPriority(slug: string, priorityId: number): Promise<StoredPriority> {
  const res = await apiClient.post<{ data: StoredPriority }>(ANALYSIS_ROUTES.PRIORITY_ACCEPT(slug, priorityId))
  return res.data.data
}

/** Épingle / détache une priorité (toggle). */
export async function pinPriority(slug: string, priorityId: number): Promise<StoredPriority> {
  const res = await apiClient.post<{ data: StoredPriority }>(ANALYSIS_ROUTES.PRIORITY_PIN(slug, priorityId))
  return res.data.data
}

/** Écarte une priorité, ou la restaure si elle l'était déjà (bascule — feedback modèle). */
export async function dismissPriority(slug: string, priorityId: number): Promise<StoredPriority> {
  const res = await apiClient.post<{ data: StoredPriority }>(ANALYSIS_ROUTES.PRIORITY_DISMISS(slug, priorityId))
  return res.data.data
}

/** Édite le titre / la justification d'une priorité. */
export async function editPriority(
  slug: string, priorityId: number, payload: { title?: string; rationale?: string },
): Promise<StoredPriority> {
  const res = await apiClient.put<{ data: StoredPriority }>(ANALYSIS_ROUTES.PRIORITY(slug, priorityId), payload)
  return res.data.data
}
