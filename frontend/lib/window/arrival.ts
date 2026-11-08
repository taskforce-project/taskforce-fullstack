import type { DeliveryRun, OpenApproval } from "@/lib/api/delivery-service"
import type { IssueHit } from "@/lib/api/issue-service"
import type { CONSTANTS_EN } from "@/lib/constants_en"
import { fillText } from "@/lib/delivery/result-card"
import type { Signal } from "@/lib/store/notification-store"
import { issueRefOfUrl, type IssueRef } from "@/lib/window/address"
import { isActiveRun, myRuns, resultsToJudge, runLabel } from "@/lib/window/missions"
import { paneOf } from "@/lib/window/pane"
import { unreadMentions } from "@/lib/window/waiting"

type ConversationTexts = (typeof CONSTANTS_EN)["conversation"]

/**
 * L'arrivée d'une nouvelle conversation (R123, séance n°18 ; R127, séance n°19) : elle n'est jamais vide, et tient en un
 * regard. D'abord ce qui attend la personne (les missions qui demandent un accord, les résultats à juger), trois lignes
 * au plus, le reste à un clic dans « Waiting for you » ; puis trois suggestions tirées de l'état réel de l'espace (ses
 * issues, ses missions, ses projets), jamais d'exemples inventés. Un clic sur une suggestion remplit le compositeur, il
 * n'envoie rien. Elle remplace le tour guidé (R124).
 */

/** Ce qui attend la personne : son objet, et l'issue qu'un clic ouvre dans le volet (null quand elle n'en a pas). */
export interface WaitingItem {
  id: string
  kind: "approval" | "result" | "mention"
  /** Ce que la ligne montre : quelques mots, l'icône dit le reste (R127). */
  label: string
  /** Ce que la ligne fait, en toutes lettres : au survol et pour les lecteurs d'écran (R129). */
  name: string
  /** Les demandes ouvertes de la mission : le nombre à droite de la ligne quand il y en a plusieurs. */
  count: number
  issue: IssueRef | null
  /** L'adresse du signal quand elle ne désigne pas une issue (un écran de l'espace) ; null sinon. */
  href: string | null
  /** Le signal qu'un clic marque lu ; null pour ce qui ne vient pas d'une notification. */
  signalId: string | null
}

/** Les lignes de l'arrivée au plus (R127) ; au-delà, « See all » ouvre le volet. */
export const ARRIVAL_ROWS = 3

/**
 * Ce qui attend vraiment la personne (R128) : une ligne par mission qui demande un accord, la plus ancienne d'abord, puis
 * les résultats qui attendent son jugement. Les demandes avant les résultats : une demande bloque un agent.
 */
export function waitingItems(
  approvals: readonly OpenApproval[],
  runs: readonly DeliveryRun[],
  me: string | number | null | undefined,
  t: ConversationTexts,
): WaitingItem[] {
  const requests: WaitingItem[] = approvals.map((row) => {
    const label = runLabel(row)
    return {
      id: `approval:${row.runId}`,
      kind: "approval",
      label,
      name: fillText(row.requests > 1 ? t.approveMany : t.approve, { title: label, count: row.requests }),
      count: row.requests,
      issue: row.projectId === null ? null : { projectId: row.projectId, issueId: row.issueId },
      href: null,
      signalId: null,
    }
  })
  const results: WaitingItem[] = resultsToJudge(runs, me).map((run) => {
    const label = runLabel(run)
    return {
      id: `run:${run.id}`,
      kind: "result",
      label,
      name: fillText(t.reviewResult, { mission: label }),
      count: 1,
      issue: run.projectId === null ? null : { projectId: run.projectId, issueId: run.issueId },
      href: null,
      signalId: null,
    }
  })
  return [...requests, ...results]
}

/** Les mentions non lues, une ligne du volet chacune (R128) ; un clic la marque lue et ouvre son issue. */
export function mentionItems(signals: readonly Signal[], t: ConversationTexts): WaitingItem[] {
  return unreadMentions(signals).map((signal) => {
    const issue = issueRefOfUrl(signal.issueUrl)
    const label = [signal.issueId, signal.title].filter(Boolean).join(" ")
    return {
      id: `signal:${signal.id}`,
      kind: "mention",
      label,
      name: fillText(t.mentioned, { title: label }),
      count: 1,
      issue,
      href: issue ? null : (signal.issueUrl || signal.operationUrl || null),
      signalId: signal.id,
    }
  })
}

/**
 * L'arrivée peut-elle mettre le curseur dans le compositeur, comme Raycast et Spotlight (E18) ? Seulement si la
 * conversation est seule à l'écran et que personne n'est ailleurs : ni dans un volet, ni dans une fenêtre de dialogue, ni
 * dans un champ ; et pas sur un écran tactile, où le clavier couvrirait l'arrivée. Lu au moment où l'arrivée s'ouvre.
 */
export function arrivalMayTakeFocus(): boolean {
  if (paneOf(globalThis.location?.pathname) !== null) return false
  if (!globalThis.matchMedia?.("(pointer: fine)").matches) return false
  const active = document.activeElement
  if (active && active !== document.body) return false
  return document.querySelector('[role="dialog"], [role="alertdialog"]') === null
}

/** Une suggestion de l'arrivée : ce que son bouton dit, et ce qu'elle écrit dans le compositeur. */
export interface ArrivalSuggestion {
  id: string
  label: string
  text: string
}

/** Un projet de l'espace, tel que la barre de gauche le connaît. */
export interface ArrivalProject {
  readonly id: number
  readonly name: string
  readonly status?: string | null
}

/** Les suggestions au plus. */
export const SUGGESTIONS = 3

const CLOSED = new Set(["COMPLETED", "CANCELLED"])

/**
 * Trois suggestions, chacune sur un objet réel de l'espace : la mission de la personne qui travaille (« Where is the
 * mission on OPS-12? »), les issues ouvertes les dernières changées (« Summarize OPS-35 »), puis ce qui a changé dans un
 * projet non archivé, celui de ces issues d'abord. Une même chose n'est suggérée qu'une fois ; rien quand l'espace n'a
 * rien.
 */
export function arrivalSuggestions(
  input: {
    issues: readonly IssueHit[]
    runs: readonly DeliveryRun[]
    me: string | number | null | undefined
    projects: readonly ArrivalProject[]
  },
  t: ConversationTexts,
): ArrivalSuggestion[] {
  const suggestions: ArrivalSuggestion[] = []
  const add = (suggestion: ArrivalSuggestion) => {
    if (suggestions.length < SUGGESTIONS && !suggestions.some((s) => s.id === suggestion.id)) suggestions.push(suggestion)
  }
  const mission = myRuns(input.runs, input.me).find((run) => isActiveRun(run.status) && run.issueKey)
  if (mission?.issueKey) {
    add({
      id: `mission:${mission.id}`,
      label: fillText(t.mission, { key: mission.issueKey }),
      text: fillText(t.missionText, { key: mission.issueKey }),
    })
  }
  const open = input.issues.filter((issue) => !CLOSED.has(issue.statusCategory ?? "") && issue.key !== mission?.issueKey)
  const active = input.projects.filter((project) => project.status !== "ARCHIVED")
  const project = active.find((p) => p.id === open[0]?.projectId) ?? active[0]
  if (open[0]) add(summarize(open[0], t))
  if (project) {
    add({ id: `changed:${project.id}`, label: fillText(t.changed, { project: project.name }), text: fillText(t.changed, { project: project.name }) })
  }
  for (const issue of open.slice(1)) add(summarize(issue, t))
  for (const other of active) {
    add({ id: `changed:${other.id}`, label: fillText(t.changed, { project: other.name }), text: fillText(t.changed, { project: other.name }) })
  }
  return suggestions
}

function summarize(issue: IssueHit, t: ConversationTexts): ArrivalSuggestion {
  return {
    id: `summarize:${issue.id}`,
    label: fillText(t.summarize, { key: issue.key }),
    text: fillText(t.summarizeText, { key: issue.key }),
  }
}
