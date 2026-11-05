/**
 * Ce que la personne coche et tape sur une carte de questions de TaskForce (R115, séance n°17), dans la forme des
 * questions de Claude (décision du CEO, 05/11/2026 : « comme sur Claude ») : deux questions au plus, un choix ou
 * plusieurs cochés selon la question, « Other » pour taper sa réponse, et un seul envoi pour toutes. Le choix recommandé
 * est coché d'avance, comme le curseur de Claude sur son premier choix : la personne le confirme en envoyant. Ce sont ses
 * clics et ses mots qui partent, jamais une décision lue dans un message (R1).
 */
import type { AssistantQuestion, QuestionAnswer } from "@/lib/api/assistant-service"

/** La valeur de « Other » dans une question à un seul choix : ce qui est tapé. */
export const OTHER = "__other__"

/** Ce que la personne a choisi pour une question : les choix cochés, « Other » coché, et ce qu'elle a tapé. */
export interface Picked {
  values: string[]
  other: boolean
  typed: string
}

/** Les choix de départ de la carte : le recommandé coché d'avance, rien pour une question qui n'en a pas. */
export function initialPicks(questions: AssistantQuestion[]): Record<string, Picked> {
  const picks: Record<string, Picked> = {}
  for (const question of questions) {
    const recommended = question.choices.filter((choice) => choice.recommended).map((choice) => choice.value)
    picks[question.field] = { values: question.multiple ? recommended : recommended.slice(0, 1), other: false, typed: "" }
  }
  return picks
}

/** Un choix pris dans une question à un seul choix, ou « Other » : il remplace le précédent, ce qui est tapé reste. */
export function pick(picked: Picked, value: string): Picked {
  return value === OTHER ? { ...picked, values: [], other: true } : { ...picked, values: [value], other: false }
}

/** Un choix coché ou décoché dans une question dont plusieurs se cochent ; « Other » aussi. */
export function toggle(picked: Picked, value: string, on: boolean): Picked {
  if (value === OTHER) return { ...picked, other: on }
  const values = picked.values.filter((v) => v !== value)
  return { ...picked, values: on ? [...values, value] : values }
}

/** Ce qui est tapé dans « Other » : dès qu'il y a des mots, « Other » est choisi (le seul choix, s'il n'en prend qu'un). */
export function typeIn(picked: Picked, typed: string, multiple: boolean): Picked {
  if (!typed.trim()) return { ...picked, typed }
  return multiple ? { ...picked, other: true, typed } : { values: [], other: true, typed }
}

/** La question a sa réponse : un choix, ou des mots tapés dans « Other » (le seul champ d'une question sans choix). */
export function answered(question: AssistantQuestion, picked: Picked | undefined): boolean {
  if (!picked) return false
  const typed = picked.typed.trim().length > 0
  if (question.choices.length === 0) return typed
  return picked.values.length > 0 || (picked.other && typed)
}

/** Les réponses de la carte, telles que la route les prend ; null tant qu'une question n'a pas la sienne. */
export function answersOf(questions: AssistantQuestion[], picks: Record<string, Picked>): QuestionAnswer[] | null {
  if (!questions.every((question) => answered(question, picks[question.field]))) return null
  return questions.map((question) => {
    const picked = picks[question.field]
    const typed = question.choices.length === 0 || picked.other ? picked.typed.trim() : ""
    return typed ? { field: question.field, values: picked.values, other: typed } : { field: question.field, values: picked.values }
  })
}

/**
 * Ce que la carte dit des réponses parties : les libellés des choix et ce qui est tapé. Une question seule se dit seule ;
 * deux se disent par leur titre.
 */
export function saidOf(questions: AssistantQuestion[], answers: QuestionAnswer[]): string {
  const said = questions.map((question) => {
    const answer = answers.find((a) => a.field === question.field)
    const labels = (answer?.values ?? [])
      .map((value) => question.choices.find((choice) => choice.value === value)?.label ?? value)
    if (answer?.other) labels.push(answer.other)
    return { header: question.header, text: labels.join(", ") }
  })
  if (said.length === 1) return said[0].text
  return said.map((s) => (s.header ? `${s.header}: ${s.text}` : s.text)).join(" · ")
}
