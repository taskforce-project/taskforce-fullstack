/**
 * Le banc des modèles (R131, séance n°19 ; R142, séance n°20) : `/api/workspaces/{slug}/ai/benchmark`. Une matrice par tâche
 * du vrai travail, un passage modèle après modèle (un premier appel charge le modèle, puis cas par cas), le détail d'un modèle
 * où la personne peut retourner une note, et l'essai sur une de ses issues. Aucune adresse ni clé n'est exposée, seulement les
 * noms de modèles, leurs réponses et leurs notes.
 */
import { apiClient } from "./client"
import { AI_BENCHMARK_ROUTES } from "../config/api-routes"

/**
 * Le temps qu'on attend la réponse à un cas : les cinq minutes de son budget côté serveur (R142, `BenchmarkSuite.CASE_BUDGET`),
 * plus de quoi recevoir le verdict. Le serveur répond toujours avant, même « trop lent ».
 */
export const BENCHMARK_CASE_TIMEOUT_MS = 330_000

/** Le verdict d'une tâche (R131, R142) ; null quand elle n'a pas été passée. */
export type BenchmarkVerdict = "give_it" | "with_review" | "not_yet" | "too_slow"

/** Qui a retourné une note : la personne qui lit, un autre membre, ou personne. */
export type BenchmarkJudge = "you" | "member"

/** La clé de la colonne « Your tests » : la banque de tests de l'espace, à côté des tâches. */
export const BANK_TASK = "bank"

/** Une colonne : une tâche du vrai travail. `trial` : elle s'essaie à l'aveugle sur une issue. */
export interface BenchmarkTaskInfo {
  key: string
  label: string
  description: string
  cases: number
  trial: boolean
}

/** Une cellule : le verdict d'un modèle sur une tâche, ce sur quoi il repose, et si une personne l'a retourné. */
export interface BenchmarkCell {
  task: string
  verdict: BenchmarkVerdict | null
  passed: number
  measured: number
  total: number
  judge: BenchmarkJudge | null
  /** Ses cas qui n'ont pas répondu dans leur budget : « Too slow here ». */
  tooSlow: number
}

/**
 * Ce qu'on sait d'un modèle, sans le noter (R142) : ce que dit sa fiche chez son fournisseur, ce qu'on a vu quand il s'est
 * chargé. Chaque valeur est null quand personne ne la dit ; rien n'est deviné.
 */
export interface BenchmarkModelFacts {
  /** Telle qu'Ollama la nomme : « qwen3 ». */
  family: string | null
  /** « 14.8B ». */
  parameters: string | null
  diskBytes: number | null
  /** En jetons. */
  contextWindow: number | null
  tools: boolean | null
  /** false : un modèle de base, qui complète du texte, ne se passe pas. */
  chat: boolean | null
  /** La mémoire qu'il occupait à son dernier chargement ici. */
  memoryBytes: number | null
  /** Ce qui en tenait sur la carte graphique ; le reste tournait sur le processeur. */
  gpuBytes: number | null
  loadProblem: "too_slow" | "failed" | null
}

export interface BenchmarkModelRow {
  model: string
  /** Cortex répond avec ce modèle à la personne : il vient en premier, jamais un classement (R57). */
  current: boolean
  lastRunAt: string | null
  /** Environ, en secondes : d'après ses derniers temps, sinon d'après ce que les autres ont pris. */
  estimateSeconds: number
  cells: BenchmarkCell[]
  facts: BenchmarkModelFacts
}

export interface BenchmarkMatrix {
  /** OLLAMA, OPENAI (toute API compatible) ou ANTHROPIC ; null quand l'IA est coupée. */
  provider: string | null
  current: string | null
  suiteVersion: number
  cases: number
  tasks: BenchmarkTaskInfo[]
  models: BenchmarkModelRow[]
}

export interface BenchmarkRunStarted {
  runId: number
  model: string
  startedAt: string
  cases: string[]
}

/**
 * Le premier appel d'un passage, qui charge le modèle avant que rien ne soit chronométré. `too_slow` et `failed` : le modèle
 * se passe pour cette fois, sa ligne le dit. `unreachable` : l'IA ne répond plus, `message` dit quoi faire.
 */
export interface BenchmarkLoadResult {
  status: "loaded" | "too_slow" | "failed" | "unreachable"
  loadMs: number | null
  memoryBytes: number | null
  gpuBytes: number | null
  message: string | null
}

/** Un passage dans l'histoire de l'espace. */
export interface BenchmarkRunLine {
  runId: number
  model: string
  startedAt: string
  total: number
  measured: number
  passed: number
  tooSlow: number
}

export interface BenchmarkCheck {
  criterion: string
  passed: boolean
  detail: string
}

export interface BenchmarkCall {
  tool: string
  arguments: string
  effect: string
  status: string
}

/** Un cas du détail, passé ou non : sa note de code, celle de la personne, ce que le modèle a répondu, son temps. */
export interface BenchmarkCaseDetail {
  /** null tant que ce cas n'a pas été passé. */
  resultId: number | null
  caseKey: string
  title: string
  /** La note qui compte : celle de la personne quand elle l'a retournée, sinon celle du code. */
  passed: boolean
  /** La note du code seule. */
  gradedPassed: boolean
  personPassed: boolean | null
  judge: BenchmarkJudge | null
  checks: BenchmarkCheck[]
  calls: BenchmarkCall[]
  answer: string
  durationMs: number | null
  at: string | null
  /** Le modèle n'a pas répondu dans le budget du cas : il n'y a rien à juger. */
  tooSlow: boolean
}

export interface BenchmarkTaskDetail extends BenchmarkCell {
  cases: BenchmarkCaseDetail[]
}

export interface BlindTrialAnswer {
  letter: string
  model: string
  answer: string
  durationMs: number | null
  tooSlow: boolean
}

/** Un essai à l'aveugle tranché : visible de la seule personne qui l'a lancé. */
export interface BlindTrialResult {
  trialId: number
  task: string
  issueKey: string
  /** La lettre choisie ; null quand aucune réponse n'a été retenue. */
  chosenLetter: string | null
  chosenModel: string | null
  decidedAt: string | null
  answers: BlindTrialAnswer[]
}

export interface BenchmarkModelDetail {
  model: string
  current: boolean
  lastRunAt: string | null
  cases: number
  tasks: BenchmarkTaskDetail[]
  trials: BlindTrialResult[]
}

export interface BlindTrialStarted {
  trialId: number
  task: string
  issueKey: string
  letters: string[]
}

/** Une réponse de l'essai, avant le choix : sous sa lettre seulement. */
export interface BlindTrialLetterAnswer {
  letter: string
  answer: string
  durationMs: number | null
  tooSlow: boolean
}

export interface BlindTrialRequest {
  projectId: number
  issueId: number
  task: string
  models: string[]
}

/** La matrice, lue en arrière-plan : sans message d'erreur, l'écran dit lui-même ce qui manque. */
export async function getBenchmarkMatrix(slug: string): Promise<BenchmarkMatrix> {
  const res = await apiClient.get<{ data: BenchmarkMatrix }>(AI_BENCHMARK_ROUTES.MATRIX(slug), { silentError: true })
  return res.data.data
}

export async function getBenchmarkDetail(slug: string, model: string): Promise<BenchmarkModelDetail> {
  const res = await apiClient.get<{ data: BenchmarkModelDetail }>(AI_BENCHMARK_ROUTES.DETAIL(slug), {
    params: { model }, silentError: true,
  })
  return res.data.data
}

export async function startBenchmarkRun(slug: string, model: string): Promise<BenchmarkRunStarted> {
  const res = await apiClient.post<{ data: BenchmarkRunStarted }>(AI_BENCHMARK_ROUTES.RUNS(slug), { model })
  return res.data.data
}

/** Le premier appel d'un passage : charge le modèle avant que rien ne soit chronométré. Jamais une erreur pour un modèle qui ne se charge pas. */
export async function loadBenchmarkModel(slug: string, runId: number): Promise<BenchmarkLoadResult> {
  const res = await apiClient.post<{ data: BenchmarkLoadResult }>(
    AI_BENCHMARK_ROUTES.RUN_LOAD(slug, runId), undefined, { timeout: BENCHMARK_CASE_TIMEOUT_MS, silentError: true },
  )
  return res.data.data
}

/** Passe un cas sur le modèle du passage : une réponse du modèle, dans le budget du cas. Sans toast : le store dit pourquoi un passage s'arrête. */
export async function playBenchmarkCase(slug: string, runId: number, caseKey: string): Promise<BenchmarkCaseDetail> {
  const res = await apiClient.post<{ data: BenchmarkCaseDetail }>(
    AI_BENCHMARK_ROUTES.RUN_CASE(slug, runId, caseKey), undefined, { timeout: BENCHMARK_CASE_TIMEOUT_MS, silentError: true },
  )
  return res.data.data
}

/** « Stop » : coupe l'appel au modèle en cours de la personne, pour qu'elle n'attende pas la fin d'un cas. */
export async function stopBenchmark(slug: string): Promise<void> {
  await apiClient.post(AI_BENCHMARK_ROUTES.STOP(slug), undefined, { silentError: true })
}

/** Les passages de l'espace, le plus récent d'abord. Appel de fond : jamais de toast. */
export async function getBenchmarkHistory(slug: string): Promise<BenchmarkRunLine[]> {
  const res = await apiClient.get<{ data: BenchmarkRunLine[] }>(AI_BENCHMARK_ROUTES.HISTORY(slug), { silentError: true })
  return res.data.data
}

/** Retourne une note (réussi, raté) ; null rend la note au code. Rend le détail du modèle, à jour. */
export async function setBenchmarkVerdict(
  slug: string, resultId: number, passed: boolean | null,
): Promise<BenchmarkModelDetail> {
  const res = await apiClient.put<{ data: BenchmarkModelDetail }>(AI_BENCHMARK_ROUTES.VERDICT(slug, resultId), { passed })
  return res.data.data
}

export async function startBlindTrial(slug: string, request: BlindTrialRequest): Promise<BlindTrialStarted> {
  const res = await apiClient.post<{ data: BlindTrialStarted }>(AI_BENCHMARK_ROUTES.TRIALS(slug), request)
  return res.data.data
}

/** Fait répondre le modèle d'une lettre : une réponse du modèle, dans le budget d'un cas. */
export async function playBlindTrialLetter(slug: string, trialId: number, letter: string): Promise<BlindTrialLetterAnswer> {
  const res = await apiClient.post<{ data: BlindTrialLetterAnswer }>(
    AI_BENCHMARK_ROUTES.TRIAL_LETTER(slug, trialId, letter), undefined, { timeout: BENCHMARK_CASE_TIMEOUT_MS },
  )
  return res.data.data
}

/** Choisit une lettre, ou aucune (null) ; rend les noms. */
export async function chooseBlindTrial(slug: string, trialId: number, letter: string | null): Promise<BlindTrialResult> {
  const res = await apiClient.post<{ data: BlindTrialResult }>(AI_BENCHMARK_ROUTES.TRIAL_CHOICE(slug, trialId), { letter })
  return res.data.data
}
