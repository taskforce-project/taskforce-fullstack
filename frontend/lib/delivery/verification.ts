import type { MissionEvidence, MissionEvidenceEvent } from "@/lib/api/delivery-service"
import { parseServerDate } from "@/lib/utils/server-date"

import type { RecordCheck } from "./verification-check"

/**
 * La page de vérification d'une mission (R212, séance n°30), assemblée par du code depuis son dossier exporté
 * (`taskforce-evidence/1`), et depuis lui seul : jamais par l'agent, jamais à la main. Sept rubriques : la demande, ce qui
 * a changé, la classe, les vérifications, ce qui n'a pas été vérifié, les décisions, le modèle ; puis ce que vaut le
 * dossier lui-même, tel que la page l'a vérifié (`RecordCheck`). Une rubrique que le dossier ne sait pas remplir le dit.
 * Le seul texte de l'agent montré comme tel est son résumé ; ses autres mots (des noms de fichiers, une commande, une
 * erreur) se citent, marqués. Rien ici ne dit qu'un changement est conforme à quoi que ce soit (R187).
 */

/**
 * Une personne telle que le dossier la nomme : par son nom ou son courriel, gardés à côté de la chaîne ; effacés avec son
 * compte, et le dossier dit quand (`on`, la note de la purge, R210) ; ou pas du tout.
 */
export type Who =
  | { readonly kind: "named"; readonly name: string }
  | { readonly kind: "erased"; readonly on?: string }
  | { readonly kind: "unnamed" }
  /** Une chaîne d'avant la 1.18 la nomme par son courriel, que la page ne montre pas (R159, second tour, N4). */
  | { readonly kind: "hidden" }

/** Qui a effacé un texte, quand, et lequel (le titre de la demande, le brief...). */
export interface Erasure {
  readonly who: Who
  readonly at: string
  readonly what: string | null
}

/**
 * Un texte du dossier, gardé à côté de la chaîne : là, changé depuis (il ne tient plus son empreinte), effacé (son
 * empreinte reste), absent de ce fichier, ou inexistant.
 */
export type DossierText =
  | { readonly state: "text"; readonly text: string }
  | { readonly state: "changed" }
  | { readonly state: "erased"; readonly erasure: Erasure | null }
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
  readonly writtenBy: Who | null
  readonly writtenAt: string | null
  /** Qui l'a confiée à l'agent, quand, et d'où. */
  readonly delegatedBy: Who | null
  readonly delegatedAt: string | null
  readonly origin: string | null
  readonly originRun: number | null
  readonly importedFrom: string | null
  /** La personne qui répond de la mission : elle seule tranche son résultat. */
  readonly accountable: Who | null
  /** Le brief tel qu'il est parti à l'agent. */
  readonly brief: { readonly text: DossierText; readonly chars: number | null; readonly sha256: string | null } | null
}

/** Un fichier de la mission, tel qu'il reste, nommé par l'agent, et la décision des règles qui a permis son contenu. */
export interface PageFile {
  readonly path: string
  readonly status: string
  readonly added: number | null
  readonly removed: number | null
  readonly sha256: string | null
  /** Le numéro, dans le dossier, de la décision des règles dont l'écriture a laissé ce contenu, quand on la retrouve. */
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
  readonly author: Who | "taskforce" | null
  /**
   * La personne nommée qui répond de la règle : la copie du paquet au dossier la nomme par son identifiant opaque, son
   * nom à côté de la chaîne (R159, second tour, N3).
   */
  readonly owner: Who | null
  readonly version: number | null
}

/** Une action qu'une règle a jugée, avec ce qu'elle était. */
export interface PageRuleUse {
  readonly rule: PageRule
  /** L'outil ou la commande (`git push`, `gh pr create`, `WebSearch`). */
  readonly tool: string | null
  /** Ce que l'agent a demandé, tel qu'il l'a écrit. */
  readonly what: string | null
  readonly seq: number
}

/**
 * 3. La classe : TaskForce ne calcule pas encore de classe sur le changement lui-même (R210) ; la page nomme les règles qui
 * ont jugé sa sortie de la copie (la branche poussée, la pull request ouverte), et l'action la plus lourde de la mission,
 * sous ce nom-là.
 */
export interface PageClass {
  readonly exits: readonly PageRuleUse[]
  readonly heaviest: (PageRuleUse & { readonly class: ChangeClass }) | null
  readonly rulesKnown: boolean
  readonly version: number | null
  readonly digest: string | null
  readonly judged: number
  readonly asked: number
  readonly refused: number
}

/** Une vérification : ce qui a été vérifié, son résultat, qui ou quoi l'a vérifié, l'empreinte de sa preuve. */
export interface PageCheck {
  readonly what: "tests" | "rules"
  readonly label: string
  readonly result: "passed" | "failed" | "judged"
  readonly by: "runner" | "rules"
  readonly proof: string | null
  readonly passedCount: number | null
  readonly total: number | null
  /**
   * Ce que le runner a regardé de la définition des tests, sans y trouver de changement : une liste, pas la preuve que les
   * tests sont les mêmes (R159, second tour de #551, L-b).
   */
  readonly definitions: readonly string[]
}

/** 5. Ce qui n'a pas été vérifié, dit en clair. */
export type NotChecked =
  | { readonly kind: "noTests" }
  | { readonly kind: "testsNotRun"; readonly why: string | null }
  | { readonly kind: "testsFailed" }
  | { readonly kind: "testsOwnDefinition"; readonly paths: readonly string[] }
  | { readonly kind: "noCode" }
  | { readonly kind: "noTestRecord" }
  | { readonly kind: "noTestYet" }
  | { readonly kind: "testsStale" }
  | { readonly kind: "declaredByAgent"; readonly items: readonly string[] }
  | { readonly kind: "doneUnattributed"; readonly items: readonly string[] }
  | { readonly kind: "openItems"; readonly items: readonly string[] }
  | { readonly kind: "summary" }
  | { readonly kind: "noReviewer" }
  | { readonly kind: "ciNotRead" }
  | { readonly kind: "nothingChecked" }

/** Une décision d'une personne, ou de ce qui en tient lieu (une demande échue, la fusion sur GitHub). */
export interface PageDecision {
  readonly seq: number
  readonly at: string
  /** `tooLong` : le runner a refusé une action trop longue pour être accordée, sans rien demander (troisième tour de #551, C1). */
  readonly kind: "approval" | "signature" | "expired" | "gesture" | "erased" | "tooLong"
  readonly decision: string
  readonly who: Who | null
  readonly where: string | null
  readonly reason: string | null
  /** Pour un accord : l'outil, ce que l'agent a demandé, la règle, et l'action exacte (l'empreinte de l'entrée, du contenu). */
  readonly tool: string | null
  readonly action: string | null
  readonly rule: PageRule | null
  readonly ruleId: string | null
  readonly input: string | null
  readonly written: string | null
  readonly scope: string | null
  /** Pour un effacement : ce qui a été effacé. */
  readonly erased: string | null
}

/** 7. Le modèle : lequel a réellement tourné, sa version, et qui le sert, tels que le dossier le dit. */
export interface PageModel {
  readonly known: boolean
  readonly agent: string | null
  readonly agentVersion: string | null
  readonly chosen: string | null
  readonly configured: string | null
  readonly model: string | null
  readonly served: readonly string[]
  readonly provider: string | null
  /** Où le runner a lu le fournisseur : la configuration avec laquelle l'agent a été lancé (second tour de #551, L-c). */
  readonly providerFrom: string | null
  readonly fingerprint: string | null
  readonly session: { readonly sha256: string; readonly bytes: number | null } | null
}

/** Un trou : les numéros du runner qui ne sont jamais arrivés (`to` nul : le runner s'est tu), et où le dossier le note. */
export interface PageGap {
  readonly from: number
  readonly to: number | null
  readonly noted: number
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
    /** Posé tard, sur un dossier fini avant que TaskForce ne scelle : il ne prouve rien de ce qui précède (second tour, N5). */
    readonly late: boolean
  } | null
  /** Le témoin, et la clé qui a scellé sa tête, que son commentaire porte aussi (R159, second tour de #551, N6). */
  readonly witness: {
    readonly written: boolean; readonly root: string | null; readonly seq: number | null; readonly url: string | null
    readonly reason: string | null; readonly key: string | null
    /**
     * La tête qu'il nomme est-elle celle de cette chaîne à cet événement ? Nul tant que la page n'a pas vérifié, ou quand la
     * chaîne ne tient pas (R159 de #552, second tour, V1).
     */
    readonly holds: boolean | null
    /** L'empreinte que la chaîne donne à l'événement qu'il nomme : c'est elle qu'on compare au commentaire, jamais la note. */
    readonly chainRoot: string | null
    /** Un premier échec, que TaskForce reprend jusqu'à `until`, sept jours après la fin (troisième tour de #551, c-d). */
    readonly retrying: boolean
    readonly until: string | null
    /** TaskForce a cessé d'essayer, le jour de sa note (`notedAt`). */
    readonly abandoned: boolean
    readonly notedAt: string
    /**
     * Le commentaire lie cette page (par un identifiant opaque du dossier), ou pourquoi il ne la lie pas : l'app de bureau,
     * une adresse locale, un lien coupé par l'exploitant, un dépôt qui n'est pas privé (R159 B2 et M1 de #551, R161 B4).
     */
    readonly pageLinked: boolean | null; readonly pageLeftOut: string | null
  } | null
  readonly pullRequest: boolean
  readonly gaps: readonly PageGap[]
  /** Le runner a pris la mission : ce qu'il rapporte vient du poste de l'agent (R159 M5 de #551). */
  readonly runnerFacts: boolean
  /**
   * La purge d'un compte nommé par une chaîne d'avant la 1.18 : sa date, et les événements qui gardent son courriel, qui ne
   * changent pas sans casser la chaîne (R159, second tour, N4).
   */
  readonly legacyErasures: ReadonlyArray<{ readonly at: string; readonly events: readonly number[] }>
  /**
   * Le dossier a atteint son plafond : à quel événement, lequel, et si TaskForce a arrêté la mission pour que rien ne
   * continue sans être écrit (R159, second tour de #551, N2). Nul sinon.
   */
  readonly cap: { readonly seq: number; readonly max: number; readonly stopped: boolean } | null
}

export interface VerificationPage {
  readonly mission: { readonly id: number | null; readonly workspace: string | null; readonly issue: string | null }
  /** La mission tourne encore : son dossier n'a pas de `mission.ended`. */
  readonly running: boolean
  /** Le dossier est d'avant la 1.18 : la chaîne ne couvre pas son en-tête, et bien des faits n'y sont pas. */
  readonly older: boolean
  /**
   * La chaîne nomme les personnes par leur courriel, comme avant la 1.18 : son `mission.started` n'a pas de `accountable`,
   * le signe que le serveur lit aussi. La page masque alors chaque courriel, comme l'export Markdown (R159, second tour, N4).
   */
  readonly legacy: boolean
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
  /** Ce que la page a vérifié du dossier ; nul tant qu'elle vérifie. */
  readonly check: RecordCheck | null
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => v !== null && typeof v === "object" && !Array.isArray(v)
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null)
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null)
const data = (e: MissionEvidenceEvent): Obj => (isObj(e.data) ? e.data : {})

/** L'identifiant opaque d'une personne dans le dossier : `who:` depuis le second tour de R159, `person:` au premier. */
const OPAQUE_PERSON = /^(who|person):[0-9a-f]{32}$/

/**
 * Un courriel, où qu'il soit dans un texte : le motif du serveur (`MissionEvidenceService.EMAIL`), les lettres de toutes les
 * langues comprises, dans la partie locale comme dans le domaine (R159 de #552, second tour, v-j).
 */
export const EMAIL = /[\p{L}\p{M}\p{N}._%+-]+@[\p{L}\p{M}\p{N}-]+(\.[\p{L}\p{M}\p{N}-]+)+/u

/** Le refus du runner d'une action trop longue pour être accordée (`approvals.ts`, troisième tour de #551, C1). */
const TOO_LONG_TO_ASK = "cap:fact-length"

/** Les gestes de la personne sur le résultat : la décision de fin est le dernier d'entre eux. */
const END_GESTURES = new Set(["APPLY", "DISCARD", "RETRY", "MARK_DONE", "MERGE", "STOP"])
const GESTURES = new Set([...END_GESTURES, "ASK_FOR_CHANGES", "REVERT_FILE", "CORRECTION"])

/** Le dossier exporté tel que la page le lit : les champs de `taskforce-evidence/1`. */
export type DossierFile = MissionEvidence

/** Ce que l'export garde d'un texte : `{ salt, text }` depuis la relecture R159 (M6), une chaîne avant. */
function keptText(entry: unknown): string | null {
  if (typeof entry === "string") return entry
  return isObj(entry) && typeof entry.text === "string" ? entry.text : null
}

/** Le paquet de règles du dossier, par identifiant. */
function rulesById(rules: Obj | undefined): Map<string, Obj> {
  const out = new Map<string, Obj>()
  const list = rules && Array.isArray(rules.rules) ? rules.rules : []
  for (const rule of list) if (isObj(rule) && typeof rule.id === "string") out.set(rule.id, rule)
  return out
}

function classOf(value: unknown): ChangeClass | null {
  return typeof value === "string" && (CLASSES as readonly string[]).includes(value) ? (value as ChangeClass) : null
}

/** Le contenu de l'énoncé du sceau (une enveloppe DSSE) ; sa signature, la page la vérifie à part (`RecordCheck`). */
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

/** Assemble la page depuis le dossier exporté, et lui seul, avec ce que la page en a vérifié quand elle l'a fait. */
export function verificationPage(file: DossierFile, check: RecordCheck | null = null): VerificationPage {
  const events = file.events ?? []
  const texts: Record<string, unknown> = isObj(file.texts) ? file.texts : {}
  const changedTexts = new Set(check?.details?.texts.changed ?? [])
  const started = events.find((e) => e.type === "mission.started")
  const s = started ? data(started) : {}
  const notes = (kind: string) => events.filter((e) => e.type === "note" && data(e).kind === kind)
  const ended = [...events].reverse().find((e) => e.type === "mission.ended")
  const end = ended ? data(ended) : {}
  const header = isObj(file.mission) ? file.mission : {}
  // Une chaîne d'avant la 1.18 nomme les personnes par leur courriel : le serveur la reconnaît à son `mission.started` sans
  // `accountable`, et la page aussi (R159, second tour, N4).
  const legacy = started === undefined || !("accountable" in s)

  // Les personnes : l'identifiant opaque de la chaîne, un par personne et par espace (`who:`, R159, second tour, L-a et L-e ;
  // `person:` au premier tour), et ce que leur note dit d'elles ; un dossier d'avant la 1.18 les nomme par leur courriel.
  const persons = new Map<string, { name: unknown; email: unknown }>()
  for (const e of notes("person")) {
    const d = data(e)
    if (typeof d.person === "string") persons.set(d.person, { name: d.name, email: d.email })
  }
  // La purge d'un compte : la note du serveur dit quelle personne, et quand (R210 : une règle reste celle d'une personne
  // nommée tant que son nom n'est pas effacé ; ensuite, le dossier dit quand il l'a été).
  const purged = new Map<string, string>()
  for (const e of notes("erased")) {
    const d = data(e)
    if (typeof d.person === "string" && !purged.has(d.person)) purged.set(d.person, e.at)
  }
  const refText = (ref: unknown): string | null => (isObj(ref) && typeof ref.sha256 === "string" && !changedTexts.has(ref.sha256)
    ? keptText(texts[ref.sha256]) : null)
  const who = (id: unknown): Who | null => {
    if (typeof id !== "string" || id.length === 0) return null
    if (legacy && EMAIL.test(id)) return { kind: "hidden" }
    // `who:unknown` : une personne que TaskForce ne trouve plus, que le paquet de règles nomme ainsi (troisième tour de #551).
    if (!OPAQUE_PERSON.test(id)) return id === "unknown" || id === "who:unknown" ? { kind: "unnamed" } : { kind: "named", name: id }
    const person = persons.get(id)
    if (!person) return { kind: "unnamed" }
    const name = refText(person.name) ?? refText(person.email)
    if (name) return { kind: "named", name }
    const on = purged.get(id)
    return on ? { kind: "erased", on } : { kind: "erased" }
  }
  const actor = (e: MissionEvidenceEvent): Who | null => (e.actor.kind === "person" ? who(e.actor.id) : null)

  // Les effacements : qui, quand, et quel texte.
  const erasures = new Map<string, Erasure>()
  for (const e of events) {
    const d = data(e)
    if (e.type === "human.decision" && d.kind === "erased" && typeof d.text === "string") {
      erasures.set(d.text, { who: actor(e) ?? { kind: "unnamed" }, at: e.at, what: str(d.what) })
    }
  }
  const textOf = (ref: unknown): DossierText => {
    if (!isObj(ref) || typeof ref.sha256 !== "string") return { state: "none" }
    if (changedTexts.has(ref.sha256)) return { state: "changed" }
    const text = keptText(texts[ref.sha256])
    if (text !== null) return { state: "text", text }
    const erasure = erasures.get(ref.sha256)
    return erasure ? { state: "erased", erasure } : { state: "missing" }
  }

  // 1. La demande.
  const request = isObj(s.request) ? s.request : null
  const origin = isObj(s.origin) ? s.origin : {}
  const briefNote = notes("brief").at(-1)
  const brief = briefNote ? data(briefNote).brief : null
  const pageRequest: PageRequest = {
    known: request !== null,
    issue: str(s.issue) ?? str(header.issue),
    title: request ? textOf(request.title) : { state: "none" },
    description: request ? textOf(request.description) : { state: "none" },
    writtenBy: request ? who(request.reporter) : null,
    writtenAt: request ? str(request.createdAt) : null,
    delegatedBy: who(s.requestedBy) ?? who(header.requestedBy),
    delegatedAt: str(s.delegatedAt) ?? started?.at ?? null,
    origin: str(origin.channel),
    originRun: num(origin.run),
    importedFrom: request ? str(request.importedFrom) : null,
    accountable: who(s.accountable),
    brief: isObj(brief) ? { text: textOf(brief), chars: num(brief.chars), sha256: str(brief.sha256) } : null,
  }

  // 2. Ce qui a changé, et la décision des règles qui a permis chaque contenu.
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
  const pullRequest = resultUrl && /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/\d+$/.test(resultUrl) ? resultUrl : null
  const changes: PageChanges = {
    status: str(end.status),
    error: str(end.error),
    summary: textOf(end.summary),
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

  // 3. Les règles : celles qui ont jugé la sortie du changement, et l'action la plus lourde de la mission.
  const bundle = rulesById(file.rules)
  const rulesStarted = isObj(s.rules) ? s.rules : {}
  const layers = Array.isArray(rulesStarted.layers) ? rulesStarted.layers.filter(isObj) : []
  const ruleOf = (id: string | null): PageRule | null => {
    if (!id) return null
    const rule = bundle.get(id)
    if (!rule) return null
    const layer = str(rule.layer)
    const ofLayer = layer ? layers.find((l) => l.scope === layer) : undefined
    return {
      id,
      class: classOf(rule.class),
      reason: str(rule.text) ?? str(rule.reason),
      layer,
      author: layer ? (ofLayer ? who(ofLayer.author) : null) : "taskforce",
      owner: who(rule.owner),
      version: layer ? (ofLayer ? num(ofLayer.version) : null) : num(rulesStarted.version),
    }
  }
  const approved = new Set<string>()
  for (const e of events) {
    const d = data(e)
    if (e.type === "human.decision" && d.decision === "ALLOWED" && typeof d.rule === "string") approved.add(d.rule)
  }
  // Une boîte : TypeScript ne suit pas une affectation faite dans une fonction.
  const top: { value: (PageRuleUse & { class: ChangeClass }) | null } = { value: null }
  const exits: PageRuleUse[] = []
  let judged = 0
  let asked = 0
  let refused = 0
  const weigh = (ruleId: string | null, tool: string | null, what: string | null, seq: number): void => {
    const rule = ruleOf(ruleId)
    if (!rule?.class) return
    if (!top.value || CLASSES.indexOf(rule.class) > CLASSES.indexOf(top.value.class)) top.value = { rule, class: rule.class, tool, what, seq }
  }
  for (const e of events) {
    const d = data(e)
    if (e.type === "action.decided" && d.kind === "decision") {
      judged++
      if (d.effect === "ask") asked++
      if (d.effect === "deny") refused++
      const facts = Array.isArray(d.facts) && isObj(d.facts[0]) ? d.facts[0] : {}
      const what = str(d.text) ?? str(facts.query) ?? str(facts.path) ?? str(facts.command)
      if (d.effect === "allow" && e.actor.kind === "rule") weigh(e.actor.id, str(d.tool), what, e.seq)
      if (d.effect === "ask" && e.actor.kind === "rule" && approved.has(e.actor.id)) weigh(e.actor.id, str(d.tool), what, e.seq)
    }
    if (e.type === "exit.result") {
      judged++
      if (d.effect === "deny") refused++
      if (d.effect === "allow") {
        const rule = ruleOf(str(d.rule))
        if (rule) exits.push({ rule, tool: str(d.tool), what: null, seq: e.seq })
        weigh(str(d.rule), str(d.tool), null, e.seq)
      }
    }
  }
  const pageClass: PageClass = {
    exits,
    heaviest: top.value,
    rulesKnown: bundle.size > 0,
    version: num(rulesStarted.version) ?? (isObj(header.rules) ? num(header.rules.version) : null),
    digest: str(rulesStarted.digest) ?? (isObj(header.rules) ? str(header.rules.digest) : null),
    judged, asked, refused,
  }

  // 4. Les vérifications, et 5. ce qui ne l'a pas été.
  const running = started !== undefined && ended === undefined
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
    const ownDefinition = Array.isArray(t.definitionChanged) ? t.definitionChanged.filter((p): p is string => typeof p === "string") : []
    if (ownDefinition.length > 0) {
      // La branche a changé ce qui dit comment ses tests tournent : leur résultat ne compte pas comme une vérification.
      notChecked.push({ kind: "testsOwnDefinition", paths: ownDefinition })
    } else {
      checks.push({ what: "tests", label: str(t.command) ?? str(t.tool) ?? "tests", result: t.passed === true ? "passed" : "failed",
        by: "runner", proof: output ? str(output.sha256) : null, passedCount: num(t.passedCount), total: num(t.total),
        definitions: Array.isArray(t.definitions) ? t.definitions.filter((p): p is string => typeof p === "string") : [] })
    }
    if (t.passed !== true) notChecked.push({ kind: "testsFailed" })
    const reverted = lastTest ? events.some((e) => e.seq > lastTest.seq && e.type === "action.result" && data(e).kind === "revert"
      && data(e).ok === true) : false
    if (reverted) notChecked.push({ kind: "testsStale" })
  } else if (running) {
    notChecked.push({ kind: "noTestYet" })
  } else if (changes.commits === null || changes.commits === 0) {
    if (changes.status === "DONE") notChecked.push({ kind: "noCode" })
    else notChecked.push({ kind: "noTestRecord" })
  } else {
    notChecked.push({ kind: "noTestRecord" })
  }
  if (judged > 0) {
    checks.push({ what: "rules", label: "rules", result: "judged", by: "rules", proof: pageClass.digest, passedCount: null, total: judged,
      definitions: [] })
  }
  // La liste de l'issue : ce que l'agent de cette mission a coché est sa déclaration ; ce qui était coché sans que le dossier
  // dise par qui (avant la mission, par un essai précédent, à la main) ne compte pas pour elle (R211, R159 P3).
  const declared = new Map<number, boolean>()
  for (const e of notes("checklist.checked")) {
    const d = data(e)
    if (typeof d.item === "number") declared.set(d.item, d.done === true)
  }
  const listNote = notes("checklist").at(-1)
  const items = listNote && Array.isArray(data(listNote).items) ? (data(listNote).items as unknown[]).filter(isObj) : []
  const byAgent: string[] = []
  const unattributed: string[] = []
  const open: string[] = []
  for (const item of items) {
    const text = textOf(item.text)
    const label = text.state === "text" ? text.text : `#${String(item.id)}`
    if (item.done !== true) open.push(label)
    else if (typeof item.id === "number" && declared.get(item.id) === true) byAgent.push(label)
    else unattributed.push(label)
  }
  if (byAgent.length > 0) notChecked.push({ kind: "declaredByAgent", items: byAgent })
  if (unattributed.length > 0) notChecked.push({ kind: "doneUnattributed", items: unattributed })
  if (open.length > 0) notChecked.push({ kind: "openItems", items: open })
  if (changes.summary.state !== "none") notChecked.push({ kind: "summary" })
  if (changes.commits !== null && changes.commits > 0) notChecked.push({ kind: "noReviewer" })
  if (pullRequest) notChecked.push({ kind: "ciNotRead" })
  if (checks.length === 0 && !notChecked.some((n) => n.kind === "noTestRecord" || n.kind === "noTestYet")) {
    notChecked.push({ kind: "nothingChecked" })
  }

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
    const ruleId = str(d.rule) ?? str(ask?.rule)
    const base = {
      seq: e.seq, at: e.at, who: actor(e), reason: str(d.reason), tool: str(d.tool) ?? str(ask?.tool),
      action: str(d.summary) ?? str(ask?.summary), rule: ruleOf(ruleId), ruleId, input: str(ask?.input),
      written: writtenRef, scope: str(d.scope), where: str(d.where), erased: null,
    }
    if (e.type === "human.decision" && typeof d.approval === "number") {
      decisions.push({ ...base, kind: d.decision === "SIGNED" ? "signature" : "approval", decision: String(d.decision ?? ""),
        where: base.where ?? "taskforce" })
    } else if (e.type === "action.decided" && typeof d.approval === "number" && d.effect === "deny" && e.actor.kind === "server") {
      decisions.push({ ...base, kind: "expired", decision: "EXPIRED", who: null, where: "taskforce" })
    } else if (e.type === "action.decided" && d.kind === "decision" && e.actor.kind === "rule" && e.actor.id === TOO_LONG_TO_ASK) {
      // Une demande d'accord ne part jamais sur un fait coupé : le runner refuse l'action (troisième tour de #551, C1).
      const facts = Array.isArray(d.facts) && isObj(d.facts[0]) ? d.facts[0] : {}
      decisions.push({ ...base, kind: "tooLong", decision: "DENIED", who: null, where: "runner",
        action: str(d.text) ?? str(facts.command) ?? str(facts.path), rule: null, ruleId: null })
    } else if (e.type === "human.decision" && typeof d.decision === "string" && GESTURES.has(d.decision)) {
      const merger = d.decision === "MERGE" ? (refText(d.by) ?? str(d.by)) : null
      decisions.push({ ...base, kind: "gesture", decision: d.decision, action: str(d.pullRequest) ?? str(d.path),
        who: merger ? { kind: "named", name: merger } : base.who, rule: null, ruleId: null, input: null, written: null, scope: null })
    } else if (e.type === "human.decision" && d.kind === "erased") {
      decisions.push({ ...base, kind: "erased", decision: "ERASED", erased: str(d.what), action: null, rule: null, ruleId: null,
        input: null, written: null, scope: null, where: "taskforce" })
    }
  }
  const final = [...decisions].reverse().find((d) => d.kind === "gesture" && END_GESTURES.has(d.decision)) ?? null

  // 7. Le modèle.
  const agentNote = notes("agent").at(-1)
  const a = agentNote ? data(agentNote) : {}
  const sAgent = isObj(s.agent) ? s.agent : {}
  const session = isObj(runner.session) && typeof runner.session.sha256 === "string"
    ? { sha256: runner.session.sha256, bytes: num(runner.session.bytes) } : null
  const model: PageModel = {
    known: agentNote !== undefined,
    agent: str(sAgent.kind) ?? (isObj(header.agent) ? str(header.agent.kind) : null),
    agentVersion: str(a.version),
    chosen: str(sAgent.model),
    configured: str(a.configured),
    model: str(a.model),
    served: Array.isArray(a.served) ? a.served.filter((m): m is string => typeof m === "string" && m.length > 0) : [],
    provider: str(a.provider),
    providerFrom: str(a.providerFrom),
    fingerprint: str(a.fingerprint),
    session,
  }

  // Ce que vaut le dossier lui-même.
  const predicate = sealStatement(file.seal)
  const key = predicate && isObj(predicate.key) ? predicate.key : {}
  const witnessNote = notes("witness").at(-1)
  const w = witnessNote ? data(witnessNote) : null
  // Ce que la page a vérifié du témoin : sa tête est-elle celle de la chaîne (R159 de #552, second tour, V1) ?
  const witnessCheck = witnessNote ? check?.details?.witnesses.find((c) => c.seq === witnessNote.seq) : undefined
  const witnessAt = w ? num(w.seq) : null
  // Sept jours après la fin, TaskForce cesse de reprendre un témoin que GitHub a empêché (troisième tour de #551, c-d).
  const endedAt = ended ? parseServerDate(ended.at) : null
  const until = endedAt && !Number.isNaN(endedAt.getTime()) ? new Date(endedAt.getTime() + 7 * 24 * 3600 * 1000).toISOString() : null
  // Le plafond du dossier, que seul le serveur constate ; le runner a ses propres limites (tours, durée), dites autrement.
  const capped = events.find((e) => e.type === "limit.reached" && e.actor.kind === "server" && typeof data(e).max === "number")
  const seq = predicate ? num(predicate.seq) : null
  const headerFromChain = typeof s.mission === "number" && typeof s.workspace === "string"
  const record: PageRecord = {
    events: events.length,
    root: file.root,
    headerFromChain,
    seal: predicate && seq !== null ? {
      seq,
      sealedAt: str(predicate.sealedAt),
      keyId: str(key.id),
      custody: key.custody === "separate-machine" ? "separate-machine" : "same-machine",
      kept: key.kept !== false,
      coversAll: seq === events.length,
      late: predicate.late === true,
    } : null,
    witness: w && witnessNote ? { written: w.written === true, root: str(w.root), seq: witnessAt, url: str(w.comment) ?? str(w.pullRequest),
      reason: str(w.reason), key: str(w.key), pageLinked: typeof w.pageLinked === "boolean" ? w.pageLinked : null,
      pageLeftOut: str(w.pageLeftOut),
      holds: witnessCheck ? witnessCheck.holds : null,
      chainRoot: witnessAt !== null ? (events[witnessAt - 1]?.hash ?? null) : null,
      retrying: w.written !== true && w.retrying === true, until,
      abandoned: w.written !== true && w.abandoned === true, notedAt: witnessNote.at } : null,
    pullRequest: pullRequest !== null,
    gaps: notes("gap").map((e) => ({ from: num(data(e).from) ?? 0, to: num(data(e).to), noted: e.seq })),
    runnerFacts: s.runnerFacts === "agent-machine",
    legacyErasures: notes("erased").filter((e) => data(e).legacy === true).map((e) => {
      const seqs = data(e).events
      return { at: e.at, events: Array.isArray(seqs) ? seqs.filter((n): n is number => typeof n === "number") : [] }
    }),
    cap: capped ? { seq: capped.seq, max: num(data(capped).max) ?? 0, stopped: data(capped).stopped === true } : null,
  }

  return {
    mission: { id: num(s.mission) ?? num(header.id), workspace: str(s.workspace) ?? str(header.workspace), issue: pageRequest.issue },
    running,
    older: started !== undefined && !headerFromChain,
    legacy,
    request: pageRequest,
    changes,
    classOf: pageClass,
    checks,
    notChecked,
    decisions,
    end: final,
    model,
    record,
    check,
  }
}
