import type { CONSTANTS_EN } from "@/lib/constants_en"
import type {
  RuleApprover, RuleConditions, RuleDecision, RuleEffect, RuleProblem, RuleScope,
} from "@/lib/api/rules-service"
import { parseServerDate } from "@/lib/utils/server-date"

// ---------------------------------------------------------------------------
// Une règle dite en mots (R94, R133) : la phrase que TaskForce rend à la personne, faite des parties de la règle (son
// action, ses conditions, qui accorde), jamais du format des règles. Un motif qui ne se dit pas simplement reste entre
// guillemets ; le format lui-même est à deux clics, dans les détails.
// ---------------------------------------------------------------------------

export type RulesTexts = (typeof CONSTANTS_EN)["rules"]
type ActionKey = keyof RulesTexts["actions"]

const SPECIAL = /[*{}]/

/** Remplit un gabarit `{clé}`. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (all, key: string) => (key in values ? String(values[key]) : all))
}

/** Le jour d'une date du serveur, « 11 Nov 2026 ». */
export function dayOf(iso: string | null | undefined): string {
  if (!iso) return ""
  return parseServerDate(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

/** Un outil de l'entreprise par sa clé, dit comme un nom : « stripe » devient « Stripe ». */
function toolName(key: string): string {
  return key.length === 0 ? key : key.charAt(0).toUpperCase() + key.slice(1)
}

function actionOf(action: string | null | undefined, t: RulesTexts): { does: string; do: string } {
  const key = (action && action in t.actions ? action : "any") as ActionKey
  return t.actions[key]
}

/** Qui agit : un agent, une personne en son nom, ou n'importe qui quand la règle ne le dit pas. */
export function subjectOf(actor: string | null | undefined, t: RulesTexts, fallback: "anyone" | "agent" = "anyone"): string {
  if (actor === "agent") return t.subjects.agent
  if (actor === "person") return t.subjects.person
  return t.subjects[fallback]
}

/** Une personne désignée, par son nom ; un rôle, en mots. */
export function approverName(approver: RuleApprover | string, t: RulesTexts): string {
  const ref = typeof approver === "string" ? approver : approver.ref
  const name = typeof approver === "string" ? null : approver.name
  if (ref === "role:owner") return t.who.owner
  if (ref === "role:admin") return t.who.admin
  if (ref === "project-lead") return t.who.projectLead
  if (name) return name
  return ref.startsWith("person:") || ref.startsWith("role:") ? t.who.unknown : ref
}

/** Une liste de personnes dont une seule suffit : « Marie Martin or an admin ». */
export function anyOf(approvers: ReadonlyArray<RuleApprover | string>, t: RulesTexts): string {
  return approvers.map((a) => approverName(a, t)).join(t.who.or)
}

/** Plusieurs listes, chacune à réunir : « Marie Martin, and an admin ». */
export function allOf(sets: ReadonlyArray<ReadonlyArray<RuleApprover | string>>, t: RulesTexts): string {
  return sets.map((set) => anyOf(set, t)).join(t.who.and)
}

function pathWords(pattern: string, t: RulesTexts): string {
  const folder = /^\*\*\/([^/*{}]+)\/\*\*$/.exec(pattern)
  if (folder) return fill(t.where.underFolder, { name: folder[1] ?? "" })
  const under = /^([^*{}]+)\/\*\*$/.exec(pattern)
  if (under) return fill(t.where.underPath, { path: `${under[1] ?? ""}/` })
  if (!SPECIAL.test(pattern)) return fill(t.where.atPath, { path: pattern })
  return fill(t.where.matchingPath, { pattern })
}

function commandWords(pattern: string, t: RulesTexts): string {
  const starts = /^([^*{}]+?)\s*\*\*$/.exec(pattern)
  if (starts) return fill(t.where.commandStarts, { prefix: (starts[1] ?? "").trim() })
  if (!SPECIAL.test(pattern)) return fill(t.where.command, { command: pattern })
  return fill(t.where.commandMatching, { pattern })
}

/** Où et comment une règle s'applique, en mots, d'après ses conditions (des motifs). */
export function whereOf(when: RuleConditions | null | undefined, t: RulesTexts): string {
  if (!when) return ""
  let out = ""
  if (when.path) out += pathWords(when.path, t)
  if (when.command) out += commandWords(when.command, t)
  if (when.branch) out += when.branch === "tf/**" ? t.where.agentBranch : fill(t.where.branch, { pattern: when.branch })
  if (when.repoVisibility === "public") out += t.where.public
  if (when.repoVisibility === "private") out += t.where.private
  if (when.server) out += fill(t.where.server, { server: toolName(when.server) })
  if (when.tool) out += fill(t.where.tool, { tool: when.tool })
  if (when.over) {
    out += fill(t.where.over, {
      field: when.over.fact.replace(/^arg\./, ""),
      value: when.over.value.toLocaleString("en-US"),
    })
  }
  return out
}

/** Une règle en une phrase : qui elle concerne, ce qu'elle fait, et qui accorde. */
export function ruleSentence(
  rule: { when?: RuleConditions | null; effect: RuleEffect | string },
  t: RulesTexts,
  obligations: { approvers?: ReadonlyArray<RuleApprover | string>; signatures?: number; separate?: boolean } = {},
  fallbackSubject: "anyone" | "agent" = "anyone",
): string {
  const when = rule.when ?? null
  const action = actionOf(when?.action, t)
  const values = { subject: subjectOf(when?.actor, t, fallbackSubject), does: action.does, do: action.do, where: whereOf(when, t) }
  if (rule.effect === "deny") return fill(t.sentence.deny, values)
  if (rule.effect === "allow") return fill(t.sentence.allow, values)
  const who = obligations.approvers ?? []
  let out = who.length > 0 ? fill(t.sentence.askWho, { ...values, who: anyOf(who, t) }) : fill(t.sentence.ask, values)
  if ((obligations.signatures ?? 1) > 1) out += fill(t.sentence.twoPeople, { count: obligations.signatures ?? 2 })
  if (obligations.separate) out += t.sentence.notThePreparer
  return out
}

/** Une action par ses faits (des valeurs, pas des motifs) : « An agent changes a file at src/accounting/ledger.ts ». */
export function factsSentence(facts: Record<string, string>, t: RulesTexts): string {
  const action = actionOf(facts.action, t)
  let where = ""
  if (facts.path) where += fill(t.where.atPath, { path: facts.path })
  if (facts.command) where += fill(t.where.command, { command: facts.command })
  if (facts.branch) where += fill(t.where.branch, { pattern: facts.branch })
  if (facts.repoVisibility === "public") where += t.where.public
  if (facts.repoVisibility === "private") where += t.where.private
  if (facts.server) where += fill(t.where.server, { server: toolName(facts.server) })
  for (const [key, value] of Object.entries(facts)) {
    if (key.startsWith("arg.")) where += fill(t.where.argument, { name: key.slice(4), value })
  }
  const subject = subjectOf(facts.actor, t, "agent")
  const sentence = `${subject} ${action.does}${where}`
  return sentence.charAt(0).toUpperCase() + sentence.slice(1)
}

/** Ce que le moteur a décidé, en deux ou trois mots : « Asks Marie Martin first », « Allowed », « Refused ». */
export function decisionWords(decision: Pick<RuleDecision, "effect" | "approvers">, t: RulesTexts): string {
  if (decision.effect === "allow") return t.decision.allow
  if (decision.effect === "deny") return t.decision.deny
  return decision.approvers.length > 0 ? fill(t.decision.askWho, { who: allOf(decision.approvers, t) }) : t.decision.ask
}

/** D'où vient la décision : le socle, la table de TaskForce, ou une couche de l'entreprise. */
export function fromWords(decision: Pick<RuleDecision, "layer" | "layerName" | "rule">, t: RulesTexts): string {
  switch (decision.layer) {
    case "floor": return t.from.floor
    case "taskforce": return t.from.taskforce
    case "workspace": return t.from.workspace
    case "project": return fill(t.from.project, { name: decision.layerName ?? "" })
    case "process": return fill(t.from.process, { name: decision.layerName ?? "" })
    case "role": return fill(t.from.role, { role: roleWords(decision.layerName, t) })
    case "person": return fill(t.from.person, { name: decision.layerName ?? "" })
    default: return t.from.none
  }
}

function roleWords(role: string | null | undefined, t: RulesTexts): string {
  return role && role in t.roles ? t.roles[role as keyof RulesTexts["roles"]] : (role ?? "")
}

/** Le titre d'une couche : « This workspace », « Project Accounting », « Everyone who is a member », un nom. */
export function layerTitle(layer: { scope: RuleScope; ref: string | null; name: string | null }, t: RulesTexts,
  inProject = false): string {
  switch (layer.scope) {
    case "workspace": return t.workspaceLayer
    case "project": return inProject ? t.thisProject : fill(t.projectLayer, { name: layer.name ?? "" })
    case "process": return fill(t.processLayer, { name: layer.name ?? layer.ref ?? "" })
    case "role": return fill(t.roleLayer, { role: roleWords(layer.ref, t) })
    case "person": return fill(t.personLayer, { name: layer.name ?? "" })
  }
}

/** Un refus de la vérification, en mots. */
export function problemWords(problem: RuleProblem, t: RulesTexts): string {
  const known = problem.code in t.problems ? t.problems[problem.code as keyof RulesTexts["problems"]] : t.problems.other
  if (problem.code === "neverApplies") {
    const fact = problem.detail && problem.detail in t.facts
      ? t.facts[problem.detail as keyof RulesTexts["facts"]] : t.facts.over
    return fill(known, { fact })
  }
  if (problem.code === "nothing" && problem.detail) return `${known} ${problem.detail}`
  return known
}

/**
 * Ce qu'un accord de mission attend, quand une règle de l'entreprise désigne qui accorde (R98) : qui, combien de
 * personnes, et si la personne qui a délégué en est exclue. Vide pour un accord ordinaire.
 */
export function obligationWords(
  approval: { waitingFor?: string[][]; signatures?: number; separate?: boolean; signedBy?: string[] },
  t: RulesTexts,
): string[] {
  const out: string[] = []
  const sets = approval.waitingFor ?? []
  if (sets.length > 0) out.push(fill(t.approval.waitsFor, { who: allOf(sets, t) }))
  if ((approval.signatures ?? 1) > 1) {
    out.push(fill(t.approval.signatures, { count: approval.signatures ?? 2, signed: approval.signedBy?.length ?? 0 }))
  }
  if (approval.separate) out.push(t.approval.notThePreparer)
  if ((approval.signedBy?.length ?? 0) > 0) out.push(fill(t.approval.signedBy, { who: (approval.signedBy ?? []).join(t.who.and) }))
  return out
}
