/**
 * Ce que TaskForce dit dans une réponse de Cortex (R116, séance n°17). Le serveur remplace une phrase qui annonce une
 * action qu'aucun outil du tour n'a faite par la vérité, dans un bloc `> [!taskforce] TaskForce` ; il retire cette
 * marque de ce que le modèle écrit, donc seul TaskForce signe. La conversation montre ce bloc comme la parole de
 * TaskForce, pas comme celle du modèle ; le reste de la réponse reste le markdown de Cortex. La marque vit dans le texte
 * de la réponse : une conversation rouverte se relit pareil.
 */
export type AnswerPart =
  | { by: "cortex"; text: string }
  | { by: "taskforce"; lines: string[] }

const SIGNATURE = /^\s*>\s?\[!taskforce\]/i
const QUOTED = /^\s*>\s?/

/** Coupe une réponse en ce que Cortex a écrit et ce que TaskForce dit, dans l'ordre de la réponse. */
export function splitAnswer(answer: string): AnswerPart[] {
  const parts: AnswerPart[] = []
  let cortex: string[] = []
  let taskforce: string[] | null = null
  const flush = () => {
    const text = cortex.join("\n").trim()
    if (text) parts.push({ by: "cortex", text })
    cortex = []
  }
  for (const line of answer.replace(/\r\n/g, "\n").split("\n")) {
    if (SIGNATURE.test(line)) {
      flush()
      taskforce = []
      parts.push({ by: "taskforce", lines: taskforce })
    } else if (taskforce && QUOTED.test(line)) {
      const said = line.replace(QUOTED, "").trim()
      if (said) taskforce.push(said)
    } else {
      taskforce = null
      cortex.push(line)
    }
  }
  flush()
  return parts.filter((part) => part.by === "cortex" || part.lines.length > 0)
}
