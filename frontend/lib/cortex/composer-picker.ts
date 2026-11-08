import type { AssistantAttachment } from "@/lib/api/assistant-service"
import type { IssueHit } from "@/lib/api/issue-service"

/**
 * Ce que le compositeur sait de ce qu'on tape (R123, séance n°18) : « + » joint une issue ou un projet ; « @ » ouvre la
 * liste des issues, des personnes et des projets, « / » en tête celle des gestes, dès le premier caractère. Une issue ou
 * un projet choisi se joint à la demande : Cortex reçoit son contenu, lu par TaskForce (la matière de l'issue, le tableau
 * du projet). Une personne s'écrit par son nom ; un geste remplit le compositeur, il n'envoie rien.
 */

/** Une pièce jointe du compositeur : une issue ou un projet, et ce que sa pastille montre. */
export interface ComposerAttachment {
  kind: "issue" | "project"
  projectId: number
  /** L'issue jointe ; null pour un projet. */
  issueId: number | null
  /** Ce que la pastille montre : la clé de l'issue, ou le nom du projet. */
  label: string
  /** Le titre de l'issue ; null pour un projet. */
  title: string | null
}

/** Les pièces jointes au plus, comme le serveur les accepte. */
export const MAX_ATTACHMENTS = 3

/** Une pièce jointe se nomme par son issue, ou par son projet. */
export const attachmentKey = (a: Pick<ComposerAttachment, "kind" | "projectId" | "issueId">): string =>
  a.kind === "issue" ? `issue:${a.issueId}` : `project:${a.projectId}`

/** Ajoute une pièce jointe ; la même une seule fois, et trois au plus. */
export function withAttachment(list: readonly ComposerAttachment[], item: ComposerAttachment): ComposerAttachment[] {
  if (list.length >= MAX_ATTACHMENTS || list.some((a) => attachmentKey(a) === attachmentKey(item))) return [...list]
  return [...list, item]
}

/** Les pièces jointes telles que la demande les envoie : une issue dans son projet, ou un projet. */
export function toRequest(list: readonly ComposerAttachment[]): AssistantAttachment[] {
  return list.map((a) => (a.kind === "issue" && a.issueId !== null ? { projectId: a.projectId, issueId: a.issueId } : { projectId: a.projectId }))
}

/** Ce qui ouvre une liste dans le texte : « @ » (une mention) ou « / » en tête (un geste), et ce qui est tapé après. */
export interface Trigger {
  kind: "mention" | "gesture"
  query: string
  /** Où commence ce qui sera remplacé (le « @ » ou le « / »), et où il finit (le curseur). */
  start: number
  end: number
}

/**
 * La liste à ouvrir au curseur : « / » au début du texte, jusqu'au premier blanc ; « @ » au début ou après un blanc,
 * jusqu'au curseur, sans blanc. Null sinon.
 */
export function triggerAt(text: string, caret: number): Trigger | null {
  const before = text.slice(0, Math.max(0, Math.min(caret, text.length)))
  const gesture = /^\/(\S*)$/.exec(before)
  if (gesture) return { kind: "gesture", query: gesture[1], start: 0, end: before.length }
  const mention = /(^|\s)@([^\s@]*)$/.exec(before)
  if (mention) return { kind: "mention", query: mention[2], start: before.length - mention[2].length - 1, end: before.length }
  return null
}

/** Le texte après un choix : ce qui ouvrait la liste remplacé par `insert`, suivi d'un blanc, et le curseur après lui. */
export function applyPick(text: string, trigger: Trigger, insert: string): { text: string; caret: number } {
  const after = text.slice(trigger.end)
  const spaced = insert.endsWith(" ") || after.startsWith(" ") ? insert : `${insert} `
  return { text: text.slice(0, trigger.start) + spaced + after, caret: trigger.start + spaced.length }
}

/** Une ligne d'une liste du compositeur. */
export interface PickOption {
  id: string
  group: "issues" | "people" | "projects" | "gestures"
  label: string
  detail: string | null
  /** Ce que le choix écrit à la place de ce qui a ouvert la liste. */
  insert: string
  /** Ce qu'il joint à la demande ; null pour une personne ou un geste. */
  attach: ComposerAttachment | null
}

/** Une personne de l'espace, comme la liste des membres la donne. */
export interface PickPerson {
  readonly userId: number
  readonly displayName: string | null
  readonly email: string
}

/** Un projet de l'espace, comme la barre de gauche le connaît. */
export interface PickProject {
  readonly id: number
  readonly name: string
  readonly identifier?: string | null
}

/** Un geste de Cortex, dans les mots de l'interface : ce que la liste montre, et ce qu'il écrit dans le compositeur. */
export interface PickGesture {
  readonly id: string
  readonly label: string
  readonly text: string
}

/** Les lignes de chaque groupe au plus : la liste reste courte, la recherche fait le reste. */
export const PER_GROUP = 5

const said = (query: string, ...values: (string | null | undefined)[]): boolean => {
  const wanted = query.trim().toLowerCase()
  return wanted === "" || values.some((value) => value?.toLowerCase().includes(wanted))
}

/** Le nom d'une personne tel qu'il s'écrit dans une demande : son nom affiché, sinon le début de son adresse. */
export const personName = (person: PickPerson): string => person.displayName?.trim() || person.email.split("@")[0]

/** L'option d'une issue : sa clé s'écrit dans la demande, et l'issue s'y joint. */
export function issueOption(issue: IssueHit): PickOption {
  return {
    id: `issue:${issue.id}`, group: "issues", label: issue.key, detail: issue.title, insert: issue.key,
    attach: { kind: "issue", projectId: issue.projectId, issueId: issue.id, label: issue.key, title: issue.title },
  }
}

/** L'option d'un projet : son nom s'écrit dans la demande, et son tableau s'y joint. */
export function projectOption(project: PickProject): PickOption {
  return {
    id: `project:${project.id}`, group: "projects", label: project.name, detail: project.identifier ?? null,
    insert: project.name, attach: { kind: "project", projectId: project.id, issueId: null, label: project.name, title: null },
  }
}

/**
 * La liste de « @ » : les issues que la recherche a trouvées (déjà filtrées par le serveur, par clé ou par titre), puis
 * les personnes et les projets dont le nom contient ce qui est tapé ; tous dès le premier caractère.
 */
export function mentionOptions(query: string, sources: Readonly<{
  issues: readonly IssueHit[]
  people: readonly PickPerson[]
  projects: readonly PickProject[]
}>): PickOption[] {
  const issues = sources.issues.slice(0, PER_GROUP).map(issueOption)
  const people = sources.people
    .filter((person) => said(query, person.displayName, person.email))
    .slice(0, PER_GROUP)
    .map((person): PickOption => ({
      id: `person:${person.userId}`, group: "people", label: personName(person), detail: person.email,
      insert: personName(person), attach: null,
    }))
  const projects = sources.projects.filter((p) => said(query, p.name, p.identifier)).slice(0, PER_GROUP).map(projectOption)
  return [...issues, ...people, ...projects]
}

/** La liste de « / » : les gestes dont le nom contient ce qui est tapé. */
export function gestureOptions(query: string, gestures: readonly PickGesture[]): PickOption[] {
  return gestures.filter((gesture) => said(query, gesture.label)).map((gesture) => ({
    id: `gesture:${gesture.id}`, group: "gestures", label: gesture.label, detail: null, insert: gesture.text, attach: null,
  }))
}

/** La ligne suivante (ou précédente) d'une liste au clavier, qui reboucle ; -1 pour une liste vide. */
export function nextIndex(current: number, delta: number, length: number): number {
  if (length <= 0) return -1
  return ((current + delta) % length + length) % length
}
