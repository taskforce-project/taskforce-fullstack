import type { DeliveryRun } from "@/lib/api/delivery-service"
import type { IssueHit } from "@/lib/api/issue-service"
import type { CONSTANTS_EN } from "@/lib/constants_en"
import { fillText } from "@/lib/delivery/result-card"
import type { Signal } from "@/lib/store/notification-store"
import { issueRefOfUrl, type IssueRef } from "@/lib/window/address"
import { isActiveRun, myRuns, resultsToJudge, runLabel } from "@/lib/window/missions"

type ConversationTexts = (typeof CONSTANTS_EN)["conversation"]

/**
 * L'arrivée d'une nouvelle conversation (R123, séance n°18) : elle n'est jamais vide. D'abord ce qui attend la personne,
 * ce que « Waiting for you » liste déjà (les demandes d'accord d'un agent, les résultats à juger) ; puis trois
 * suggestions tirées de l'état réel de l'espace (ses issues, ses missions, ses projets), jamais d'exemples inventés. Un
 * clic sur une suggestion remplit le compositeur, il n'envoie rien. Elle remplace le tour guidé (R124).
 */

/** Ce qui attend la personne : son objet, et l'issue qu'un clic ouvre dans le volet (null quand le signal n'en a pas). */
export interface WaitingItem {
  id: string
  kind: "approval" | "result"
  /** Ce que la ligne dit, dans les mots de l'interface. */
  label: string
  issue: IssueRef | null
  /** L'adresse du signal quand elle ne désigne pas une issue (un écran de l'espace) ; null sinon. */
  href: string | null
  /** Le signal qu'un clic marque lu ; null pour un résultat. */
  signalId: string | null
}

/** Les demandes d'accord encore non lues, puis les résultats qui attendent le jugement de la personne. */
export function waitingItems(
  signals: readonly Signal[],
  runs: readonly DeliveryRun[],
  me: string | number | null | undefined,
  t: ConversationTexts,
): WaitingItem[] {
  const approvals: WaitingItem[] = signals
    .filter((signal) => !signal.read && signal.type === "agentApproval")
    .map((signal) => {
      const issue = issueRefOfUrl(signal.issueUrl)
      return {
        id: `signal:${signal.id}`,
        kind: "approval",
        label: fillText(t.approve, { title: signal.title }),
        issue,
        href: issue ? null : (signal.issueUrl || signal.operationUrl || null),
        signalId: signal.id,
      }
    })
  const results: WaitingItem[] = resultsToJudge(runs, me).map((run) => ({
    id: `run:${run.id}`,
    kind: "result",
    label: fillText(t.reviewResult, { mission: runLabel(run) }),
    issue: run.projectId === null ? null : { projectId: run.projectId, issueId: run.issueId },
    href: null,
    signalId: null,
  }))
  return [...approvals, ...results]
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
