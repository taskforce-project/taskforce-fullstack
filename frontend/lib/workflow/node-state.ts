import type { DeliveryRunApproval, ProjectRun } from "@/lib/api/delivery-service"
import type { IssueStatusCategory, IssueSummary } from "@/lib/api/issue-service"
import { awaitsJudgment, isMine } from "@/lib/window/missions"
import type { WorkflowState } from "@/lib/workflow/states"

/**
 * D'où vient l'état d'un nœud (séance n°25, spécification d'UX §4.5), pour W1 : une issue, sa dernière mission et les
 * demandes ouvertes de celle-ci, ses liens « bloquée par ». Une logique pure, testée cas par cas. Le premier état qui
 * s'applique l'emporte, dans l'ordre du tri de la spécification :
 * 1. Needs you : une demande que la personne qui regarde peut décider (`canDecide`, calculé par le serveur comme les règles
 *    le décident), ou un résultat prêt pour sa revue ;
 * 2. Failed : la dernière mission a échoué et n'a pas été relancée ; une mission refusée au départ par une règle (R38) ou
 *    arrêtée par une personne n'est pas une panne. Dans une colonne finie (terminée ou annulée), la colonne l'emporte :
 *    l'issue est Done ou Skipped, l'échec se dit en seconde ligne (« Last mission failed. ») et ne compte pas parmi les
 *    « Failed » (décision du 16/11, R161 N8) ;
 * 3. Missing n'existe qu'avec les processus (W5) : rien ne le produit ici ;
 * 4. Blocked : un lien « bloquée par » vers une issue qui n'est pas finie (une issue finie n'attend plus rien, sauf si une
 *    mission y travaille encore) ;
 * 5. Working : une mission au travail (relancée, elle reste au travail jusqu'à son résultat : jamais de faux vert) ;
 * 6. Waiting : une demande qu'une autre personne doit décider, une mission en file, un résultat qu'une autre personne revoit ;
 * 7. puis la colonne et la mission : Done et Skipped pour une issue terminée ou annulée, Stopped pour une mission qu'une
 *    personne a arrêtée, Working pour une issue en cours tenue par une personne (sa marque ne tourne pas : seul l'anneau
 *    d'une mission bouge, §1), Not started pour une issue d'une colonne de départ.
 */

/** Pourquoi un nœud est dans son état : ce que sa phrase dira. */
export type NodeReason =
  | { readonly kind: "approval"; readonly approval: DeliveryRunApproval }
  | { readonly kind: "review" }
  | { readonly kind: "blocked"; readonly blockers: readonly IssueSummary[] }
  | { readonly kind: "waitingApproval"; readonly approvals: readonly DeliveryRunApproval[] }
  | { readonly kind: "queued" }
  | { readonly kind: "mission"; readonly retried: boolean }
  /** `lastFailed` : la dernière mission a échoué, mais la colonne dit l'issue finie ; la phrase le dit à la suite. */
  | { readonly kind: "done"; readonly lastFailed?: boolean }
  | { readonly kind: "cancelled"; readonly lastFailed?: boolean }
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
  /** La catégorie de la colonne de l'issue ; null quand on ne connaît pas l'issue (la conversation, un autre projet). */
  readonly category: IssueStatusCategory | null
  /** La dernière mission de l'issue et ses demandes ouvertes ; null sans mission. */
  readonly run: ProjectRun | null
  /** Une mission d'avant a été relancée : celle-ci en est le nouvel essai. */
  readonly retried?: boolean
  /** Les issues pas finies qui bloquent celle-ci. */
  readonly blockers: readonly IssueSummary[]
  /** La personne qui regarde (son id, en chaîne ou en nombre). */
  readonly me: string | number | null | undefined
}

/** La marque d'un nœud ne tourne que pour une mission au travail : une issue tenue par une personne garde une marque fixe. */
export const markStill = (reason: NodeReason): boolean => reason.kind === "person"

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
  const active = mission !== null && (mission.status === "RUNNING" || mission.status === "QUEUED")
  const stopped = mission?.status === "FAILED" && mission.outcome === "STOPPED"

  const mine = pending.find((approval) => approval.canDecide)
  if (mine) return { state: "needsYou", reason: { kind: "approval", approval: mine } }
  if (mission && awaitsJudgment(mission) && isMine(mission, me)) return { state: "needsYou", reason: { kind: "review" } }

  const failed = mission?.status === "FAILED" && !mission.refused && !stopped && mission.outcome !== "RETRIED"
  if (failed && !isFinished(category)) {
    return { state: "failed", reason: { kind: "failed", cause: mission?.error?.trim() || null } }
  }
  const last = failed ? { lastFailed: true } : {}

  if (blockers.length > 0 && (active || !isFinished(category))) return { state: "blocked", reason: { kind: "blocked", blockers } }

  if (mission && active) {
    if (pending.length > 0) return { state: "waiting", reason: { kind: "waitingApproval", approvals: pending } }
    if (mission.status === "QUEUED") return { state: "waiting", reason: { kind: "queued" } }
    return { state: "working", reason: { kind: "mission", retried: facts.retried === true } }
  }
  if (mission && awaitsJudgment(mission)) return { state: "waiting", reason: { kind: "reviewOther" } }

  // Une issue qu'on ne connaît pas : sa mission dit seule où elle en est. Livrée, elle est faite ; son résultat écarté,
  // elle a été laissée de côté. On ne devine jamais la colonne.
  if (category === null && mission?.status === "DONE" && !awaitsJudgment(mission)) {
    return mission.outcome === "DISCARDED"
      ? { state: "skipped", reason: { kind: "cancelled" } }
      : { state: "done", reason: { kind: "done" } }
  }

  if (category === "COMPLETED") return { state: "done", reason: { kind: "done", ...last } }
  if (category === "CANCELLED") return { state: "skipped", reason: { kind: "cancelled", ...last } }
  if (stopped) return { state: "stopped", reason: { kind: "stopped" } }
  if (category === "STARTED") return { state: "working", reason: { kind: "person" } }
  return {
    state: "notStarted",
    reason: { kind: "notStarted", refusal: mission?.refused ? (mission.error?.trim() || null) : null },
  }
}
