import type { CONSTANTS_EN } from "@/lib/constants_en"
import { fillText } from "@/lib/delivery/result-card"
import { parseServerDate } from "@/lib/utils/server-date"

import type { DossierText, NotChecked, PageDecision, VerificationPage } from "./verification"

/**
 * Les mots de la page de vérification (R212), tirés de son modèle ({@link VerificationPage}) : une suite de rubriques,
 * chacune une suite de lignes. L'écran et la page exportée les montrent tels quels : les mêmes mots partout, et aucun
 * n'est de l'agent, sauf son résumé, marqué `agent`.
 */
type Texts = typeof CONSTANTS_EN.verification

export type SectionId = "request" | "changed" | "classification" | "checks" | "notChecked" | "decisions" | "model" | "record"

export interface Line {
  readonly text: string
  /** `agent` : les mots de l'agent ; `warn` : ce que le dossier ne prouve pas ; `muted` : un détail. */
  readonly tone?: "agent" | "warn" | "muted"
  /** Un long texte du dossier, montré à part : la description, le brief, le résumé. */
  readonly body?: string
  /** Une adresse que la ligne nomme : la pull request, le témoin. */
  readonly link?: string
}

export interface Section {
  readonly id: SectionId
  readonly title: string
  readonly lines: readonly Line[]
}

/** Une date du dossier, dite pour une personne, en UTC pour qu'un auditeur la relise telle quelle. */
export function when(at: string | null): string {
  if (!at) return "?"
  const date = parseServerDate(at)
  if (Number.isNaN(date.getTime())) return at
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`
}

/** Une empreinte, courte à l'écran ; le dossier la garde entière. */
export function short(digest: string | null): string {
  return digest ? `${digest.slice(0, 19)}...` : "?"
}

function textLine(text: DossierText, t: Texts): Line | null {
  if (text.state === "erased") return { text: t.erased, tone: "warn" }
  if (text.state === "missing") return { text: t.missing, tone: "warn" }
  return null
}

function request(page: VerificationPage, t: Texts): Line[] {
  const r = page.request
  if (!r.known) {
    const lines: Line[] = [{ text: t.unknown, tone: "warn" }]
    if (r.issue) lines.unshift({ text: fillText(t.request.issue, { issue: r.issue }) })
    if (r.delegatedBy) lines.push({ text: fillText(t.request.delegatedBy, { who: r.delegatedBy, date: when(r.delegatedAt) }) })
    return lines
  }
  const lines: Line[] = []
  if (r.issue) lines.push({ text: fillText(t.request.issue, { issue: r.issue }) })
  lines.push(r.title.state === "text" ? { text: fillText(t.request.title, { title: r.title.text }) } : textLine(r.title, t) ?? { text: t.unknown })
  if (r.description.state === "text") lines.push({ text: t.request.description, body: r.description.text })
  else lines.push(textLine(r.description, t) ?? { text: t.request.noDescription, tone: "muted" })
  if (r.writtenBy) lines.push({ text: fillText(t.request.writtenBy, { who: r.writtenBy, date: when(r.writtenAt) }) })
  if (r.importedFrom) lines.push({ text: fillText(t.request.imported, { source: r.importedFrom }) })
  if (r.delegatedBy) lines.push({ text: fillText(t.request.delegatedBy, { who: r.delegatedBy, date: when(r.delegatedAt) }) })
  const origins = t.request.origin as Record<string, string>
  if (r.origin && origins[r.origin]) lines.push({ text: fillText(origins[r.origin], { run: r.originRun ?? "?" }) })
  if (r.accountable) lines.push({ text: fillText(t.request.accountable, { who: r.accountable }) })
  if (r.brief) {
    lines.push({
      text: fillText(t.request.brief, { chars: r.brief.chars ?? "?", digest: short(r.brief.sha256) }),
      tone: "muted",
      ...(r.brief.text.state === "text" ? { body: r.brief.text.text } : {}),
    })
    const missing = textLine(r.brief.text, t)
    if (missing) lines.push(missing)
  }
  return lines
}

function changed(page: VerificationPage, t: Texts): Line[] {
  const c = page.changes
  const lines: Line[] = []
  if (c.status === "DONE") lines.push({ text: t.changed.finished })
  else if (c.status) lines.push({ text: fillText(t.changed.failed, { error: c.error ?? c.status }), tone: "warn" })
  if (c.summary.state === "text") lines.push({ text: t.changed.summary, tone: "agent", body: c.summary.text })
  else {
    const missing = textLine(c.summary, t)
    if (missing) lines.push(missing)
  }
  if (!c.known) {
    lines.push({ text: t.changed.notTracked, tone: "warn" })
  } else if (c.files.length === 0) {
    lines.push({ text: t.changed.noFiles })
  } else {
    const count = c.files.length + c.more
    lines.push({ text: fillText(count === 1 ? t.changed.oneFile : t.changed.files, { count, added: c.added, removed: c.removed }) })
    for (const file of c.files) {
      const size = file.added === null ? file.status : `${file.status}, +${file.added} -${file.removed ?? 0}`
      const written = file.writtenAt === null ? "" : `; ${fillText(t.changed.writtenAt, { seq: file.writtenAt })}`
      lines.push({ text: `${file.path} (${size})${file.sha256 ? `, ${short(file.sha256)}` : ""}${written}`, tone: "muted" })
    }
    if (c.more > 0) lines.push({ text: fillText(t.changed.more, { count: c.more }), tone: "muted" })
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

function classification(page: VerificationPage, t: Texts): Line[] {
  const k = page.classOf
  const lines: Line[] = []
  if (k.class) lines.push({ text: fillText(t.classification.heaviest, { class: t.classification.classes[k.class] }) })
  else if (k.judged > 0) lines.push({ text: t.classification.none, tone: "muted" })
  if (k.rule) {
    lines.push({ text: fillText(t.classification.rule, { rule: k.rule.id, reason: k.rule.reason ?? "" }) })
    lines.push({
      text: k.rule.layer
        ? fillText(t.classification.layer, { author: k.rule.author ?? t.classification.unknownAuthor, layer: k.rule.layer,
          version: k.rule.version ?? "?", owner: k.rule.owner ?? "?" })
        : fillText(t.classification.table, { version: k.rule.version ?? "?", owner: k.rule.owner ?? "?" }),
      tone: "muted",
    })
  }
  if (k.judged > 0) lines.push({ text: fillText(t.classification.counts, { judged: k.judged, asked: k.asked, refused: k.refused }) })
  else lines.push({ text: t.classification.noDecision, tone: "warn" })
  if (k.version !== null || k.digest) {
    lines.push({ text: fillText(t.classification.bundle, { version: k.version ?? "?", digest: short(k.digest) }), tone: "muted" })
  }
  if (!k.rulesKnown) lines.push({ text: t.classification.noRules, tone: "warn" })
  lines.push({ text: t.classification.final, tone: "muted" })
  return lines
}

function checks(page: VerificationPage, t: Texts): Line[] {
  if (page.checks.length === 0) return [{ text: t.checks.none, tone: "warn" }]
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
    } else if (check.what === "rules") {
      lines.push({ text: fillText(t.checks.rules, { total: check.total ?? 0 }) })
      lines.push({ text: t.checks.byRules, tone: "muted" })
    } else {
      lines.push({ text: fillText(t.checks.done, { item: check.label }), tone: check.by === "declared" ? "warn" : undefined })
      lines.push({ text: check.by === "declared" ? t.checks.declared : t.checks.person, tone: "muted" })
    }
  }
  return lines
}

function notCheckedLine(item: NotChecked, t: Texts): Line {
  const n = t.notChecked
  switch (item.kind) {
    case "noTests": return { text: n.noTests, tone: "warn" }
    case "testsNotRun": return { text: fillText(n.testsNotRun, { why: item.why ?? "" }), tone: "warn" }
    case "testsFailed": return { text: n.testsFailed, tone: "warn" }
    case "noCode": return { text: n.noCode }
    case "noTestRecord": return { text: n.noTestRecord, tone: "warn" }
    case "testsStale": return { text: n.testsStale, tone: "warn" }
    case "declaredByAgent": return { text: fillText(n.declaredByAgent, { items: item.items.join("; ") }), tone: "warn" }
    case "openItems": return { text: fillText(n.openItems, { items: item.items.join("; ") }), tone: "warn" }
    case "summary": return { text: n.summary }
    case "noReviewer": return { text: n.noReviewer }
    case "ciNotRead": return { text: n.ciNotRead }
  }
}

function decisionWords(d: PageDecision, t: Texts): string {
  const who = d.who ?? t.decisions.someone
  if (d.kind === "expired") return t.decisions.expired
  if (d.kind === "erased") return fillText(t.decisions.erased, { who })
  if (d.kind === "gesture") {
    const gestures = t.decisions.gestures as Record<string, string>
    return fillText(gestures[d.decision] ?? d.decision, { who })
  }
  const approvals = t.decisions.approval as Record<string, string>
  return fillText(approvals[d.decision] ?? d.decision, { who })
}

function decisions(page: VerificationPage, t: Texts): Line[] {
  const lines: Line[] = []
  const where = t.decisions.where as Record<string, string>
  for (const d of page.decisions) {
    lines.push({ text: fillText(t.decisions.at, { what: decisionWords(d, t), date: when(d.at), where: where[d.where ?? "taskforce"] ?? d.where ?? "" }) })
    if (d.kind === "approval" || d.kind === "signature" || d.kind === "expired") {
      if (d.action) lines.push({ text: fillText(t.decisions.action, { action: d.action, rule: d.rule ?? "?" }), tone: "muted" })
      if (d.input) lines.push({ text: fillText(t.decisions.exact, { input: short(d.input) }), tone: "muted" })
      if (d.written) lines.push({ text: fillText(t.decisions.written, { written: short(d.written) }), tone: "muted" })
      const scopes = t.decisions.scope as Record<string, string>
      if (d.scope && scopes[d.scope]) lines.push({ text: scopes[d.scope], tone: "muted" })
    }
    if (d.kind !== "expired") {
      lines.push(d.reason ? { text: fillText(t.decisions.reason, { reason: d.reason }), tone: "muted" } : { text: t.decisions.noReason, tone: "muted" })
    }
  }
  if (page.decisions.every((d) => d.kind !== "approval" && d.kind !== "signature" && d.kind !== "expired")) {
    lines.unshift({ text: t.decisions.none, tone: "muted" })
  }
  lines.push(page.end ? { text: fillText(t.decisions.final, { decision: decisionWords(page.end, t) }) } : { text: t.decisions.undecided, tone: "warn" })
  return lines
}

function model(page: VerificationPage, t: Texts): Line[] {
  const m = page.model
  const lines: Line[] = []
  const agent = m.agent ?? "?"
  lines.push({ text: m.agentVersion ? fillText(t.model.agent, { agent, version: m.agentVersion }) : fillText(t.model.agentNoVersion, { agent }) })
  if (m.chosen) lines.push({ text: fillText(t.model.chosen, { model: m.chosen }), tone: "muted" })
  if (!m.known || !m.model) {
    lines.push({ text: t.model.unknown, tone: "warn" })
  } else {
    lines.push({ text: fillText(t.model.ran, { model: m.model }) })
    lines.push({ text: m.local === true ? t.model.local : m.local === false ? fillText(t.model.remote, { provider: m.provider ?? "?" }) : t.model.unknownWhere })
    lines.push({ text: m.fingerprint ? fillText(t.model.fingerprint, { fingerprint: m.fingerprint }) : t.model.noFingerprint, tone: "muted" })
  }
  if (m.session) lines.push({ text: fillText(t.model.session, { digest: short(m.session.sha256) }), tone: "muted" })
  return lines
}

function record(page: VerificationPage, t: Texts): Line[] {
  const r = page.record
  const lines: Line[] = [{ text: fillText(t.record.chain, { events: r.events, root: short(r.root) }) }]
  if (!r.headerFromChain) lines.push({ text: t.record.older, tone: "warn" })
  for (const gap of r.gaps) {
    lines.push({ text: fillText(gap.from === gap.to ? t.record.gapOne : t.record.gap, { from: gap.from, to: gap.to }), tone: "warn" })
  }
  if (!r.seal) {
    lines.push({ text: t.record.notSealed, tone: "warn" })
  } else {
    lines.push({ text: fillText(t.record.sealed, { seq: r.seal.seq, date: when(r.seal.sealedAt), key: short(r.seal.keyId) }) })
    if (!r.seal.coversAll) lines.push({ text: fillText(t.record.notAll, { seq: r.seal.seq }), tone: "warn" })
    lines.push({ text: t.record.custody[r.seal.custody], tone: r.seal.custody === "same-machine" ? "warn" : "muted" })
    if (!r.seal.kept) lines.push({ text: t.record.notKept, tone: "warn" })
  }
  if (r.witness?.written) {
    lines.push({ text: fillText(t.record.witness, { root: short(r.witness.root), url: r.witness.url ?? "" }), link: r.witness.url ?? undefined })
  } else if (r.witness) {
    lines.push({ text: fillText(t.record.noWitness, { reason: r.witness.reason ?? "" }), tone: "warn" })
  } else {
    lines.push({ text: r.pullRequest ? t.record.noWitnessPr : t.record.noPullRequest, tone: "warn" })
  }
  lines.push({ text: fillText(t.record.verify, { id: page.mission.id ?? "N" }), tone: "muted" })
  return lines
}

/** Les rubriques de la page, dans l'ordre de R212, puis ce que vaut le dossier. */
export function verificationSections(page: VerificationPage, t: Texts): Section[] {
  const notChecked = page.notChecked.length === 0 ? [{ text: t.notChecked.none, tone: "muted" as const }]
    : page.notChecked.map((item) => notCheckedLine(item, t))
  return [
    { id: "request", title: t.sections.request, lines: request(page, t) },
    { id: "changed", title: t.sections.changed, lines: changed(page, t) },
    { id: "classification", title: t.sections.classification, lines: classification(page, t) },
    { id: "checks", title: t.sections.checks, lines: checks(page, t) },
    { id: "notChecked", title: t.sections.notChecked, lines: notChecked },
    { id: "decisions", title: t.sections.decisions, lines: decisions(page, t) },
    { id: "model", title: t.sections.model, lines: model(page, t) },
    { id: "record", title: t.sections.record, lines: record(page, t) },
  ]
}
