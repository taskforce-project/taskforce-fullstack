/**
 * Banque d'évaluations de Cortex (R61, séance n°10). Un cas se tire du dossier d'une réponse : la
 * question, sa date, les notes servies et ce que les outils de lecture ont rendu, figés par le serveur. Un rejeu le
 * rejoue à blanc sur un modèle nommé, et du code le note, critère par critère.
 */
import { apiClient } from "./client"
import { BENCHMARK_CASE_TIMEOUT_MS } from "./model-benchmark-service"
import { EVAL_ROUTES } from "../config/api-routes"

/** Valeur de `EvalCriteria.tool` quand Cortex ne devait appeler aucun outil. */
export const NO_TOOL = "none"

/** Ce qu'un cas vérifie. Un champ vide n'est pas vérifié ; il faut au moins un critère. */
export interface EvalCriteria {
  /** Ce qu'il aurait fallu faire, dans les mots de la personne : une phrase ne se vérifie pas, elle reste avec le cas. */
  expected?: string
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
  /** Ce qu'il aurait fallu faire, dans les mots de la personne ; vide sinon. */
  expected?: string
  /** Le cas n'est encore qu'une phrase : aucun rejeu ne le note avant ses critères (R61). */
  waiting?: boolean
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

/** Un rejeu de la banque dans son histoire (R125) : le modèle demandé, celui qui a répondu, ses cas notés et réussis. */
export interface EvalHistoryRun {
  id: number
  /** Le modèle demandé ; `default` quand le rejeu n'en nommait pas. */
  model: string
  /** Le modèle qui a répondu, lu dans la première note ; null avant elle. */
  answeredBy: string | null
  startedAt: string
  /** null tant que tous les cas du rejeu ne sont pas notés. */
  finishedAt: string | null
  total: number
  graded: number
  passed: number
}

/**
 * D'où vient un cas. `incident` : TaskForce a corrigé la réponse (R116, l'incident de confiance d'E17) ; `answer` : une
 * réponse de Cortex dans une conversation ; `unknown` : le dossier n'est plus là, ou le cas a été écrit à la main.
 */
export interface EvalCaseOrigin {
  kind: "incident" | "answer" | "unknown"
  /** Ce que le modèle avait dit, que TaskForce a retiré. */
  said: string[]
  /** Ce que TaskForce a montré à la place. */
  shown: string | null
}

/** La note d'un cas dans un rejeu. */
export interface EvalGrade {
  runId: number
  passed: boolean
}

/** Un cas dans l'histoire de la banque : sa question, d'où il vient, et sa note à chaque rejeu depuis. */
export interface EvalHistoryCase {
  id: number
  title: string
  question: string
  /** Le jour où la question a été posée (`YYYY-MM-DD`). */
  askedOn: string
  addedAt: string
  mine: boolean
  origin: EvalCaseOrigin
  /** Dans l'ordre des rejeux. */
  grades: EvalGrade[]
  /** Ce qu'il aurait fallu faire, dans les mots de la personne ; vide sinon. */
  expected?: string
  /** Le cas attend ses critères (R137). */
  waiting?: boolean
  /** Le dossier d'un cas qui attend ses critères : leur formulaire s'en tire. */
  record?: string | null
}

export interface EvalHistory {
  /** Du plus ancien au plus récent. */
  runs: EvalHistoryRun[]
  /** Du plus récent au plus ancien. */
  cases: EvalHistoryCase[]
}

/** La banque de l'espace. Appel de fond (ouverture du panneau) : jamais de toast. */
export async function getEvalBank(slug: string): Promise<EvalBank> {
  const res = await apiClient.get<{ data: EvalBank }>(EVAL_ROUTES.BANK(slug), { silentError: true })
  return res.data.data
}

/** L'histoire de la banque, pour le volet « Progress ». Appel de fond : jamais de toast. */
export async function getEvalHistory(slug: string): Promise<EvalHistory> {
  const res = await apiClient.get<{ data: EvalHistory }>(EVAL_ROUTES.HISTORY(slug), { silentError: true })
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

/** « Bien » (R137) : ce qui a été observé devient ce qu'on attend, d'un clic. */
export async function keepGoodCase(slug: string, record: string): Promise<EvalCaseSummary> {
  const res = await apiClient.post<{ data: EvalCaseSummary }>(EVAL_ROUTES.CASE_GOOD(slug), { record })
  return res.data.data
}

/** « Pas bien » (R137) : une phrase, ce qu'il aurait fallu faire ; le cas attend ses critères. */
export async function keepBadCase(slug: string, record: string, expected: string): Promise<EvalCaseSummary> {
  const res = await apiClient.post<{ data: EvalCaseSummary }>(EVAL_ROUTES.CASE_BAD(slug), { record, expected })
  return res.data.data
}

/** Écrit les critères d'un cas qui les attend, une fois : le serveur les date maintenant. */
export async function giveEvalCriteria(
  slug: string, caseId: number, title: string, criteria: EvalCriteria,
): Promise<EvalCaseSummary> {
  const res = await apiClient.put<{ data: EvalCaseSummary }>(EVAL_ROUTES.CASE_CRITERIA(slug, caseId), { title, criteria })
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
 * Rejoue et note un cas : un appel au modèle, dans le budget d'un cas (R142). Sans toast : le store attend lui-même le frein
 * de débit de l'IA (429) et dit pourquoi un rejeu s'arrête.
 */
export async function runEvalCase(slug: string, runId: number, caseId: number): Promise<EvalResult> {
  const res = await apiClient.post<{ data: EvalResult }>(
    EVAL_ROUTES.RUN_CASE(slug, runId, caseId), {}, { timeout: BENCHMARK_CASE_TIMEOUT_MS, silentError: true },
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
