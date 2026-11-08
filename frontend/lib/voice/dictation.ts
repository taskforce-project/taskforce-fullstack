/** Ce que devient le texte du compositeur, et où se pose le curseur. */
export interface Dictated {
  text: string
  caret: number
}

/**
 * Écrit ce qui a été dit là où est le curseur, séparé de ce qui l'entoure par une espace quand il en faut une. Rien
 * d'autre ne change : la personne relit, corrige, et envoie elle-même (R76).
 */
export function insertDictation(draft: string, at: number, said: string): Dictated {
  const words = said.trim()
  if (!words) return { text: draft, caret: at }
  const caret = Math.max(0, Math.min(at, draft.length))
  const before = draft.slice(0, caret)
  const after = draft.slice(caret)
  const left = before.length > 0 && !/\s$/.test(before) ? " " : ""
  const right = after.length > 0 && !/^[\s.,;:!?)]/.test(after) ? " " : ""
  const written = `${left}${words}${right}`
  return { text: `${before}${written}${after}`, caret: caret + left.length + words.length + right.length }
}
