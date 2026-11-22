import type { MissionEvidence, MissionEvidenceEvent } from "@/lib/api/delivery-service"

/**
 * La page de vérification d'une mission (R212, séance n°30), assemblée par du code depuis son dossier exporté
 * (`taskforce-evidence/1`), et depuis lui seul : jamais par l'agent, jamais à la main. Sept rubriques : la demande, ce qui
 * a changé, la classe du changement, les vérifications, ce qui n'a pas été vérifié, les décisions, le modèle ; puis ce que
 * vaut le dossier lui-même. Une rubrique que le dossier ne sait pas remplir le dit (`known: false`, un texte « absent »).
 * Le seul texte de l'agent est son résumé, et il est marqué comme tel. Rien ici ne dit qu'un changement est conforme à
 * quoi que ce soit (R187) : la page dit ce qui a été demandé, jugé, vérifié, décidé.
 */

/** Un texte du dossier, gardé à côté de la chaîne : là, effacé (son empreinte reste), absent de l'export, ou inexistant. */
export type DossierText =
  | { readonly state: "text"; readonly text: string }
  | { readonly state: "erased" }
  | { readonly state: "missing" }
  | { readonly state: "none" }

/** La classe d'une action, telle qu'une règle la donne (contracts/rules), de la plus légère à la plus lourde. */
export type ChangeClass = "read" | "sandbox-write" | "reversible-exit" | "irreversible"
const CLASSES: readonly ChangeClass[] = ["read", "sandbox-write", "reversible-exit", "irreversible"]

/** 1. La demande : qui a demandé quoi, quand, d'où, et la personne qui répond de la mission. */
export interface PageRequest {
  readonly known: boolean
  readonly issue: string | null
  readonly title: DossierText
  readonly description: DossierText
  /** Qui a écrit la demande (l'issue), et quand. */
  readonly writtenBy: string | null
  readonly writtenAt: string | null
  /** Qui l'a confiée à l'agent, quand, et d'où. */
  readonly delegatedBy: string | null
  readonly delegatedAt: string | null
  readonly origin: string | null
  readonly originRun: number | null
  readonly importedFrom: string | null
  /** La personne qui répond de la mission : elle seule tranche son résultat. */
  readonly accountable: string | null
  /** Le brief tel qu'il est parti à l'agent. */
  readonly brief: { readonly text: DossierText; readonly chars: number | null; readonly sha256: string | null } | null
}

/** Un fichier de la mission, tel qu'il reste, et l'écriture jugée par les règles qui a laissé ce contenu. */
export interface PageFile {
  readonly path: string
  readonly status: string
  readonly added: number | null
  readonly removed: number | null
  readonly sha256: string | null
  /** Le rang de la décision des règles dont l'écriture a laissé ce contenu, quand on la retrouve. */
  readonly writtenAt: number | null
}

/** 2. Ce qui a changé : le résumé de l'agent (son seul texte), les fichiers, la taille. */
export interface PageChanges {
  readonly status: string | null
  readonly error: string | null
  readonly summary: DossierText
  readonly known: boolean
  readonly files: readonly PageFile[]
  readonly more: number
  readonly added: number
  readonly removed: number
  readonly branch: string | null
  readonly commits: number | null
  readonly head: string | null
  readonly pullRequest: string | null
}

/** Une règle du paquet de la mission, et qui l'a écrite. */
export interface PageRule {
  readonly id: string
  readonly class: ChangeClass | null
  readonly reason: string | null
  /** La couche de l'entreprise d'où elle vient ; nulle pour la table de TaskForce. */
  readonly layer: string | null
  /** Qui a écrit sa version : l'auteur de la couche ; pour la table de TaskForce, TaskForce. */
  readonly author: string | null
  /** La personne nommée qui répond de la règle. */
  readonly owner: string | null
  readonly version: number | null
}

/** 3. La classe du changement : la plus lourde des actions faites, la règle qui l'a donnée, le paquet. */
export interface PageClass {
  readonly class: ChangeClass | null
  readonly rule: PageRule | null
  readonly rulesKnown: boolean
  readonly version: number | null
  readonly digest: string | null
  readonly judged: number
  readonly asked: number
  readonly refused: number
}

/** Une vérification : ce qui a été vérifié, son résultat, qui ou quoi l'a vérifié, l'empreinte de sa preuve. */
export interface PageCheck {
  readonly what: "tests" | "rules" | "checklist"
  readonly label: string
  readonly result: "passed" | "failed" | "done" | "judged"
  /** `declared` : l'agent le dit, personne ne l'a vérifié (point 8 de la séance n°30). */
  readonly by: "runner" | "rules" | "person" | "declared"
  readonly proof: string | null
  readonly passedCount: number | null
  readonly total: number | null
}

/** 5. Ce qui n'a pas été vérifié, dit en clair. */
export type NotChecked =
  | { readonly kind: "noTests" }
  | { readonly kind: "testsNotRun"; readonly why: string | null }
  | { readonly kind: "testsFailed" }
  | { readonly kind: "noCode" }
  | { readonly kind: "noTestRecord" }
  | { readonly kind: "testsStale" }
  | { readonly kind: "declaredByAgent"; readonly items: readonly string[] }
  | { readonly kind: "openItems"; readonly items: readonly string[] }
  | { readonly kind: "summary" }
  | { readonly kind: "noReviewer" }
  | { readonly kind: "ciNotRead" }

/** Une décision d'une personne, ou de ce qui en tient lieu (une demande échue, la fusion sur GitHub). */
export interface PageDecision {
  readonly seq: number
  readonly at: string
  readonly kind: "approval" | "signature" | "expired" | "gesture" | "erased"
  readonly decision: string
  readonly who: string | null
  readonly where: string | null
  readonly reason: string | null
  /** Pour un accord : ce qui était demandé, la règle, et l'action exacte (l'empreinte de l'entrée, du contenu écrit). */
  readonly action: string | null
  readonly rule: string | null
  readonly input: string | null
  readonly written: string | null
  readonly scope: string | null
}

/** 7. Le modèle : lequel a réellement tourné, sa version, local ou non. */
export interface PageModel {
  readonly known: boolean
  readonly agent: string | null
  readonly agentVersion: string | null
  readonly chosen: string | null
  readonly model: string | null
  readonly provider: string | null
  /** Vrai : sur la machine ; faux : chez un fournisseur ; nul : on ne sait pas. */
  readonly local: boolean | null
  readonly fingerprint: string | null
  readonly session: { readonly sha256: string; readonly bytes: number | null } | null
}

/** Ce que vaut le dossier lui-même : sa tête, son sceau, la garde de la clé, son témoin, ses trous. */
export interface PageRecord {
  readonly events: number
  readonly root: string
  readonly headerFromChain: boolean
  readonly seal: {
    readonly seq: number
    readonly sealedAt: string | null
    readonly keyId: string | null
    readonly custody: "same-machine" | "separate-machine"
    readonly kept: boolean
    readonly coversAll: boolean
  } | null
  readonly witness: { readonly written: boolean; readonly root: string | null; readonly seq: number | null; readonly url: string | null; readonly reason: string | null } | null
  readonly pullRequest: boolean
  readonly gaps: ReadonlyArray<{ readonly from: number; readonly to: number }>
}

export interface VerificationPage {
  readonly mission: { readonly id: number | null; readonly workspace: string | null; readonly issue: string | null }
  readonly request: PageRequest
  readonly changes: PageChanges
  readonly classOf: PageClass
  readonly checks: readonly PageCheck[]
  readonly notChecked: readonly NotChecked[]
  readonly decisions: readonly PageDecision[]
  /** La décision de fin : la dernière sur le résultat ; nulle tant que personne n'a tranché. */
  readonly end: PageDecision | null
  readonly model: PageModel
  readonly record: PageRecord
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => v !== null && typeof v === "object" && !Array.isArray(v)
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null)
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null)
const data = (e: MissionEvidenceEvent): Obj => (isObj(e.data) ? e.data : {})

/** Les gestes de la personne sur le résultat : la décision de fin est le dernier d'entre eux. */
const END_GESTURES = new Set(["APPLY", "DISCARD", "RETRY", "MARK_DONE", "MERGE", "STOP"])
const GESTURES = new Set([...END_GESTURES, "ASK_FOR_CHANGES", "REVERT_FILE", "CORRECTION"])

/** Le dossier exporté tel que la page le lit : les champs de `taskforce-evidence/1`. */
export type DossierFile = MissionEvidence

/** Le texte d'une référence de la chaîne (`{ sha256, chars }`), pris à côté ; effacé quand la chaîne le dit. */
function textOf(ref: unknown, texts: Record<string, string>, erased: ReadonlySet<string>): DossierText {
  if (!isObj(ref) || typeof ref.sha256 !== "string") return { state: "none" }
  const text = texts[ref.sha256]
  if (typeof text === "string") return { state: "text", text }
  return erased.has(ref.sha256) ? { state: "erased" } : { state: "missing" }
}

function classOf(value: unknown): ChangeClass | null {
  return typeof value === "string" && (CLASSES as readonly string[]).includes(value) ? (value as ChangeClass) : null
}

/** Le paquet de règles du dossier, par identifiant. */
function rulesById(rules: Obj | undefined): Map<string, Obj> {
  const out = new Map<string, Obj>()
  const list = rules && Array.isArray(rules.rules) ? rules.rules : []
  for (const rule of list) if (isObj(rule) && typeof rule.id === "string") out.set(rule.id, rule)
  return out
}

/** Le contenu du statement du sceau (une enveloppe DSSE), sans vérifier la signature : le vérificateur du runner le fait. */
function sealStatement(seal: Obj | undefined): Obj | null {
  if (!seal || typeof seal.payload !== "string") return null
  try {
    const decoded = typeof atob === "function" ? atob(seal.payload) : Buffer.from(seal.payload, "base64").toString("binary")
    const bytes = Uint8Array.from(decoded, (c) => c.charCodeAt(0))
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes))
    return isObj(parsed) && isObj(parsed.predicate) ? parsed.predicate : null
  } catch {
    return null
  }
}

/** Assemble la page depuis le dossier exporté, et lui seul. */
export function verificationPage(file: DossierFile): VerificationPage {
  const events = file.events ?? []
  const texts = file.texts ?? {}
  const erased = new Set<string>()
  for (const e of events) {
    const d = data(e)
    if (e.type === "human.decision" && d.kind === "erased" && typeof d.text === "string") erased.add(d.text)
  }
  const started = events.find((e) => e.type === "mission.started")
  const s = started ? data(started) : {}
  const notes = (kind: string) => events.filter((e) => e.type === "note" && data(e).kind === kind)
  const ended = [...events].reverse().find((e) => e.type === "mission.ended")
  const end = ended ? data(ended) : {}
  const header = isObj(file.mission) ? file.mission : {}

  // 1. La demande.
  const request = isObj(s.request) ? s.request : null
  const origin = isObj(s.origin) ? s.origin : {}
  const briefNote = notes("brief").at(-1)
  const brief = briefNote ? data(briefNote).brief : null
  const pageRequest: PageRequest = {
    known: request !== null,
    issue: str(s.issue) ?? str(header.issue),
    title: request ? textOf(request.title, texts, erased) : { state: "none" },
    description: request ? textOf(request.description, texts, erased) : { state: "none" },
    writtenBy: request ? str(request.reporter) : null,
    writtenAt: request ? str(request.createdAt) : null,
    delegatedBy: str(s.requestedBy) ?? str(header.requestedBy),
    delegatedAt: str(s.delegatedAt) ?? started?.at ?? null,
    origin: str(origin.channel),
    originRun: num(origin.run),
    importedFrom: request ? str(request.importedFrom) : null,
    accountable: str(s.accountable),
    brief: isObj(brief)
      ? { text: textOf(brief, texts, erased), chars: num(brief.chars), sha256: str(brief.sha256) }
      : null,
  }

  // 2. Ce qui a changé, et l'écriture jugée par les règles qui a laissé chaque contenu.
  const writes = new Map<string, number>()
  for (const e of events) {
    const d = data(e)
    const written = isObj(d.written) ? d.written : null
    if (e.type === "action.decided" && d.kind === "decision" && d.effect === "allow" && written && typeof written.sha256 === "string") {
      writes.set(written.sha256, e.seq)
    }
  }
  const snapshot = notes("changes").at(-1)
  const snap = snapshot ? data(snapshot) : {}
  const runnerNote = notes("runner").at(-1)
  const runner = runnerNote ? data(runnerNote) : {}
  const files: PageFile[] = Array.isArray(snap.files) ? snap.files.filter(isObj).map((f) => ({
    path: String(f.path ?? ""),
    status: String(f.status ?? "modified"),
    added: num(f.added),
    removed: num(f.removed),
    sha256: str(f.sha256),
    writtenAt: typeof f.sha256 === "string" ? (writes.get(f.sha256) ?? null) : null,
  })) : []
  const resultUrl = str(end.resultUrl)
  const pullRequest = resultUrl && /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+/.test(resultUrl) ? resultUrl : null
  const changes: PageChanges = {
    status: str(end.status),
    error: str(end.error),
    summary: textOf(end.summary, texts, erased),
    known: snapshot !== undefined,
    files,
    more: num(snap.more) ?? 0,
    added: num(snap.added) ?? 0,
    removed: num(snap.removed) ?? 0,
    branch: str(end.branch),
    commits: num(end.commits),
    head: str(runner.head),
    pullRequest,
  }

  // 3. La classe du changement : la plus lourde des actions qui ont eu lieu, et la règle qui l'a donnée.
  const bundle = rulesById(file.rules)
  const rulesStarted = isObj(s.rules) ? s.rules : {}
  const layers = Array.isArray(rulesStarted.layers) ? rulesStarted.layers.filter(isObj) : []
  const ruleOf = (id: string): PageRule | null => {
    const rule = bundle.get(id)
    if (!rule) return null
    const layer = str(rule.layer)
    const ofLayer = layer ? layers.find((l) => l.scope === layer) : undefined
    return {
      id,
      class: classOf(rule.class),
      reason: str(rule.text) ?? str(rule.reason),
      layer,
      author: layer ? (ofLayer ? str(ofLayer.author) : null) : "TaskForce",
      owner: str(rule.owner),
      version: layer ? (ofLayer ? num(ofLayer.version) : null) : num(rulesStarted.version),
    }
  }
  const approved = new Set<string>()
  for (const e of events) {
    const d = data(e)
    if (e.type === "human.decision" && d.decision === "ALLOWED" && typeof d.rule === "string") approved.add(d.rule)
  }
  const top: { value: { class: ChangeClass; rule: string } | null } = { value: null }
  let judged = 0
  let asked = 0
  let refused = 0
  const weigh = (ruleId: string | null): void => {
    const rule = ruleId ? bundle.get(ruleId) : undefined
    const c = classOf(rule?.class)
    if (!c || !ruleId) return
    if (!top.value || CLASSES.indexOf(c) > CLASSES.indexOf(top.value.class)) top.value = { class: c, rule: ruleId }
  }
  for (const e of events) {
    const d = data(e)
    if (e.type === "action.decided" && d.kind === "decision") {
      judged++
      if (d.effect === "ask") asked++
      if (d.effect === "deny") refused++
      if (d.effect === "allow" && e.actor.kind === "rule") weigh(e.actor.id)
      if (d.effect === "ask" && e.actor.kind === "rule" && approved.has(e.actor.id)) weigh(e.actor.id)
    }
    if (e.type === "exit.result" && d.effect === "allow") weigh(str(d.rule))
  }
  const heaviestRule = top.value
  const pageClass: PageClass = {
    class: heaviestRule ? heaviestRule.class : null,
    rule: heaviestRule ? ruleOf(heaviestRule.rule) : null,
    rulesKnown: bundle.size > 0,
    version: num(rulesStarted.version) ?? (isObj(header.rules) ? num(header.rules.version) : null),
    digest: str(rulesStarted.digest) ?? (isObj(header.rules) ? str(header.rules.digest) : null),
    judged, asked, refused,
  }

  // 4. Les vérifications, et 5. ce qui ne l'a pas été.
  const checks: PageCheck[] = []
  const notChecked: NotChecked[] = []
  const tests = events.filter((e) => e.type === "test.result")
  const lastTest = tests.at(-1)
  const t = lastTest ? data(lastTest) : null
  if (t && t.configured === false) {
    notChecked.push({ kind: "noTests" })
  } else if (t && t.ran === false) {
    notChecked.push({ kind: "testsNotRun", why: str(t.text) })
  } else if (t) {
    const output = isObj(t.output) ? t.output : null
    checks.push({ what: "tests", label: str(t.command) ?? str(t.tool) ?? "tests", result: t.passed === true ? "passed" : "failed",
      by: "runner", proof: output ? str(output.sha256) : null, passedCount: num(t.passedCount), total: num(t.total) })
    if (t.passed !== true) notChecked.push({ kind: "testsFailed" })
    const reverted = lastTest ? events.some((e) => e.seq > lastTest.seq && e.type === "action.result" && data(e).kind === "revert"
      && data(e).ok === true) : false
    if (reverted) notChecked.push({ kind: "testsStale" })
  } else if (changes.commits === null || changes.commits === 0) {
    if (changes.status === "DONE") notChecked.push({ kind: "noCode" })
  } else {
    notChecked.push({ kind: "noTestRecord" })
  }
  if (judged > 0) {
    checks.push({ what: "rules", label: "rules", result: "judged", by: "rules", proof: pageClass.digest, passedCount: null, total: judged })
  }
  const declared = new Map<number, boolean>()
  for (const e of notes("checklist.checked")) {
    const d = data(e)
    if (typeof d.item === "number") declared.set(d.item, d.done === true)
  }
  const listNote = notes("checklist").at(-1)
  const items = listNote && Array.isArray(data(listNote).items) ? (data(listNote).items as unknown[]).filter(isObj) : []
  const byAgent: string[] = []
  const open: string[] = []
  for (const item of items) {
    const text = textOf(item.text, texts, erased)
    const label = text.state === "text" ? text.text : `#${String(item.id)}`
    if (item.done !== true) open.push(label)
    else if (typeof item.id === "number" && declared.get(item.id) === true) {
      byAgent.push(label)
      checks.push({ what: "checklist", label, result: "done", by: "declared", proof: null, passedCount: null, total: null })
    } else {
      checks.push({ what: "checklist", label, result: "done", by: "person", proof: null, passedCount: null, total: null })
    }
  }
  if (byAgent.length > 0) notChecked.push({ kind: "declaredByAgent", items: byAgent })
  if (open.length > 0) notChecked.push({ kind: "openItems", items: open })
  if (changes.summary.state !== "none") notChecked.push({ kind: "summary" })
  if (changes.commits !== null && changes.commits > 0) notChecked.push({ kind: "noReviewer" })
  if (pullRequest) notChecked.push({ kind: "ciNotRead" })

  // 6. Les décisions : chaque accord sur l'action exacte, chaque geste, la décision de fin.
  const asks = new Map<number, Obj>()
  for (const e of events) {
    const d = data(e)
    if (e.type === "action.decided" && typeof d.approval === "number" && d.effect === "ask") asks.set(d.approval, d)
  }
  const decisions: PageDecision[] = []
  for (const e of events) {
    const d = data(e)
    const ask = typeof d.approval === "number" ? asks.get(d.approval) : undefined
    const writtenRef = ask && isObj(ask.written) ? str(ask.written.sha256) : null
    const base = {
      seq: e.seq, at: e.at, who: e.actor.kind === "person" ? e.actor.id : null, reason: str(d.reason),
      action: str(d.summary) ?? str(ask?.summary), rule: str(d.rule) ?? str(ask?.rule), input: str(ask?.input),
      written: writtenRef, scope: str(d.scope), where: str(d.where),
    }
    if (e.type === "human.decision" && typeof d.approval === "number") {
      decisions.push({ ...base, kind: d.decision === "SIGNED" ? "signature" : "approval", decision: String(d.decision ?? ""),
        where: base.where ?? "taskforce" })
    } else if (e.type === "action.decided" && typeof d.approval === "number" && d.effect === "deny" && e.actor.kind === "server") {
      decisions.push({ ...base, kind: "expired", decision: "EXPIRED", who: null, where: "taskforce" })
    } else if (e.type === "human.decision" && typeof d.decision === "string" && GESTURES.has(d.decision)) {
      decisions.push({ ...base, kind: "gesture", decision: d.decision, action: str(d.pullRequest) ?? str(d.path), rule: null,
        input: null, written: null, scope: null })
    } else if (e.type === "human.decision" && d.kind === "erased") {
      decisions.push({ ...base, kind: "erased", decision: "ERASED", action: str(d.what), rule: null, input: null, written: null,
        scope: null, where: "taskforce" })
    }
  }
  const final = [...decisions].reverse().find((d) => d.kind === "gesture" && END_GESTURES.has(d.decision)) ?? null

  // 7. Le modèle.
  const agentNote = notes("agent").at(-1)
  const a = agentNote ? data(agentNote) : {}
  const sAgent = isObj(s.agent) ? s.agent : {}
  const provider = str(a.provider)
  const session = isObj(runner.session) && typeof runner.session.sha256 === "string"
    ? { sha256: runner.session.sha256, bytes: num(runner.session.bytes) } : null
  const model: PageModel = {
    known: agentNote !== undefined,
    agent: str(sAgent.kind) ?? (isObj(header.agent) ? str(header.agent.kind) : null),
    agentVersion: str(a.version),
    chosen: str(sAgent.model),
    model: str(a.model),
    provider,
    local: provider === "anthropic" || provider === "openai" ? false : provider === "ollama" ? true : null,
    fingerprint: str(a.fingerprint),
    session,
  }

  // Ce que vaut le dossier lui-même.
  const predicate = sealStatement(file.seal)
  const key = predicate && isObj(predicate.key) ? predicate.key : {}
  const witnessNote = notes("witness").at(-1)
  const w = witnessNote ? data(witnessNote) : null
  const seq = predicate ? num(predicate.seq) : null
  const record: PageRecord = {
    events: events.length,
    root: file.root,
    headerFromChain: typeof s.mission === "number" && typeof s.workspace === "string",
    seal: predicate && seq !== null ? {
      seq,
      sealedAt: str(predicate.sealedAt),
      keyId: str(key.id),
      custody: key.custody === "separate-machine" ? "separate-machine" : "same-machine",
      kept: key.kept !== false,
      coversAll: seq === events.length,
    } : null,
    witness: w ? { written: w.written === true, root: str(w.root), seq: num(w.seq), url: str(w.comment) ?? str(w.pullRequest),
      reason: str(w.reason) } : null,
    pullRequest: pullRequest !== null,
    gaps: notes("gap").map((e) => ({ from: num(data(e).from) ?? 0, to: num(data(e).to) ?? 0 })),
  }

  return {
    mission: { id: num(s.mission) ?? num(header.id), workspace: str(s.workspace) ?? str(header.workspace), issue: pageRequest.issue },
    request: pageRequest,
    changes,
    classOf: pageClass,
    checks,
    notChecked,
    decisions,
    end: final,
    model,
    record,
  }
}
