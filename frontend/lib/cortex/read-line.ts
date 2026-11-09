import type { AssistantRead } from "@/lib/api/assistant-service"
import type { CONSTANTS_EN } from "@/lib/constants_en"
import { fillText } from "@/lib/delivery/result-card"

import { toolWords } from "./work-lines"

type ConversationTexts = (typeof CONSTANTS_EN)["conversation"]
type ThreadTexts = (typeof CONSTANTS_EN)["thread"]

/** Un morceau de ce que le modèle a lu ; « notes » se nomme d'un clic quand le serveur a gardé leurs noms. */
export interface ReadPiece {
  kind: "notes" | "text"
  text: string
}

/**
 * La ligne grise sous une réponse (R123, R137 : plus de mot « Sources ») : le modèle qui a répondu, puis, dans une phrase,
 * ce que TaskForce lui a donné à lire, compté par le serveur (« qwen3:8b · read 5 notes and the SOLO board »). Rien de lu
 * se dit aussi, pour qu'un résumé écrit sans lire se voie. Null sans modèle (un repli) : aucun modèle n'a rien lu.
 */
export interface GreyLine {
  model: string
  /** Ce qu'il a lu ; vide pour une réponse d'avant la ligne grise. */
  pieces: ReadPiece[]
  /** Faux pour une réponse d'avant la ligne grise : le modèle seul, sans rien affirmer de plus. */
  known: boolean
}

export function greyLine(model: string | null | undefined, read: AssistantRead | null | undefined, c: ConversationTexts, t: ThreadTexts): GreyLine | null {
  const name = model?.trim()
  if (!name) return null
  if (!read) return { model: name, pieces: [], known: false }
  return { model: name, pieces: readPieces(read, c, t), known: true }
}

/** La même ligne en une chaîne : pour un lecteur d'écran, et le survol. */
export function readLine(line: GreyLine | null, c: ConversationTexts): string | null {
  if (!line) return null
  if (!line.known) return line.model
  if (line.pieces.length === 0) return `${line.model} · ${c.readNothing}`
  return `${line.model} · ${c.read} ${inASentence(line.pieces.map((piece) => piece.text), c).join("")}`
}

/** Ce que le modèle a lu, dans l'ordre de la ligne : les notes, les tableaux montrés, les issues lues, ce que ses outils ont lu. */
export function readPieces(read: AssistantRead, c: ConversationTexts, t: ThreadTexts): ReadPiece[] {
  const pieces: ReadPiece[] = []
  if (read.notes > 0) pieces.push({ kind: "notes", text: read.notes === 1 ? c.note : fillText(c.notes, { count: String(read.notes) }) })
  const boards = new Set((read.boards ?? []).map((board) => fillText(c.sawBoard, { project: board.project })))
  boards.forEach((text) => pieces.push({ kind: "text", text }))
  for (const issue of read.issues ?? []) {
    const text = issue.comments === 1
      ? fillText(c.readIssueComment, { key: issue.key })
      : issue.comments > 1
        ? fillText(c.readIssueComments, { key: issue.key, count: String(issue.comments) })
        : fillText(c.readIssue, { key: issue.key })
    pieces.push({ kind: "text", text })
  }
  const told = new Set(pieces.map((piece) => piece.text))
  for (const tool of read.tools ?? []) {
    const words = toolWords(tool.name, t).read
    // Ce que la personne reconnaît : « your notes » ne s'ajoute pas à « 5 notes » comme une autre lecture.
    if (!words || told.has(words) || (words === t.tools.search_brain.read && read.notes > 0)) continue
    told.add(words)
    pieces.push({ kind: "text", text: words })
  }
  return pieces
}

/** Des morceaux dans une phrase : « a », « , », « b », « and », « c ». */
export function inASentence<T extends string>(pieces: readonly T[], c: ConversationTexts): (T | string)[] {
  return pieces.flatMap((piece, i): (T | string)[] => {
    if (i === 0) return [piece]
    return i === pieces.length - 1 ? [` ${c.and} `, piece] : [", ", piece]
  })
}
