import type { DeliveryRunEvent, MissionEvidence } from "@/lib/api/delivery-service"

/**
 * La vue du travail d'une mission (R95, point 3 ; séance n°18), lue dans ce que le runner a déjà envoyé : la chronologie
 * de l'agent (ses étapes et ses appels d'outils), et le dossier de preuve qui se construit. Rien n'y juge l'agent (R57) :
 * on y lit ce qu'il a fait, pas une note.
 */

/** Les outils de Claude Code qui écrivent un fichier : la chronologie porte son chemin, relatif au dépôt. */
const WRITES = new Set(["Write"])
const EDITS = new Set(["Edit", "MultiEdit", "NotebookEdit"])

/** Un fichier que la mission a écrit ou modifié, et combien de fois. */
export interface FileChange {
  readonly path: string
  /** `written` : écrit d'un bloc (créé, ou réécrit) ; `edited` : modifié par endroits. */
  readonly kind: "written" | "edited"
  readonly times: number
}

/** Les fichiers de la mission, dans l'ordre où elle les a touchés. */
export function fileChanges(events: readonly DeliveryRunEvent[]): FileChange[] {
  const files = new Map<string, { kind: FileChange["kind"]; times: number }>()
  for (const event of events) {
    const tool = event.tool ?? ""
    const path = event.text.trim()
    if (event.kind !== "tool" || !path || (!WRITES.has(tool) && !EDITS.has(tool))) continue
    const known = files.get(path)
    const kind = WRITES.has(tool) || known?.kind === "written" ? "written" : "edited"
    files.set(path, { kind, times: (known?.times ?? 0) + 1 })
  }
  return [...files].map(([path, file]) => ({ path, ...file }))
}

/** Ce que la mission a écrit dans TaskForce, par le MCP TaskForce : un commentaire, une issue, une case cochée. */
export type DocumentGesture = "comment" | "issue" | "update" | "checklist"

export interface DocumentChange {
  readonly seq: number
  readonly gesture: DocumentGesture
  /** L'issue qu'il touche, quand l'appel la nomme. */
  readonly issue: string | null
  /** Ce qu'il dit : le commentaire, le titre ; vide quand l'appel ne le montre pas. */
  readonly text: string
}

const DOCUMENTS: Readonly<Record<string, DocumentGesture>> = {
  add_comment: "comment",
  create_issue: "issue",
  update_issue: "update",
  check_checklist_item: "checklist",
}

function argumentsOf(text: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(text)
    return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

const stringOf = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null)

/** Les écritures de la mission dans TaskForce, dans l'ordre. Les outils d'un autre serveur MCP n'en sont pas. */
export function documentChanges(events: readonly DeliveryRunEvent[]): DocumentChange[] {
  return events.flatMap((event) => {
    const match = event.kind === "tool" ? /^taskforce: (\w+)$/.exec(event.tool ?? "") : null
    const gesture = match ? DOCUMENTS[match[1]] : undefined
    if (!gesture) return []
    const args = argumentsOf(event.text)
    const text = stringOf(args.content) ?? stringOf(args.title) ?? stringOf(args.text) ?? stringOf(args.item) ?? ""
    return [{ seq: event.seq, gesture, issue: stringOf(args.issue), text }]
  })
}

/**
 * L'ancre d'un fichier dans l'onglet « Files changed » d'une pull request GitHub : `diff-` et l'empreinte SHA-256 de son
 * chemin. null quand le navigateur ne sait pas la calculer : le lien mène alors à l'onglet entier.
 */
export async function diffAnchor(path: string): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) return null
  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(path))
  return `diff-${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`
}

/**
 * La preuve telle qu'elle se construit : combien d'événements le dossier garde, si la mission a fini, et le sceau quand il
 * y en a un, avec ce que son énoncé dit de la clé. Finir ne scelle pas : seul un sceau signe (R161 M5 de #552).
 */
export interface Proof {
  readonly count: number
  readonly ended: boolean
  /** La clé du sceau sur le poste de l'agent (elle pouvait la lire), et un sceau posé tard ; null sans sceau. */
  readonly seal: { readonly sameMachine: boolean; readonly late: boolean } | null
}

/** Ce que l'énoncé d'un sceau (une enveloppe DSSE) dit de lui ; la page de vérification en vérifie la signature. */
function predicateOf(seal: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!seal || typeof seal.payload !== "string") return null
  try {
    const decoded = atob(seal.payload)
    const parsed: unknown = JSON.parse(new TextDecoder().decode(Uint8Array.from(decoded, (c) => c.charCodeAt(0))))
    const predicate = parsed !== null && typeof parsed === "object" ? (parsed as { predicate?: unknown }).predicate : null
    return predicate !== null && typeof predicate === "object" ? predicate as Record<string, unknown> : null
  } catch {
    return null
  }
}

export function proofOf(evidence: MissionEvidence | null | undefined): Proof {
  const events = evidence?.events ?? []
  const predicate = predicateOf(evidence?.seal)
  const key = predicate?.key !== null && typeof predicate?.key === "object" ? predicate.key as Record<string, unknown> : {}
  return {
    count: events.length,
    ended: events.some((event) => event.type === "mission.ended"),
    // Sans garde lisible, la clé est dite sur le poste de l'agent : la réserve d'abord (R198, R161 M5).
    seal: predicate ? { sameMachine: key.custody !== "separate-machine", late: predicate.late === true } : null,
  }
}

/** Les mots de la ligne de la preuve, les mêmes dans la vue du travail et l'inspecteur du workflow que sur la page. */
export interface ProofTexts {
  readonly none: string
  readonly events: string
  readonly eventsOne: string
  readonly soFar: string
  readonly ended: string
  readonly signed: string
  readonly signedSameMachine: string
  readonly signedLate: string
}

/** La ligne de la preuve : jamais « sealed » pour une mission finie sans sceau, ni comme garantie quand l'agent lisait la clé. */
export function proofLine(proof: Proof, t: ProofTexts): string {
  if (proof.count === 0) return t.none
  const events = proof.count === 1 ? t.eventsOne : t.events.replace("{count}", String(proof.count))
  const state = !proof.ended && !proof.seal ? t.soFar
    : !proof.seal ? t.ended
    : proof.seal.late ? t.signedLate
    : proof.seal.sameMachine ? t.signedSameMachine
    : t.signed
  return state.replace("{events}", events)
}
