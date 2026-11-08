import type { AssistantRead } from "@/lib/api/assistant-service"
import type { CONSTANTS_EN } from "@/lib/constants_en"
import { fillText } from "@/lib/delivery/result-card"

type ConversationTexts = (typeof CONSTANTS_EN)["conversation"]

/**
 * La ligne grise sous une réponse (R123, séance n°18) : le modèle qui a répondu, puis ce que TaskForce lui a donné à
 * lire, compté par le serveur (« qwen3:8b · read OPS-35 and 3 comments »). Les issues lues en entier d'abord, puis les
 * tableaux montrés, les outils qui lisent, les notes ; rien de lu se dit aussi, pour qu'un résumé écrit sans lire se
 * voie. Null sans modèle (un repli) : aucun modèle n'a rien lu.
 */
export function readLine(model: string | null | undefined, read: AssistantRead | null | undefined, t: ConversationTexts): string | null {
  const name = model?.trim()
  if (!name) return null
  // Une réponse d'avant la ligne grise ne dit pas ce qu'elle a lu : le modèle seul, sans rien affirmer de plus.
  if (!read) return name
  const parts = readParts(read, t)
  return [name, ...(parts.length > 0 ? parts : [t.readNothing])].join(" · ")
}

/** Ce que le modèle a lu, chaque chose en quelques mots, dans l'ordre de la ligne. */
export function readParts(read: AssistantRead, t: ConversationTexts): string[] {
  const parts: string[] = []
  for (const issue of read.issues ?? []) {
    if (issue.comments === 1) parts.push(fillText(t.readIssueComment, { key: issue.key }))
    else if (issue.comments > 1) parts.push(fillText(t.readIssueComments, { key: issue.key, count: String(issue.comments) }))
    else parts.push(fillText(t.readIssue, { key: issue.key }))
  }
  for (const board of read.boards ?? []) {
    const seen = board.issues === 1
      ? fillText(t.sawBoard, { project: board.project })
      : fillText(t.sawBoards, { project: board.project, count: String(board.issues) })
    parts.push(board.open ? `${seen}, ${fillText(t.sawOpen, { key: board.open })}` : seen)
  }
  for (const tool of read.tools ?? []) {
    parts.push(tool.calls > 1
      ? fillText(t.usedToolTimes, { tool: tool.name, count: String(tool.calls) })
      : fillText(t.usedTool, { tool: tool.name }))
  }
  if (read.notes === 1) parts.push(t.note)
  else if (read.notes > 1) parts.push(fillText(t.notes, { count: String(read.notes) }))
  return parts
}
