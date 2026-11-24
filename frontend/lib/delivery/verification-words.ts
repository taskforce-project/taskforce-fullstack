import type { CONSTANTS_EN } from "@/lib/constants_en"
import { fillText } from "@/lib/delivery/result-card"
import { parseServerDate } from "@/lib/utils/server-date"

import type { DossierText, NotChecked, PageDecision, PageRule, VerificationPage, Who } from "./verification"

/**
 * Les mots de la page de vérification (R212), tirés de son modèle ({@link VerificationPage}) : d'abord ce que la page a
 * vérifié, où et quand, puis une phrase (qui a demandé quoi, ce qui a changé, ce qui a été vérifié, qui a tranché), puis
 * les rubriques, chacune une suite de lignes dont la première dit l'essentiel et les autres le détail (R133). L'écran et
 * la page exportée les montrent tels quels. Aucun mot n'est de l'agent, sauf son résumé, marqué `agent` ; ses autres mots
 * (des noms de fichiers, une commande, une erreur) sont cités entre guillemets, et dits comme les siens.
 */
type Texts = typeof CONSTANTS_EN.verification

export type SectionId = "request" | "changed" | "classification" | "checks" | "notChecked" | "decisions" | "model" | "record"

/** Un morceau d'une ligne du résumé de l'agent : du texte, ou du code cité. */
export interface Part {
  readonly code: boolean
  readonly text: string
}

/** Un bloc du résumé de l'agent : un titre, un paragraphe, un point d'une liste. Jamais un lien ni une image. */
export interface Block {
  readonly kind: "heading" | "paragraph" | "item"
  readonly parts: readonly Part[]
}

export interface Line {
  readonly text: string
  /** `agent` : les mots de l'agent ; `warn` : ce que le dossier ne prouve pas ; `ok` : ce que la page a vérifié ; `muted` : un détail. */
  readonly tone?: "agent" | "warn" | "muted" | "ok"
  /** Un long texte du dossier, montré à part : la description, le brief. */
  readonly body?: string
  /** Le résumé de l'agent, en blocs simples, sans lien ni image (R161 M2). */
  readonly blocks?: readonly Block[]
  /** Une adresse que la ligne nomme : un lien seulement vers GitHub (R159 P7). */
  readonly link?: string
  /** Une longue liste (les fichiers), repliée au-delà de `fold` lignes (R161 M1). */
  readonly list?: { readonly lines: readonly Line[]; readonly fold: number }
}

export interface Section {
  readonly id: SectionId
  readonly title: string
  /** La première ligne dit l'essentiel ; les suivantes, le détail, se déplient. */
  readonly lines: readonly Line[]
}

/** Ce que la page sait de là où elle s'affiche : la mission de l'adresse, et l'app de bureau. */
export interface WordsContext {
  readonly runId: number
  readonly desktop: boolean
}

/** Au-delà, une liste se replie : la page se lit en deux à cinq minutes, même à 345 fichiers (R161 M1). */
export const FOLD = 10

/** Une date du dossier, dite pour une personne, en UTC pour qu'un auditeur la relise telle quelle. */
export function when(at: string | null): string {
  if (!at) return "?"
  const date = parseServerDate(at)
  if (Number.isNaN(date.getTime())) return at
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`
}

/** Une empreinte, courte à l'écran, sans points de suspension (R161 F4) ; le dossier la garde entière. */
export function short(digest: string | null): string {
  if (!digest) return "?"
  const [algorithm, hex] = digest.includes(":") ? digest.split(":", 2) : ["", digest]
  return algorithm ? `${algorithm}:${(hex ?? "").slice(0, 12)}` : digest.slice(0, 12)
}

/** Une adresse dont on fait un lien : GitHub seul, jamais `javascript:` ni rien d'autre (R159 P7). */
export function linkable(url: string | null | undefined): url is string {
  return typeof url === "string" && /^https:\/\/github\.com\/[^\s"'<>]+$/.test(url)
}

/** Une personne telle que le dossier la nomme. */
export function whoWords(who: Who | null | undefined, t: Texts): string {
  if (!who || who.kind === "unnamed") return t.people.unnamed
  return who.kind === "erased" ? t.people.erased : who.name
}

/** Le résumé de l'agent, en blocs simples : les titres, les listes et le code cité de son Markdown, sans ses signes. */
export function summaryBlocks(text: string): Block[] {
  const blocks: Block[] = []
  let paragraph: string[] = []
  let fenced = false
  const flush = () => {
    if (paragraph.length > 0) blocks.push({ kind: "paragraph", parts: inlineParts(paragraph.join(" ")) })
    paragraph = []
  }
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trimEnd()
    if (/^\s*```/.test(line)) {
      flush()
      fenced = !fenced
      continue
    }
    if (fenced) {
      if (line.trim()) blocks.push({ kind: "paragraph", parts: [{ code: true, text: line }] })
      continue
    }
    const heading = /^\s{0,3}#{1,6}\s+(.*)$/.exec(line)
    const item = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line)
    if (heading) {
      flush()
      blocks.push({ kind: "heading", parts: inlineParts(heading[1] ?? "") })
    } else if (item) {
      flush()
      blocks.push({ kind: "item", parts: inlineParts(item[1] ?? "") })
    } else if (!line.trim()) {
      flush()
    } else {
      paragraph.push(line.trim())
    }
  }
  flush()
  return blocks
}

/** Une ligne de Markdown en morceaux : le code entre accents graves à part ; liens et images réduits à leur texte. */
export function inlineParts(text: string): Part[] {
  const plain = text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
  const parts: Part[] = []
  const re = /`([^`]+)`/g
  let at = 0
  for (let m = re.exec(plain); m; m = re.exec(plain)) {
    if (m.index > at) parts.push({ code: false, text: plain.slice(at, m.index) })
    parts.push({ code: true, text: m[1] ?? "" })
    at = m.index + m[0].length
  }
  if (at < plain.length) parts.push({ code: false, text: plain.slice(at) })
  return parts
}

/** Quel texte : le titre de la demande, le brief... */
function kindWords(kind: string | null, t: Texts): string {
  const kinds = t.textKinds as Record<string, string>
  return (kind && kinds[kind]) || t.textKinds.other
}

/** Un texte qui n'est pas là : changé depuis, effacé (par qui, quand), ou absent de ce fichier. */
function textLine(text: DossierText, kind: string, t: Texts): Line | null {
  if (text.state === "changed") return { text: fillText(t.changedText, { what: kindWords(kind, t) }), tone: "warn" }
  if (text.state === "erased") {
    const e = text.erasure
    return { text: e ? fillText(t.erasedText, { what: kindWords(e.what ?? kind, t), who: whoWords(e.who, t), date: when(e.at) })
      : fillText(t.erasedPerson, { what: kindWords(kind, t) }), tone: "warn" }
  }
  if (text.state === "missing") return { text: t.missing, tone: "warn" }
  return null
}

/** Les premières lignes : ce que la page a vérifié du dossier, dans cette app, et quand (R161 B1, R159 P5). */
export function verdictLines(page: VerificationPage, t: Texts): Line[] {
  const c = page.check
  if (!c) return [{ text: t.checking, tone: "muted" }]
  const v = t.verdict
  const date = when(c.at)
  if (c.chain === "link") return [{ text: fillText(v.link, { date, event: c.brokenAt ?? "?" }), tone: "warn" }]
  if (c.chain === "root") return [{ text: fillText(v.root, { date }), tone: "warn" }]
  if (c.chain !== "holds" || !c.details) return [{ text: fillText(v.unreadable, { date }), tone: "warn" }]
  const d = c.details
  const changed = d.texts.changed.length
  const lines: Line[] = []
  const clean = d.header.differs.length === 0 && d.header.missing.length === 0 && changed === 0 && d.texts.unnamed.length === 0
  if (page.older) lines.push({ text: fillText(v.holdsOlder, { date, events: page.record.events }), tone: "ok" })
  else lines.push({ text: d.texts.referenced > 0 && changed === 0
    ? fillText(v.holds, { date, events: page.record.events, texts: d.texts.matches.length })
    : fillText(v.holdsNoTexts, { date, events: page.record.events }), tone: clean ? "ok" : undefined })
  if (d.header.differs.length > 0 || d.header.missing.length > 0) {
    lines.push({ text: fillText(v.header, { fields: [...d.header.differs, ...d.header.missing].join(", ") }), tone: "warn" })
  }
  if (changed > 0) lines.push({ text: changed === 1 ? v.textsOne : fillText(v.texts, { count: changed }), tone: "warn" })
  if (d.texts.unnamed.length > 0) lines.push({ text: v.unnamed, tone: "warn" })
  if (d.texts.absent.length > 0) lines.push({ text: fillText(v.erased, { count: d.texts.absent.length }), tone: "muted" })
  if (d.rules.present && !d.rules.digestHolds) lines.push({ text: v.rules, tone: "warn" })
  if (d.rules.differ.length > 0) lines.push({ text: v.rulesDiffer, tone: "warn" })
  // La réserve d'abord : une clé que l'agent pouvait lire ne prouve rien du dossier (R198, R161 M5).
  const sameMachine = d.seal.custody !== "separate-machine"
  switch (d.seal.state) {
    case "trusted": lines.push(sameMachine ? { text: v.trustedSameMachine, tone: "warn" } : { text: v.trusted, tone: "ok" }); break
    case "self": lines.push({ text: c.keysKnown ? v.self : v.selfNoKeys, tone: "warn" }); break
    case "none": lines.push({ text: page.running ? v.notSealedRunning : v.notSealedEnded, tone: "warn" }); break
    case "broken": lines.push({ text: v.broken, tone: "warn" }); break
    case "unchecked": lines.push({ text: v.unchecked, tone: "warn" }); break
  }
  if (d.runnerFacts) lines.push({ text: v.runnerFacts, tone: "warn" })
  return lines
}

/** La phrase d'abord (R161 M1) : qui a demandé quoi, ce qui a changé, ce qui a été vérifié, qui a tranché. */
export function summarySentence(page: VerificationPage, t: Texts): string {
  const s = t.summary
  const r = page.request
  const who = whoWords(r.delegatedBy, t)
  const parts: string[] = []
  if (r.title.state === "text") parts.push(fillText(s.asked, { who, title: r.title.text }))
  else if (r.issue && r.delegatedBy) parts.push(fillText(s.askedIssue, { who, issue: r.issue }))
  else parts.push(s.askedUnknown)
  const c = page.changes
  const count = c.files.length + c.more
  if (page.running) parts.push(s.working)
  else if (c.status && c.status !== "DONE") parts.push(s.notFinished)
  else if (c.known && count === 0) parts.push(s.noFiles)
  else if (c.known) {
    parts.push(c.pullRequest ? (count === 1 ? s.changedPrOne : fillText(s.changedPr, { count })) : (count === 1 ? s.changedOne : fillText(s.changed, { count })))
  }
  const tests = page.checks.find((check) => check.what === "tests")
  if (tests?.result === "passed") {
    const counts = tests.passedCount !== null && tests.total !== null ? fillText(s.counts, { passed: tests.passedCount, total: tests.total }) : ""
    parts.push(fillText(s.testsPassed, { counts }))
  } else if (tests) parts.push(s.testsFailed)
  else if (page.notChecked.some((n) => n.kind === "testsOwnDefinition")) parts.push(s.testsOwn)
  else if (page.notChecked.some((n) => n.kind === "noTests")) parts.push(s.noTests)
  else if (!page.running && page.notChecked.some((n) => n.kind === "noTestRecord")) parts.push(s.testsUnknown)
  if (page.end) parts.push(fillText(s.decided, { decision: decisionWords(page.end, t), date: when(page.end.at) }))
  else if (!page.running) parts.push(s.undecided)
  return parts.join(" ")
}

function request(page: VerificationPage, t: Texts): Line[] {
  const r = page.request
  if (!r.known) {
    const lines: Line[] = [{ text: page.older ? t.older : t.unknown, tone: "warn" }]
    if (r.issue) lines.unshift({ text: fillText(t.request.issue, { issue: r.issue }) })
    if (r.delegatedBy) lines.push({ text: fillText(t.request.delegatedBy, { who: whoWords(r.delegatedBy, t), date: when(r.delegatedAt) }) })
    return lines
  }
  const lines: Line[] = []
  lines.push(r.title.state === "text" ? { text: fillText(t.request.title, { title: r.title.text }) } : textLine(r.title, "title", t) ?? { text: t.unknown })
  if (r.issue) lines.push({ text: fillText(t.request.issue, { issue: r.issue }), tone: "muted" })
  if (r.description.state === "text") lines.push({ text: t.request.description, body: r.description.text })
  else lines.push(textLine(r.description, "description", t) ?? { text: t.request.noDescription, tone: "muted" })
  if (r.writtenBy) lines.push({ text: fillText(t.request.writtenBy, { who: whoWords(r.writtenBy, t), date: when(r.writtenAt) }) })
  if (r.importedFrom) lines.push({ text: fillText(t.request.imported, { source: r.importedFrom }) })
  if (r.delegatedBy) lines.push({ text: fillText(t.request.delegatedBy, { who: whoWords(r.delegatedBy, t), date: when(r.delegatedAt) }) })
  const origins = t.request.origin as Record<string, string>
  if (r.origin && origins[r.origin]) lines.push({ text: fillText(origins[r.origin], { run: r.originRun ?? "?" }) })
  if (r.accountable) lines.push({ text: fillText(t.request.accountable, { who: whoWords(r.accountable, t) }) })
  if (r.brief) {
    lines.push({
      text: fillText(t.request.brief, { chars: r.brief.chars ?? "?", digest: short(r.brief.sha256) }),
      tone: "muted",
      ...(r.brief.text.state === "text" ? { body: r.brief.text.text } : {}),
    })
    const missing = textLine(r.brief.text, "brief", t)
    if (missing) lines.push(missing)
  }
  return lines
}

function changed(page: VerificationPage, t: Texts): Line[] {
  const c = page.changes
  const lines: Line[] = []
  const count = c.files.length + c.more
  if (page.running) lines.push({ text: t.changed.noFilesYet, tone: "warn" })
  else if (!c.known) lines.push({ text: page.older ? t.changed.notTrackedOlder : t.changed.notTracked, tone: "warn" })
  else if (count === 0) lines.push({ text: t.changed.noFiles })
  else {
    const files = c.files.map((file): Line => {
      const size = file.added === null ? file.status : `${file.status}, +${file.added} −${file.removed ?? 0}`
      const written = file.writtenAt === null ? "" : `; ${fillText(t.changed.writtenAt, { seq: file.writtenAt })}`
      return { text: `“${file.path}” (${size})${written}`, tone: "muted" }
    })
    if (c.more > 0) files.push({ text: fillText(t.changed.more, { count: c.more }), tone: "muted" })
    lines.push({ text: fillText(count === 1 ? t.changed.oneFile : t.changed.files, { count, added: c.added, removed: c.removed }),
      list: { lines: files, fold: FOLD } })
  }
  if (c.status === "DONE") lines.push({ text: t.changed.finished, tone: "muted" })
  else if (c.status) lines.push({ text: fillText(t.changed.failed, { error: c.error ?? c.status }), tone: "warn" })
  if (c.summary.state === "text") lines.push({ text: t.changed.summary, tone: "agent", blocks: summaryBlocks(c.summary.text) })
  else {
    const missing = textLine(c.summary, "summary", t)
    if (missing) lines.push(missing)
  }
  if (c.branch) {
    lines.push({
      text: fillText(c.commits === 1 ? t.changed.branchOneCommit : t.changed.branch, { branch: c.branch, commits: c.commits ?? 0, head: short(c.head) }),
      tone: "muted",
    })
  }
  if (c.pullRequest) lines.push({ text: fillText(t.changed.pullRequest, { url: c.pullRequest }), link: c.pullRequest })
  return lines
}

/** Qui a écrit une règle, et dans quelle couche. */
function authorWords(rule: PageRule, t: Texts): string {
  const a = t.classification.author
  if (rule.author === "taskforce") return a.taskforce
  if (!rule.layer) return a.unknown
  return fillText(a.layer, { who: rule.author ? whoWords(rule.author, t) : a.unknown, layer: rule.layer })
}

function classification(page: VerificationPage, t: Texts): Line[] {
  const k = page.classOf
  const c = t.classification
  const lines: Line[] = [{ text: c.notComputed }]
  const tools = c.exitTools as Record<string, string>
  for (const exit of k.exits) {
    const action = (exit.tool && tools[exit.tool]) || fillText(c.exitOther, { tool: exit.tool ?? "?" })
    lines.push({ text: fillText(c.exit, { action, reason: exit.rule.reason ?? exit.rule.id,
      class: exit.rule.class ? c.classes[exit.rule.class] : "?" }) })
    lines.push({ text: fillText(c.exitWho, { id: exit.rule.id, version: exit.rule.version ?? "?", author: authorWords(exit.rule, t) }), tone: "muted" })
  }
  if (k.exits.length === 0 && k.judged > 0) lines.push({ text: c.noExit, tone: "muted" })
  if (k.heaviest) {
    const h = k.heaviest
    const action = h.what ? fillText(c.heaviestWhat, { tool: h.tool ?? "", what: h.what }).trim() : fillText(c.heaviestTool, { tool: h.tool ?? "?" })
    lines.push({ text: fillText(c.heaviest, { action, reason: h.rule.reason ?? h.rule.id, id: h.rule.id, class: c.classes[h.class] }) })
    if (h.rule.owner) lines.push({ text: fillText(c.owner, { owner: h.rule.owner }), tone: "muted" })
  }
  if (k.judged > 0) lines.push({ text: fillText(c.counts, { judged: k.judged, asked: k.asked, refused: k.refused }) })
  else lines.push({ text: c.noDecision, tone: "warn" })
  if (k.version !== null || k.digest) lines.push({ text: fillText(c.bundle, { version: k.version ?? "?", digest: short(k.digest) }), tone: "muted" })
  if (!k.rulesKnown) lines.push({ text: c.noRules, tone: "warn" })
  lines.push({ text: c.final, tone: "muted" })
  return lines
}

function checks(page: VerificationPage, t: Texts): Line[] {
  if (page.checks.length === 0) return [{ text: page.running ? t.checks.noneYet : t.checks.none, tone: "warn" }]
  const lines: Line[] = []
  for (const check of page.checks) {
    if (check.what === "tests") {
      lines.push({ text: fillText(t.checks.tests, { command: check.label, result: check.result === "passed" ? t.checks.passed : t.checks.failed }),
        tone: check.result === "passed" ? undefined : "warn" })
      if (check.passedCount !== null && check.total !== null) {
        lines.push({ text: fillText(t.checks.counts, { passed: check.passedCount, total: check.total }), tone: "muted" })
      }
      lines.push({ text: t.checks.byRunner, tone: "muted" })
      if (check.proof) lines.push({ text: fillText(t.checks.proof, { digest: short(check.proof) }), tone: "muted" })
    } else {
      lines.push({ text: fillText(t.checks.rules, { total: check.total ?? 0 }) })
      lines.push({ text: t.checks.byRules, tone: "muted" })
    }
  }
  return lines
}

function quoted(items: readonly string[]): string {
  return items.map((item) => `“${item}”`).join("; ")
}

function notCheckedLine(item: NotChecked, t: Texts): Line {
  const n = t.notChecked
  switch (item.kind) {
    case "noTests": return { text: n.noTests, tone: "warn" }
    case "testsNotRun": return { text: fillText(n.testsNotRun, { why: item.why ?? "" }), tone: "warn" }
    case "testsFailed": return { text: n.testsFailed, tone: "warn" }
    case "testsOwnDefinition": return { text: fillText(n.testsOwnDefinition, { paths: quoted(item.paths) }), tone: "warn" }
    case "noCode": return { text: n.noCode }
    case "noTestRecord": return { text: n.noTestRecord, tone: "warn" }
    case "noTestYet": return { text: n.noTestYet, tone: "warn" }
    case "testsStale": return { text: n.testsStale, tone: "warn" }
    case "declaredByAgent": return { text: fillText(n.declaredByAgent, { items: quoted(item.items) }), tone: "warn" }
    case "doneUnattributed": return { text: fillText(n.doneUnattributed, { items: quoted(item.items) }), tone: "warn" }
    case "openItems": return { text: fillText(n.openItems, { items: quoted(item.items) }), tone: "warn" }
    case "summary": return { text: n.summary }
    case "noReviewer": return { text: n.noReviewer }
    case "ciNotRead": return { text: n.ciNotRead }
    case "nothingChecked": return { text: n.nothingChecked, tone: "warn" }
  }
}

/** Ce qu'un accord a accordé, avec son objet d'abord (R161 F3) : la recherche, la commande telle que l'agent l'a écrite. */
function actionWords(d: PageDecision, t: Texts): string {
  const a = t.decisions.actions as Record<string, string>
  if (!d.action) return t.decisions.actions.unknown
  const tool = d.tool === "MultiEdit" ? "Edit" : d.tool
  return fillText((tool && a[tool]) || a.other, { what: d.action })
}

function decisionWords(d: PageDecision, t: Texts): string {
  const who = whoWords(d.who, t)
  if (d.kind === "expired") return fillText(t.decisions.expired, { action: actionWords(d, t) })
  if (d.kind === "erased") return fillText(t.decisions.erased, { what: kindWords(d.erased, t), who })
  if (d.kind === "gesture") {
    const gestures = t.decisions.gestures as Record<string, string>
    return fillText(gestures[d.decision] ?? d.decision, { who: d.decision === "MERGE" && d.who?.kind !== "named" ? t.people.github : who })
  }
  const approvals = t.decisions.approval as Record<string, string>
  return fillText(approvals[d.decision] ?? d.decision, { who, action: actionWords(d, t) })
}

function decisions(page: VerificationPage, t: Texts): Line[] {
  const lines: Line[] = []
  const where = t.decisions.where as Record<string, string>
  for (const d of page.decisions) {
    lines.push({ text: fillText(t.decisions.at, { what: decisionWords(d, t), date: when(d.at), where: where[d.where ?? "taskforce"] ?? d.where ?? "" }) })
    if (d.kind === "approval" || d.kind === "signature" || d.kind === "expired") {
      if (d.rule?.reason) lines.push({ text: fillText(t.decisions.rule, { reason: d.rule.reason, id: d.rule.id }), tone: "muted" })
      else if (d.ruleId) lines.push({ text: fillText(t.decisions.ruleId, { id: d.ruleId }), tone: "muted" })
      if (d.input) lines.push({ text: fillText(t.decisions.exact, { input: short(d.input) }), tone: "muted" })
      if (d.written) lines.push({ text: fillText(t.decisions.written, { written: short(d.written) }), tone: "muted" })
      const scopes = t.decisions.scope as Record<string, string>
      if (d.scope && scopes[d.scope]) lines.push({ text: scopes[d.scope], tone: "muted" })
    }
    if (d.kind !== "expired") {
      lines.push(d.reason ? { text: fillText(t.decisions.reason, { reason: d.reason }), tone: "muted" } : { text: t.decisions.noReason, tone: "muted" })
    }
  }
  lines.unshift(page.end ? { text: fillText(t.decisions.final, { decision: decisionWords(page.end, t) }) }
    : { text: t.decisions.undecided, tone: page.running ? "muted" : "warn" })
  if (page.decisions.every((d) => d.kind !== "approval" && d.kind !== "signature" && d.kind !== "expired")) {
    lines.splice(1, 0, { text: t.decisions.none, tone: "muted" })
  }
  return lines
}

function model(page: VerificationPage, t: Texts): Line[] {
  const m = page.model
  const lines: Line[] = []
  const agents = t.agents as Record<string, string>
  const agent = m.agent ? (agents[m.agent] ?? m.agent) : null
  if (!m.known || !m.model) lines.push({ text: page.older ? t.older : t.model.unknown, tone: "warn" })
  else lines.push({ text: fillText(t.model.ran, { model: m.model }) })
  if (!agent) lines.push({ text: t.model.agentUnknown, tone: "warn" })
  else lines.push({ text: m.agentVersion ? fillText(t.model.agent, { agent, version: m.agentVersion }) : fillText(t.model.agentNoVersion, { agent }) })
  if (m.chosen) lines.push({ text: fillText(t.model.chosen, { model: m.chosen }), tone: "muted" })
  if (m.configured) lines.push({ text: fillText(t.model.configured, { model: m.configured }), tone: "muted" })
  if (m.served.length > 0) lines.push({ text: fillText(t.model.served, { models: m.served.join(", ") }), tone: "muted" })
  if (m.known && m.model) {
    const providers = t.providers as Record<string, string>
    const provider = m.provider ? providers[m.provider] : undefined
    lines.push({ text: provider ? fillText(t.model.provider, { provider }) : m.provider === "another-endpoint" ? t.model.providerOther : t.model.providerUnknown })
    lines.push({ text: m.fingerprint ? fillText(t.model.fingerprint, { fingerprint: m.fingerprint }) : t.model.noFingerprint, tone: "muted" })
  }
  if (m.session) lines.push({ text: fillText(t.model.session, { digest: short(m.session.sha256) }), tone: "muted" })
  return lines
}

function record(page: VerificationPage, t: Texts, context: WordsContext): Line[] {
  const r = page.record
  const rec = t.record
  const lines: Line[] = [{ text: fillText(rec.head, { events: r.events, root: short(r.root) }) }]
  for (const gap of r.gaps) {
    lines.push({ text: gap.to === null ? fillText(rec.gapLost, { from: gap.from, noted: gap.noted })
      : fillText(gap.from === gap.to ? rec.gapOne : rec.gap, { from: gap.from, to: gap.to, noted: gap.noted }), tone: "warn" })
  }
  if (r.seal) {
    // La garde de la clé d'abord : « scellé » n'est pas une garantie quand l'agent pouvait lire la clé (R161 M5).
    lines.push({ text: rec.custody[r.seal.custody], tone: r.seal.custody === "same-machine" ? "warn" : "muted" })
    lines.push({ text: fillText(rec.sealedAt, { seq: r.seal.seq, date: when(r.seal.sealedAt), key: short(r.seal.keyId) }), tone: "muted" })
    if (!r.seal.coversAll) lines.push({ text: fillText(rec.notAll, { from: r.seal.seq + 1, to: r.events }), tone: "warn" })
    if (!r.seal.kept) lines.push({ text: rec.notKept, tone: "warn" })
  }
  if (r.witness?.written) {
    const url = r.witness.url ?? ""
    lines.push({ text: fillText(rec.witness, { seq: r.witness.seq ?? "?", root: short(r.witness.root), url }), ...(linkable(url) ? { link: url } : {}) })
    if (r.witness.seq !== null && r.witness.seq < r.events) lines.push({ text: fillText(rec.witnessLater, { seq: r.witness.seq }), tone: "muted" })
  } else if (r.witness) {
    lines.push({ text: fillText(rec.noWitness, { reason: r.witness.reason ?? "" }), tone: "warn" })
  } else {
    lines.push({ text: page.running ? rec.noWitnessYet : r.pullRequest ? rec.noWitnessPr : rec.noPullRequest, tone: "warn" })
  }
  // La consigne de vérification : le bon fichier, et `--key` seulement quand la clé peut se publier (R161 M6).
  const id = page.mission.id ?? context.runId
  const publishable = r.seal !== null && r.seal.kept && !context.desktop && r.seal.keyId !== null
  lines.push({ text: rec.verifyIntro, tone: "muted" })
  lines.push({ text: publishable ? fillText(rec.verifyJson, { id, key: r.seal?.keyId ?? "" }) : fillText(rec.verifyNoKey, { id }), tone: "muted" })
  if (!publishable && r.seal) lines.push({ text: rec.verifyNoKeyMeans, tone: "muted" })
  lines.push({ text: rec.verifyOpenSsl, tone: "muted" })
  return lines
}

/** Les rubriques de la page, dans l'ordre de R212, puis ce que vaut le dossier. */
export function verificationSections(page: VerificationPage, t: Texts, context: WordsContext): Section[] {
  const notChecked: Line[] = page.notChecked.length === 0 ? [{ text: t.notChecked.none, tone: "muted" }]
    : page.notChecked.map((item) => notCheckedLine(item, t))
  return [
    { id: "request", title: t.sections.request, lines: request(page, t) },
    { id: "changed", title: t.sections.changed, lines: changed(page, t) },
    { id: "classification", title: t.sections.classification, lines: classification(page, t) },
    { id: "checks", title: t.sections.checks, lines: checks(page, t) },
    { id: "notChecked", title: t.sections.notChecked, lines: notChecked },
    { id: "decisions", title: t.sections.decisions, lines: decisions(page, t) },
    { id: "model", title: t.sections.model, lines: model(page, t) },
    { id: "record", title: t.sections.record, lines: record(page, t, context) },
  ]
}

/** Le titre de la page : l'issue et le titre de la demande (R161 F4). */
export function pageTitle(page: VerificationPage, t: Texts): string {
  const issue = page.mission.issue
  if (!issue) return t.title
  return page.request.title.state === "text" ? fillText(t.titleOfRequest, { issue, title: page.request.title.text }) : fillText(t.titleOf, { issue })
}
