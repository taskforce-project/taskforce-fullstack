/**
 * Les processus (ADR-027) : un sous-ensemble de BPMN 2.0, que TaskForce garde dans son propre modèle et ne montre jamais
 * avec la notation de BPMN. Le serveur rend des données ; les seules phrases sont celles de son vérificateur, qui dit
 * pourquoi un processus n'entre pas. Le XML de BPMN n'est qu'un format d'échange : on l'exporte, on l'importe.
 */
import axios from "axios"

import { apiClient } from "./client"
import { PROCESS_ROUTES } from "../config/api-routes"

/** La structure (début, fin, phase, partage, échéance, échec) et les cinq types d'étapes. */
export type ProcessStepType =
  | "start"
  | "end"
  | "stage"
  | "parallel"
  | "deadline"
  | "failure"
  | "agent"
  | "human"
  | "decision"
  | "wait"
  | "zone"

/** Qui répond, qui fait, qui fournit : `person:42`, `role:owner`, `role:admin` ou `project-lead`. */
export type ProcessPersonRef = string

export type LockSource = "floor" | "rule" | "author" | "pause-point"
export type PausePoint = "before-mission" | "before-apply" | "before-delivery"
export type HumanTaskKind = "approval" | "input" | "checklist"
export type SignatureMeaning = "review" | "approval" | "responsibility" | "authorship"
export type FieldType = "text" | "number" | "date" | "choice" | "person" | "document"
export type ConditionOutcome = "approved" | "refused" | "succeeded" | "failed"

/** Le verrou d'une étape et sa source ; pour un point de pause, `ref` dit lequel. */
export interface ProcessLock {
  by: LockSource
  ref?: string
}

export interface AgentSettings {
  provider: string
  /** Absent : le modèle de l'espace. */
  model?: string
  tools?: string[]
  attempts?: number
  /** Une durée ISO 8601 (`PT4H`). */
  timeout?: string
}

export interface ProcessField {
  id: string
  label: string
  type: FieldType
  choices?: string[]
}

export interface HumanTask {
  who: ProcessPersonRef
  question: string
  kind: HumanTaskKind
  meaning?: SignatureMeaning
  checklist?: string[]
  fields?: ProcessField[]
}

/** Ce qu'attend une attente : une durée, ou ce qu'une personne fournit. */
export interface WaitFor {
  kind: "timer" | "message"
  duration?: string
  what?: string
  from?: ProcessPersonRef
}

export interface RuleRef {
  ref: string
  version?: number
}

/** Une règle en mots, et ce que du code juge : l'issue d'une étape qui précède la décision. */
export interface ProcessCondition {
  text?: string
  step?: string
  outcome?: ConditionOutcome
}

export interface ProcessFlow {
  id: string
  from: string
  to: string
  name?: string
  /** À la sortie d'une décision : le chemin de tous les autres cas. */
  otherwise?: boolean
  condition?: ProcessCondition
}

export interface ProcessStep {
  id: string
  type: ProcessStepType
  name?: string
  description?: string
  answeredBy?: ProcessPersonRef
  lock?: ProcessLock
  terminate?: boolean
  attachedTo?: string
  duration?: string
  agent?: AgentSettings
  human?: HumanTask
  wait?: WaitFor
  rules?: RuleRef[]
  documents?: string[]
  issue?: string
  steps?: ProcessStep[]
  flows?: ProcessFlow[]
}

/** Le modèle d'un processus, `taskforce-process/1` (contracts/process/README.md). */
export interface ProcessModel {
  format: string
  key: string
  name: string
  description?: string
  derivedFrom?: string
  steps?: ProcessStep[]
  flows?: ProcessFlow[]
}

export interface ProcessSummary {
  key: string
  name: string
  version: number
  digest: string
  author: string | null
  publishedAt: string
  versions: number
}

export interface ProcessOverview {
  processes: ProcessSummary[]
  /** La personne peut publier une version : le responsable du projet, un propriétaire ou un admin de l'espace. */
  canPublish: boolean
}

export interface ProcessVersion {
  key: string
  version: number
  name: string
  digest: string
  author: string | null
  publishedAt: string
  derivedFrom: string | null
  model: ProcessModel
}

export interface ProcessVersionSummary {
  version: number
  name: string
  digest: string
  author: string | null
  publishedAt: string
}

export interface ProcessDetail {
  key: string
  current: ProcessVersion
  versions: ProcessVersionSummary[]
  canPublish: boolean
}

/** Un refus du vérificateur : son code, l'étape visée, et sa phrase, à montrer telle quelle. */
export interface ProcessProblem {
  code: string
  stepId: string | null
  step: string | null
  message: string
}

export interface ProcessCheck {
  passed: boolean
  digest: string | null
  problems: ProcessProblem[]
}

/** Ce que donne un fichier BPMN 2.0 ; rien n'est publié. `notes` dit ce qui a été laissé de côté. */
export interface ProcessImport {
  passed: boolean
  digest: string | null
  model: ProcessModel | null
  problems: ProcessProblem[]
  notes: string[]
}

export interface ProcessDefault {
  key: string
  name: string
  description: string | null
  digest: string
  model: ProcessModel
}

/** Ce qu'est devenue une publication : la version écrite, ou les refus qui l'en empêchent. */
export type ProcessPublication =
  | { published: true; version: ProcessVersion }
  | { published: false; check: ProcessCheck }

/** Un fichier BPMN 2.0 à enregistrer : son nom et son contenu. */
export interface BpmnDownload {
  fileName: string
  blob: Blob
}

interface PublicationPayload {
  version: ProcessVersion | null
  refused: ProcessCheck | null
}

export async function listProcessDefaults(slug: string): Promise<ProcessDefault[]> {
  const res = await apiClient.get<{ data: ProcessDefault[] }>(PROCESS_ROUTES.DEFAULTS(slug), { silentError: true })
  return res.data.data
}

export async function listProcesses(slug: string, projectId: number): Promise<ProcessOverview> {
  const res = await apiClient.get<{ data: ProcessOverview }>(PROCESS_ROUTES.PROCESSES(slug, projectId),
    { silentError: true })
  return res.data.data
}

export async function getProcess(slug: string, projectId: number, key: string): Promise<ProcessDetail> {
  const res = await apiClient.get<{ data: ProcessDetail }>(PROCESS_ROUTES.PROCESS(slug, projectId, key),
    { silentError: true })
  return res.data.data
}

export async function getProcessVersion(slug: string, projectId: number, key: string,
  version: number): Promise<ProcessVersion> {
  const res = await apiClient.get<{ data: ProcessVersion }>(PROCESS_ROUTES.VERSION(slug, projectId, key, version),
    { silentError: true })
  return res.data.data
}

/** Le vérificateur sur un modèle, sans rien écrire. */
export async function checkProcess(slug: string, projectId: number, model: ProcessModel): Promise<ProcessCheck> {
  const res = await apiClient.post<{ data: ProcessCheck }>(PROCESS_ROUTES.CHECK(slug, projectId), { model })
  return res.data.data
}

/** Lit un fichier BPMN 2.0 dans le modèle et le vérifie ; rien n'est publié. */
export async function importProcessBpmn(slug: string, projectId: number, xml: string): Promise<ProcessImport> {
  const res = await apiClient.post<{ data: ProcessImport }>(PROCESS_ROUTES.IMPORT(slug, projectId), { xml })
  return res.data.data
}

/**
 * Publie une version. Un processus que le vérificateur refuse revient en 422 avec ses refus : c'est une réponse, pas une
 * panne.
 */
export async function publishProcess(slug: string, projectId: number,
  model: ProcessModel): Promise<ProcessPublication> {
  try {
    const res = await apiClient.post<{ data: PublicationPayload }>(PROCESS_ROUTES.PROCESSES(slug, projectId), { model })
    const version = res.data.data.version
    if (!version) throw new Error("The server published nothing.")
    return { published: true, version }
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 422) {
      const refused = (error.response.data as { data?: PublicationPayload } | undefined)?.data?.refused
      if (refused) return { published: false, check: refused }
    }
    throw error
  }
}

async function download(url: string, fallbackName: string): Promise<BpmnDownload> {
  const res = await apiClient.get<Blob>(url, { responseType: "blob", silentError: true })
  return { fileName: fileNameOf(res.headers?.["content-disposition"]) ?? fallbackName, blob: res.data }
}

/** L'export BPMN 2.0 d'une version, son extension `tf:` comprise. */
export function exportProcessBpmn(slug: string, projectId: number, key: string,
  version: number): Promise<BpmnDownload> {
  return download(PROCESS_ROUTES.VERSION_BPMN(slug, projectId, key, version), `${key}-v${version}.bpmn`)
}

export function exportDefaultBpmn(slug: string, key: string): Promise<BpmnDownload> {
  return download(PROCESS_ROUTES.DEFAULT_BPMN(slug, key), `${key}.bpmn`)
}

/** Le nom du fichier que donne l'en-tête `Content-Disposition`, ou null. */
export function fileNameOf(header: unknown): string | null {
  if (typeof header !== "string") return null
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header)
  return match ? decodeURIComponent(match[1]) : null
}
