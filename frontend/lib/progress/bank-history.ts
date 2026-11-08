import type { EvalHistoryCase, EvalHistoryRun } from "@/lib/api/eval-service"
import type { CONSTANTS_EN } from "@/lib/constants_en"
import { fillText } from "@/lib/delivery/result-card"

import { dayOf, timeOf } from "./day"

// ---------------------------------------------------------------------------
// L'histoire de la banque d'évaluations dans le volet « Progress » (R61, R118, R125) : la courbe de ses rejeux par
// modèle, la note de chaque cas depuis son entrée, et d'où il vient. Du calcul et du texte seulement, pour que les
// composants restent un rendu et que la règle se teste. Rien n'y classe les modèles : l'ordre est celui du temps.
// ---------------------------------------------------------------------------

type ProgressTexts = (typeof CONSTANTS_EN)["progress"]

/** Le nom que le serveur donne à un rejeu sans modèle nommé. */
export const DEFAULT_MODEL = "default"

/** Ce que garde un texte de l'incident (ce que le modèle a dit, ce que TaskForce a montré) : de quoi le relire. */
const MAX_QUOTE = 240

/** Le modèle d'un rejeu : celui qui a répondu, sinon celui demandé ; null pour un rejeu sans nom qui n'a pas de note. */
export function runModel(run: Pick<EvalHistoryRun, "model" | "answeredBy">): string | null {
  return run.answeredBy ?? (run.model === DEFAULT_MODEL ? null : run.model)
}

/** Un rejeu fini : tous ses cas sont notés. Seul un rejeu fini compte dans la courbe. */
export const isFinished = (run: Pick<EvalHistoryRun, "finishedAt" | "total">): boolean =>
  run.finishedAt !== null && run.total > 0

/** La part des cas réussis d'un rejeu, en pour cent. */
export const passRate = (run: Pick<EvalHistoryRun, "passed" | "total">): number =>
  run.total > 0 ? Math.round((run.passed / run.total) * 100) : 0

/** Une ligne de la courbe : un modèle, sous une clé sans point (un `dataKey` lirait « qwen2.5:7b » comme un chemin). */
export interface CurveSeries {
  readonly key: string
  readonly model: string
}

/** Un point de la courbe : un rejeu fini, sa date, la part réussie sous la clé de son modèle. */
export interface CurvePoint {
  readonly at: number
  readonly runId: number
  readonly rates: Readonly<Record<string, number>>
  readonly model: string
  readonly passed: number
  readonly total: number
}

export interface BankCurve {
  readonly series: readonly CurveSeries[]
  readonly points: readonly CurvePoint[]
}

/**
 * La courbe de la banque : un point par rejeu fini, la part de ses cas réussis, une ligne par modèle, dans l'ordre où
 * chacun a été rejoué la première fois. Elle se trace dès deux rejeux finis ; avant, null.
 */
export function bankCurve(runs: readonly EvalHistoryRun[], fallback: string): BankCurve | null {
  const done = runs.filter(isFinished)
  if (done.length < 2) return null
  const series: CurveSeries[] = []
  const points = done.map((run): CurvePoint => {
    const model = runModel(run) ?? fallback
    let line = series.find((candidate) => candidate.model === model)
    if (!line) {
      line = { key: `m${series.length}`, model }
      series.push(line)
    }
    return { at: timeOf(run.startedAt), runId: run.id, rates: { [line.key]: passRate(run) }, model, passed: run.passed, total: run.total }
  })
  return { series, points }
}

/** La note d'un cas dans un rejeu : réussi ou non, et le jour du rejeu. */
export interface CaseMark {
  readonly runId: number
  readonly passed: boolean
  readonly day: string
}

/** Les notes d'un cas pour un modèle, dans l'ordre des rejeux. */
export interface CaseLine {
  readonly model: string
  readonly marks: readonly CaseMark[]
}

/** La note d'un cas à chaque rejeu depuis son entrée, par modèle, dans l'ordre des rejeux (R125). */
export function caseLines(item: Pick<EvalHistoryCase, "grades">, runs: readonly EvalHistoryRun[], fallback: string): CaseLine[] {
  const byId = new Map(runs.map((run) => [run.id, run]))
  const lines: { model: string; marks: CaseMark[] }[] = []
  for (const grade of item.grades) {
    const run = byId.get(grade.runId)
    if (!run) continue
    const model = runModel(run) ?? fallback
    let line = lines.find((candidate) => candidate.model === model)
    if (!line) {
      line = { model, marks: [] }
      lines.push(line)
    }
    line.marks.push({ runId: run.id, passed: grade.passed, day: dayOf(run.startedAt) })
  }
  return lines
}

/** La dernière note d'un cas, tous modèles confondus, et son modèle : le signe de sa ligne (R129) ; null sans rejeu. */
export function lastMark(lines: readonly CaseLine[]): (CaseMark & { readonly model: string }) | null {
  let last: (CaseMark & { model: string }) | null = null
  for (const line of lines) {
    for (const mark of line.marks) {
      if (last === null || mark.runId > last.runId) last = { ...mark, model: line.model }
    }
  }
  return last
}

/** D'où vient un cas, dans les mots du volet : l'origine, et pour un incident ce que le modèle a dit et ce qui a été montré. */
export interface CaseOrigin {
  readonly origin: string
  readonly said: string | null
  readonly shown: string | null
}

const clip = (text: string): string => {
  const flat = text.replace(/\s+/g, " ").trim()
  return flat.length <= MAX_QUOTE ? flat : `${flat.slice(0, MAX_QUOTE).trimEnd()}…`
}

/**
 * L'origine d'un cas (E17) : l'incident de confiance (TaskForce a corrigé la réponse, avec ce que Cortex avait dit et
 * ce que TaskForce a montré), une réponse de Cortex, ou seulement le jour de la question.
 */
export function caseOrigin(item: Pick<EvalHistoryCase, "askedOn" | "origin">, t: ProgressTexts): CaseOrigin {
  const date = dayOf(item.askedOn)
  if (item.origin.kind === "incident") {
    const said = item.origin.said.join(" ").trim()
    return {
      origin: fillText(t.originIncident, { date }),
      said: said ? fillText(t.originSaid, { text: clip(said) }) : null,
      shown: item.origin.shown ? fillText(t.originShown, { text: clip(item.origin.shown) }) : null,
    }
  }
  return { origin: fillText(item.origin.kind === "answer" ? t.originAnswer : t.originUnknown, { date }), said: null, shown: null }
}
