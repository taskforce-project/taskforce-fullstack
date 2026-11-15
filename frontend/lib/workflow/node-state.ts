import type { DeliveryRunApproval, ProjectRun } from "@/lib/api/delivery-service"
import type { IssueStatusCategory, IssueSummary } from "@/lib/api/issue-service"
import { awaitsJudgment, isMine } from "@/lib/window/missions"
import type { WorkflowState } from "@/lib/workflow/states"

/**
 * D'où vient l'état d'un nœud (séance n°25, spécification d'UX §4.5), pour W1 : une issue, sa dernière mission et les
 * demandes ouvertes de celle-ci, ses liens « bloquée par ». Une logique pure, testée cas par cas. Le premier état qui
 * s'applique l'emporte :
 * 1. Needs you : une demande que la personne qui regarde peut décider (`canDecide`, calculé par le serveur comme les règles
 *    le décident), ou un résultat prêt pour sa revue ;
 * 2. une mission en cours ou en file n'est jamais finie : bloquée, en attente d'une autre personne ou du runner, ou au
 *    travail (une mission relancée reste au travail jusqu'à son résultat : jamais de faux vert) ;
 * 3. Done et Skipped viennent de la colonne : une issue terminée, une issue annulée ;
 * 4. Failed : la dernière mission a échoué, ni refusée au départ, ni arrêtée par une personne, ni relancée ;
 * 5. Blocked : un lien « bloquée par » vers une issue qui n'est pas finie ;
 * 6. Waiting : un résultat qu'une autre personne doit revoir ;
 * 7. Stopped : une personne a arrêté la mission ;
 * 8. Working : une issue en cours, tenue par une personne ;
 * 9. Not started : une issue d'une colonne de départ (une mission refusée au départ par une règle en est une, R38).
 * Missing n'existe qu'avec les processus (W5) : rien ne le produit ici.
 */

/** Pourquoi un nœud est dans son état : ce que sa phrase dira. */
export type NodeReason =
  | { readonly kind: "approval"; readonly approval: DeliveryRunApproval }
  | { readonly kind: "review" }
  | { readonly kind: "blocked"; readonly blockers: readonly IssueSummary[] }
  | { readonly kind: "waitingApproval"; readonly approvals: readonly DeliveryRunApproval[] }
  | { readonly kind: "queued" }
  | { readonly kind: "mission"; readonly retried: boolean }
  | { readonly kind: "done" }
  | { readonly kind: "cancelled" }
  | { readonly kind: "failed"; readonly cause: string | null }
  | { readonly kind: "reviewOther" }
  | { readonly kind: "stopped" }
  | { readonly kind: "person" }
  | { readonly kind: "notStarted"; readonly refusal: string | null }

export interface NodeState {
  readonly state: WorkflowState
  readonly reason: NodeReason
}

/** Ce qu'un nœud lit de son issue et de sa mission. */
export interface NodeFacts {
  readonly category: IssueStatusCategory
  /** La dernière mission de l'issue et ses demandes ouvertes ; null sans mission. */
  readonly run: ProjectRun | null
  /** Une mission d'avant a été relancée : celle-ci en est le nouvel essai. */
  readonly retried?: boolean
  /** Les issues pas finies qui bloquent celle-ci. */
  readonly blockers: readonly IssueSummary[]
  /** La personne qui regarde (son id, en chaîne ou en nombre). */
  readonly me: string | number | null | undefined
}

/** Une issue finie, au sens des liens : terminée ou annulée. */
export const isFinished = (category: IssueStatusCategory | null | undefined): boolean =>
  category === "COMPLETED" || category === "CANCELLED"

/** Les demandes encore ouvertes d'une mission en cours ; aucune pour une mission qui ne tourne pas. */
export function pendingOf(run: ProjectRun | null): DeliveryRunApproval[] {
  if (!run || run.run.status !== "RUNNING") return []
  return run.approvals.filter((approval) => approval.status === "PENDING")
}

export function nodeStateOf(facts: NodeFacts): NodeState {
  const { category, run, blockers, me } = facts
  const mission = run?.run ?? null
  const pending = pendingOf(run)

  const mine = pending.find((approval) => approval.canDecide)
  if (mine) return { state: "needsYou", reason: { kind: "approval", approval: mine } }
  if (mission && awaitsJudgment(mission) && isMine(mission, me)) return { state: "needsYou", reason: { kind: "review" } }

  if (mission && (mission.status === "RUNNING" || mission.status === "QUEUED")) {
    if (blockers.length > 0) return { state: "blocked", reason: { kind: "blocked", blockers } }
    if (pending.length > 0) return { state: "waiting", reason: { kind: "waitingApproval", approvals: pending } }
    if (mission.status === "QUEUED") return { state: "waiting", reason: { kind: "queued" } }
    return { state: "working", reason: { kind: "mission", retried: facts.retried === true } }
  }

  if (category === "COMPLETED") return { state: "done", reason: { kind: "done" } }
  if (category === "CANCELLED") return { state: "skipped", reason: { kind: "cancelled" } }

  const stopped = mission?.status === "FAILED" && mission.outcome === "STOPPED"
  if (mission?.status === "FAILED" && !mission.refused && !stopped && mission.outcome !== "RETRIED") {
    return { state: "failed", reason: { kind: "failed", cause: mission.error?.trim() || null } }
  }
  if (blockers.length > 0) return { state: "blocked", reason: { kind: "blocked", blockers } }
  if (mission && awaitsJudgment(mission)) return { state: "waiting", reason: { kind: "reviewOther" } }
  if (stopped) return { state: "stopped", reason: { kind: "stopped" } }
  if (category === "STARTED") return { state: "working", reason: { kind: "person" } }
  return {
    state: "notStarted",
    reason: { kind: "notStarted", refusal: mission?.refused ? (mission.error?.trim() || null) : null },
  }
}
