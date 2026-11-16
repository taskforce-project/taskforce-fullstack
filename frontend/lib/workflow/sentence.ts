import { format } from "date-fns"

import type { DeliveryRunApproval } from "@/lib/api/delivery-service"
import type { UserSummary } from "@/lib/api/issue-service"
import type { CONSTANTS_EN } from "@/lib/constants_en"
import { requestWant } from "@/lib/delivery/mission-sequence"
import { fillText } from "@/lib/delivery/result-card"
import { allOf, type RulesTexts } from "@/lib/rules/rule-words"
import { isMine } from "@/lib/window/missions"
import { parseServerDate } from "@/lib/utils/server-date"
import type { WorkflowNode } from "@/lib/workflow/model"
import { pendingOf } from "@/lib/workflow/node-state"

/**
 * Ce qu'un nœud dit en mots (séance n°25, §4.1 et §11.4) : la phrase de ce qui se passe ou attend, qui en répond, qui doit
 * agir, ce que la gouvernance en dit, et le seul bouton qu'il porte quand il attend la personne qui regarde. Aucun mot
 * interne : ni identifiant de mission ou d'accord, ni nom d'outil, ni empreinte.
 */

export type WorkflowTexts = (typeof CONSTANTS_EN)["workflow"]
type SequenceTexts = (typeof CONSTANTS_EN)["missionSequence"]

export interface SentenceTexts {
  readonly workflow: WorkflowTexts
  readonly sequence: SequenceTexts
  /** Les mots des règles : les rôles qu'une règle nomme pour accorder (« an admin »). */
  readonly rules: RulesTexts
}

/** Ce que la phrase lit autour du nœud : la personne qui regarde, et l'heure. */
export interface SentenceContext {
  readonly me: string | number | null | undefined
  readonly now: Date
}

const pad = (n: number) => String(n).padStart(2, "0")
const dayKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

/** Un jour, en mots : « today », « tomorrow », « yesterday », sinon « on 19 Dec » (l'année quand ce n'est pas celle-ci). */
export function dayWords(key: string, now: Date): string {
  const day = key.slice(0, 10)
  const today = dayKey(now)
  const shift = (days: number) => dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + days))
  if (day === today) return "today"
  if (day === shift(1)) return "tomorrow"
  if (day === shift(-1)) return "yesterday"
  const [year, month, date] = day.split("-").map(Number)
  const value = new Date(year, (month ?? 1) - 1, date ?? 1)
  return `on ${format(value, year === now.getFullYear() ? "d MMM" : "d MMM yyyy")}`
}

/** Un moment du serveur, en mots : « today at 14:05 », sinon le jour (`dayWords`). */
export function momentWords(at: string, now: Date): string {
  const date = parseServerDate(at)
  if (Number.isNaN(date.getTime())) return ""
  return dayKey(date) === dayKey(now) ? `today at ${format(date, "HH:mm")}` : dayWords(dayKey(date), now)
}

/** Le prénom d'une personne : le premier mot de son nom, sinon ce qui précède l'arobase de son adresse. */
export function firstName(person: Pick<UserSummary, "displayName" | "email"> | null | undefined): string | null {
  if (!person) return null
  const name = person.displayName?.trim()
  if (name) return name.split(/\s+/)[0]
  return person.email ? person.email.split("@")[0] : null
}

/**
 * Qui une demande attend, en mots : les personnes et les rôles que la règle nomme (« Alex Chen, and an admin »), chaque
 * liste une fois, sinon la personne qui a délégué.
 */
function waitedFor(approvals: readonly DeliveryRunApproval[], delegator: string | null | undefined, t: SentenceTexts): string {
  const sets = approvals.flatMap((approval) => approval.waitingFor ?? [])
  if (sets.length > 0) return allOf([...new Map(sets.map((set) => [set.join("|"), set] as const)).values()], t.rules)
  return delegator?.trim() || t.workflow.now.theDelegator
}

/** Ce que la phrase lit d'un nœud : sa raison, sa mission, sa date, et de son issue ce qu'elle en dit. */
export type SentenceNode = Pick<WorkflowNode, "reason" | "run" | "overdue"> & {
  readonly issue: Pick<WorkflowNode["issue"], "assignee" | "completedAt" | "dueDate">
}

/**
 * La phrase de ce qui se passe ou attend (§11.4) ; null quand l'état n'a rien de plus à dire que son mot. Une seule règle :
 * elle finit par un point, même quand elle reprend une raison du serveur ou l'étape en cours d'une mission (R161, L5).
 */
export function nodeSentence(node: SentenceNode, t: SentenceTexts, context: SentenceContext): string | null {
  const words = nodeWords(node, t, context)?.trim()
  if (!words) return null
  return /[.!?…]$/.test(words) ? words : `${words}.`
}

function nodeWords(node: SentenceNode, t: SentenceTexts, context: SentenceContext): string | null {
  const w = t.workflow
  const run = node.run?.run ?? null
  const { reason } = node
  switch (reason.kind) {
    case "approval": {
      const what = run ? requestWant(reason.approval, run, t.sequence) : reason.approval.summary
      return fillText(w.now.approval, { what })
    }
    case "review":
      return w.now.review
    case "reviewOther":
      return fillText(w.now.reviewBy, { who: run?.startedByName?.trim() || w.now.theDelegator })
    case "waitingApproval":
      return fillText(w.now.waitingFor, { who: waitedFor(reason.approvals, run?.startedByName, t) })
    case "queued":
      // Le runner de la personne qui a délégué prend la mission : « your runner » pour elle, son nom pour les autres.
      return run && !isMine(run, context.me) && run.startedByName?.trim()
        ? fillText(w.now.waitingFor, { who: run.startedByName.trim() })
        : w.now.queued
    case "blocked": {
      const [first] = reason.blockers
      if (reason.blockers.length === 1 && first) return fillText(w.now.blockedBy, { key: first.identifier, title: first.title })
      return fillText(w.now.blockedByMany, { count: reason.blockers.length })
    }
    case "failed": {
      if (!reason.cause) return w.now.failedNoCause
      const cause = reason.cause.replace(/[.!?]+$/, "")
      // L'étape où la mission s'est arrêtée, que le serveur calcule avec les règles de la vue du travail.
      const step = node.run ? t.sequence.steps[node.run.step.key] : null
      return step ? fillText(w.now.failed, { step, cause }) : fillText(w.now.failedMission, { cause })
    }
    case "mission": {
      if (reason.retried && run?.createdAt) return fillText(w.now.retried, { time: momentWords(run.createdAt, context.now) })
      // Ce que l'agent fait en ce moment, en mots : « Doing the work », « Checking the work ».
      return node.run ? t.sequence.status.working[node.run.step.key] : null
    }
    case "person": {
      const who = firstName(node.issue.assignee)
      return who ? fillText(w.now.inProgress, { who }) : w.now.inProgressNobody
    }
    case "stopped":
      return run && isMine(run, context.me) ? w.now.stoppedByYou : fillText(w.now.stoppedBy, { who: run?.startedByName?.trim() || w.now.theDelegator })
    case "done": {
      const done = node.issue.completedAt ? fillText(w.now.done, { time: momentWords(node.issue.completedAt, context.now) }) : null
      // La colonne l'emporte ; l'échec de la dernière mission se dit à la suite (R161, N8).
      return reason.lastFailed ? [done, w.now.lastFailed].filter(Boolean).join(" ") : done
    }
    case "cancelled":
      return reason.lastFailed ? w.now.lastFailed : null
    case "notStarted":
      if (reason.refusal) return fillText(w.now.notStarted, { reason: reason.refusal })
      if (node.issue.dueDate) {
        return fillText(node.overdue ? w.now.overdue : w.now.due, { time: dayWords(node.issue.dueDate, context.now) })
      }
      return null
  }
}

/** Le seul bouton d'un nœud (§4.1), quand il attend la personne qui regarde ; null sinon. */
export type NodeAction = "decide" | "review" | "seeWhy"

export function nodeAction(node: Pick<WorkflowNode, "reason" | "run">, me: string | number | null | undefined): NodeAction | null {
  if (node.reason.kind === "approval") return "decide"
  if (node.reason.kind === "review") return "review"
  if (node.reason.kind === "failed" && node.run && isMine(node.run.run, me)) return "seeWhy"
  return null
}

/** Qui doit agir, en un mot, pour la carte d'une ligne de Summary (§4.2). */
export function whoActs(node: WorkflowNode, me: string | number | null | undefined, t: WorkflowTexts,
  assigneeOf: (issueId: number) => UserSummary | null): string {
  const run = node.run?.run ?? null
  switch (node.reason.kind) {
    case "approval":
    case "review":
      return t.who.you
    case "failed":
      return run && isMine(run, me) ? t.who.you : (run?.startedByName?.split(/\s+/)[0] ?? firstName(node.issue.assignee) ?? t.who.nobody)
    case "blocked": {
      const first = node.reason.blockers[0]
      return (first && firstName(assigneeOf(first.id))) ?? first?.identifier ?? t.who.nobody
    }
    default:
      return firstName(node.issue.assignee) ?? t.who.nobody
  }
}

/** Ce que la gouvernance dit d'un nœud, au pied de sa carte (§4.1) : ses règles, ses signatures, ses documents. */
export interface Governance {
  /** Le nombre de règles qui demandent, et leurs raisons (la phrase au survol). */
  readonly rules: number
  readonly ruleReasons: readonly string[]
  /** Les signatures d'une demande qui en demande plusieurs. */
  readonly signed: { readonly signed: number; readonly needed: number } | null
  readonly documents: number
}

export function governanceOf(node: WorkflowNode): Governance {
  const pending = pendingOf(node.run)
  const rules = new Map<string, string>()
  for (const approval of pending) {
    if (approval.rule) rules.set(approval.rule, approval.reason?.trim() || approval.rule)
  }
  const multi = pending.find((approval) => (approval.signatures ?? 1) > 1)
  return {
    rules: rules.size,
    ruleReasons: [...rules.values()],
    signed: multi ? { signed: multi.signedBy?.length ?? 0, needed: multi.signatures ?? 2 } : null,
    documents: node.documents,
  }
}

/** Les mots d'un compte : « 1 rule », « 3 rules ». */
export const countWords = (count: number, one: string, many: string): string =>
  count === 1 ? one : fillText(many, { count })
