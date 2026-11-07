import type { AnalysisJob, JobStatus } from "@/lib/api/analysis-service"
import type { DeliveryRun, DeliveryRunStatus } from "@/lib/api/delivery-service"
import type { Change } from "@/lib/window/changes"
import { parseServerDate } from "@/lib/utils/server-date"

/**
 * Le travail des agents, tel que la fenêtre le montre (R57, R121, R122) : en un point, l'un des quatre états, et
 * seulement le travail de la personne. Aucune mesure d'agent, aucun classement : chaque ligne mène à son objet.
 */
export type WorkState = "working" | "waiting" | "failed" | "done"

/** Un échec reste en vue un jour dans la barre de gauche ; ensuite, l'historique de « Missions » le garde. */
const FAILED_FOR_MS = 24 * 60 * 60 * 1000

export const isActiveJob = (status: JobStatus): boolean =>
  status === "QUEUED" || status === "RUNNING" || status === "WAITING_FOR_INPUT"

export const isActiveRun = (status: DeliveryRunStatus): boolean => status === "QUEUED" || status === "RUNNING"

/** La personne a délégué cette mission. `me` vient de /users/me, en chaîne ou en nombre : on compare en chaînes. */
export function isMine(run: DeliveryRun, me: string | number | null | undefined): boolean {
  return run.startedById !== null && me !== null && me !== undefined && String(run.startedById) === String(me)
}

/** Une mission finie dont le résultat attend le jugement de la personne (R78) : ni appliqué, ni écarté, ni refait. */
export function awaitsJudgment(run: DeliveryRun): boolean {
  return run.status === "DONE" && !run.outcome && !run.refused
}

/** Une mission refusée au départ par une règle n'est pas une panne (R38) : elle est finie, sans rien faire. */
export function runState(run: DeliveryRun): WorkState {
  if (isActiveRun(run.status)) return "working"
  if (run.status === "FAILED") return run.refused ? "done" : "failed"
  return awaitsJudgment(run) ? "waiting" : "done"
}

export function jobState(job: AnalysisJob): WorkState {
  if (job.status === "WAITING_FOR_INPUT") return "waiting"
  if (isActiveJob(job.status)) return "working"
  return job.status === "FAILED" ? "failed" : "done"
}

/** Les missions de la personne, la dernière de chaque issue : une issue refaite ne garde que sa mission en cours. */
export function myRuns(runs: readonly DeliveryRun[], me: string | number | null | undefined): DeliveryRun[] {
  const seen = new Set<number>()
  return runs.filter((run) => {
    if (!isMine(run, me) || seen.has(run.issueId)) return false
    seen.add(run.issueId)
    return true
  })
}

/** Les résultats qui attendent le jugement de la personne, les plus récents d'abord (l'ordre de l'API). */
export function resultsToJudge(runs: readonly DeliveryRun[], me: string | number | null | undefined): DeliveryRun[] {
  return myRuns(runs, me).filter(awaitsJudgment)
}

/**
 * Les missions encore en vie, sous leur projet dans la barre de gauche : au travail, ou dont le résultat attend la
 * personne ; un échec, le jour où il arrive.
 */
export function liveRuns(runs: readonly DeliveryRun[], me: string | number | null | undefined, now: number): DeliveryRun[] {
  return myRuns(runs, me).filter((run) => {
    const state = runState(run)
    if (state === "working" || state === "waiting") return true
    const when = run.updatedAt ?? run.createdAt
    return state === "failed" && when !== null && now - parseServerDate(when).getTime() < FAILED_FOR_MS
  })
}

/** Le temps écoulé depuis le départ, en minutes arrondies au-dessous : « 0 », puis « 1 », « 2 »… null sans départ. */
export function elapsedMinutes(since: string | null | undefined, now: number): number | null {
  if (!since) return null
  return Math.max(0, Math.floor((now - parseServerDate(since).getTime()) / 60_000))
}

/** Ce qu'une mission montre : la clé et le titre de son issue, ou à défaut son numéro. */
export function runLabel(run: Pick<DeliveryRun, "issueKey" | "issueTitle" | "issueId">): string {
  return [run.issueKey, run.issueTitle].filter(Boolean).join(" ") || `#${run.issueId}`
}

/**
 * La mission que la conversation a lancée et qui tourne encore, la plus récente : la ligne du haut ouvre sa vue du travail
 * (« Le dessin », séance n°18). Celles de la personne seulement (R57) ; null quand aucune ne tourne.
 */
export function conversationMission(
  changes: readonly Change[],
  runs: readonly DeliveryRun[],
  me: string | number | null | undefined,
): DeliveryRun | null {
  for (const change of changes) {
    const target = change.kind === "delegated" ? change.call.target : null
    if (!target) continue
    const run = runs.find((r) => (target.runId ? r.id === target.runId : r.issueId === target.issueId)
      && isActiveRun(r.status) && isMine(r, me))
    if (run) return run
  }
  return null
}
