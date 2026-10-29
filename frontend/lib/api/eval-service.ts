/**
 * Banque d'évaluations de Cortex (R61, séance n°10). Un cas se tire du dossier d'une réponse : la
 * question, sa date, les notes servies et ce que les outils de lecture ont rendu, figés par le serveur. Un rejeu le
 * rejoue à blanc sur un modèle nommé, et du code le note, critère par critère.
 */
import { apiClient, AI_TIMEOUT_MS } from "./client"
import { EVAL_ROUTES } from "../config/api-routes"

/** Valeur de `EvalCriteria.tool` quand Cortex ne devait appeler aucun outil. */
export const NO_TOOL = "none"

/** Ce qu'un cas vérifie. Un champ vide n'est pas vérifié ; il faut au moins un critère. */
export interface EvalCriteria {
  /** L'outil attendu, `NO_TOOL` pour aucun, vide pour ne pas le vérifier. */
  tool: string
  /** Pour chaque argument de l'outil attendu, les valeurs acceptées (la casse ne compte pas). */
  args: Record<string, string[]>
  /** L'effet attendu de la règle de l'espace sur l'outil attendu, vide pour ne pas le vérifier. */
  effect: "" | "allow" | "ask" | "deny"
  /** Les outils que Cortex ne doit pas appeler. */
  forbid: string[]
  /** Les mots que la réponse doit contenir, ou ne pas contenir. */
  contains: string[]
  notContains: string[]
}

export interface EvalCaseSummary {
  id: number
  title: string
  question: string
  /** L'outil attendu ; vide quand le cas ne porte pas sur un outil. */
  tool: string
  createdAt: string
  /** Quand les critères ont été figés : un rejeu ne compte que les cas figés avant son départ. */
  criteriaAt: string
  mine: boolean
}

export interface EvalRunSummary {
  id: number
  model: string
  startedAt: string
  /** null tant que tous les cas du rejeu ne sont pas notés. */
  finishedAt: string | null
  total: number
  passed: number
}

export interface EvalBank {
  enabled: boolean
  /** Propriétaire ou admin : coupe ou rouvre la banque, retire n'importe quel cas. */
  canManage: boolean
  cases: EvalCaseSummary[]
  runs: EvalRunSummary[]
}

/** Un appel de la réponse, tel que son dossier le garde ; une lecture réussie entre à la cassette du cas. */
export interface EvalDraftCall {
  tool: string
  arguments: string
  effect: string
  /** success, error, pending, approved (accordé par la personne) ou refused. */
  status: string
  read: boolean
}

/** Le brouillon d'un cas : ce que le serveur figera, et les critères qu'il propose. */
export interface EvalDraft {
  record: string
  title: string
  question: string
  askedOn: string | null
  notes: string[]
  calls: EvalDraftCall[]
  criteria: EvalCriteria
}

export interface EvalCheck {
  criterion: string
  passed: boolean
  detail: string | null
}

/** Un appel du modèle au rejeu : jamais lancé sur l'espace (une lecture sert la cassette, une écriture est proposée). */
export interface EvalReplayCall {
  tool: string
  arguments: string
  effect: string
  status: string
}

export interface EvalResult {
  caseId: number
  title: string
  passed: boolean
  checks: EvalCheck[]
  calls: EvalReplayCall[]
  answer: string | null
  model: string | null
}

export interface EvalRunDetail {
  run: EvalRunSummary
  results: EvalResult[]
}

/** La banque de l'espace. Appel de fond (ouverture du panneau) : jamais de toast. */
export async function getEvalBank(slug: string): Promise<EvalBank> {
  const res = await apiClient.get<{ data: EvalBank }>(EVAL_ROUTES.BANK(slug), { silentError: true })
  return res.data.data
}

/** Le brouillon d'un cas tiré du dossier d'une réponse de la personne. */
export async function draftEvalCase(slug: string, record: string): Promise<EvalDraft> {
  const res = await apiClient.post<{ data: EvalDraft }>(EVAL_ROUTES.CASE_DRAFT(slug), { record })
  return res.data.data
}

/** Ajoute le cas : le serveur refait le contenu figé depuis le dossier et date les critères. */
export async function createEvalCase(
  slug: string, record: string, title: string, criteria: EvalCriteria,
): Promise<EvalCaseSummary> {
  const res = await apiClient.post<{ data: EvalCaseSummary }>(EVAL_ROUTES.CASES(slug), { record, title, criteria })
  return res.data.data
}

export async function archiveEvalCase(slug: string, caseId: number): Promise<void> {
  await apiClient.delete(EVAL_ROUTES.CASE(slug, caseId))
}

/** Ouvre un rejeu ; un nom vide rejoue sur le modèle par défaut de l'instance. */
export async function startEvalRun(slug: string, model: string): Promise<EvalRunSummary> {
  const res = await apiClient.post<{ data: EvalRunSummary }>(EVAL_ROUTES.RUNS(slug), { model })
  return res.data.data
}

/**
 * Rejoue et note un cas : un appel au modèle, d'où le délai de l'IA. Sans toast : le store attend lui-même le frein de
 * débit de l'IA (429) et dit pourquoi un rejeu s'arrête.
 */
export async function runEvalCase(slug: string, runId: number, caseId: number): Promise<EvalResult> {
  const res = await apiClient.post<{ data: EvalResult }>(
    EVAL_ROUTES.RUN_CASE(slug, runId, caseId), {}, { timeout: AI_TIMEOUT_MS, silentError: true },
  )
  return res.data.data
}

export async function getEvalRun(slug: string, runId: number): Promise<EvalRunDetail> {
  const res = await apiClient.get<{ data: EvalRunDetail }>(EVAL_ROUTES.RUN(slug, runId))
  return res.data.data
}

/** Coupe ou rouvre la banque (propriétaire ou admin) ; rend l'état retenu. */
export async function setEvalBankEnabled(slug: string, enabled: boolean): Promise<boolean> {
  const res = await apiClient.put<{ data: boolean }>(EVAL_ROUTES.SETTINGS(slug), { enabled })
  return res.data.data
}
