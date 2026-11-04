/**
 * Ce que TaskForce dit dans une réponse de Cortex (R116, séance n°17). Le serveur remplace une phrase qui annonce une
 * action qu'aucun outil du tour n'a faite par la vérité, dans un bloc `> [!taskforce] TaskForce` ; il retire cette
 * marque de ce que le modèle écrit, donc seul TaskForce signe. La conversation montre ce bloc comme la parole de
 * TaskForce, pas comme celle du modèle ; le reste de la réponse reste le markdown de Cortex. La marque vit dans le texte
 * de la réponse : une conversation rouverte se relit pareil.
 *
 * Un bloc signé « TaskForce · models » parle du modèle qui répond (R113, R118) : la banque dit qu'il échoue à ce genre de
 * demande et qu'un autre le réussit, ou la personne a envoyé la demande à un autre modèle. Ce n'est pas une correction.
 */
export type AnswerPart =
  | { by: "cortex"; text: string }
  | { by: "taskforce"; lines: string[]; kind?: "models" }

const SIGNATURE = /^\s*>\s?\[!taskforce\]/i
const QUOTED = /^\s*>\s?/
const ABOUT_MODELS = /·\s*models\s*$/i

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
      parts.push(ABOUT_MODELS.test(line)
        ? { by: "taskforce", lines: taskforce, kind: "models" }
        : { by: "taskforce", lines: taskforce })
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
