import type { AssistantAnswer, AssistantToolCall } from "@/lib/api/assistant-service"
import type { CONSTANTS_EN } from "@/lib/constants_en"
import { fillText } from "@/lib/delivery/result-card"
import { toolLabel } from "@/lib/utils/tool-label"

// ---------------------------------------------------------------------------
// Ce que Cortex fait et a fait, en mots (R137, séance n°20). Le serveur annonce ses étapes et garde ses gestes, avec leurs
// noms d'outils : ils ne vont jamais à l'écran. Pendant le travail, une ligne dit ce qui se passe ; à la fin, des phrases
// disent ce qui a été lu et fait, et le brut reste un clic plus loin. Du texte seulement : la règle se teste.
// ---------------------------------------------------------------------------

type ThreadTexts = (typeof CONSTANTS_EN)["thread"]

/** Une étape annoncée par le serveur pendant une réponse (`/topic/cortex.{userId}`). */
export interface CortexWorkStep {
  conversationId: number | null
  step: string
  tool: string | null
}

interface ToolWords {
  doing: string
  did: string
  waits?: string
  read?: string
  proposes?: string
}

/** Les noms que la casse ne suffit pas à dire. */
const BRANDS: Readonly<Record<string, string>> = { github: "GitHub", gitlab: "GitLab", hubspot: "HubSpot" }

/**
 * Le connecteur d'un outil externe (`linear__save_issue`), en mots : « Linear », « Microsoft 365 », « GitHub » pour
 * `github-mcp` (le second accès de GitHub, R160) ; null pour un outil de TaskForce.
 */
export function serviceOf(tool: string): string | null {
  const at = tool.indexOf("__")
  if (at <= 0) return null
  const words = tool.slice(0, at).replace(/^custom-/, "").replace(/-mcp$/, "").split(/[-_\s]+/).filter(Boolean)
  if (words.length === 0) return null
  return words.map((word) => BRANDS[word] ?? word.charAt(0).toUpperCase() + word.slice(1)).join(" ")
}

/** Les mots d'un outil : les siens, ceux d'un connecteur, ou des mots généraux pour un outil que cette version ne connaît pas. */
export function toolWords(tool: string, t: ThreadTexts): ToolWords {
  const service = serviceOf(tool)
  if (service) {
    return {
      doing: fillText(t.external.doing, { service }),
      did: fillText(t.external.did, { service }),
      waits: fillText(t.external.waits, { service }),
      read: fillText(t.external.read, { service }),
    }
  }
  return (t.tools as Readonly<Record<string, ToolWords | undefined>>)[tool] ?? t.other
}

/** La ligne de travail : ce qui se passe maintenant, dans les mots de quelqu'un qui ne code pas ; null avant la première étape. */
export function stepLine(step: Pick<CortexWorkStep, "step" | "tool"> | null, t: ThreadTexts): string | null {
  if (!step) return null
  if (step.step === "tool") return step.tool ? toolWords(step.tool, t).doing : t.other.doing
  return (t.step as Readonly<Record<string, string | undefined>>)[step.step] ?? null
}

/** « 8 s », « 1 min 12 s » ; jamais zéro : une réponse a toujours pris un instant. */
export function workedTime(ms: number, t: ThreadTexts): string {
  const total = Math.max(1, Math.round(ms / 1000))
  if (total < 60) return fillText(t.timeSeconds, { seconds: String(total) })
  return fillText(t.timeMinutes, { minutes: String(Math.floor(total / 60)), seconds: String(total % 60) })
}

/** La ligne repliée : « Worked for 8 s », ou « Worked » pour une réponse dont le temps n'a pas été gardé. */
export function workedLine(answer: Pick<AssistantAnswer, "read">, t: ThreadTexts): string {
  const ms = answer.read?.workedMs
  return ms == null ? t.worked : fillText(t.workedFor, { time: workedTime(ms, t) })
}

/** Un geste de la réponse : dans une réponse qui vient d'arriver, avec ce qu'il a reçu et rendu ; dans une conversation rouverte, sans. */
interface WorkAct {
  name: string
  status: string
  key: string | null
  input?: string | null
  output?: string | null
}

function actsOf(answer: Pick<AssistantAnswer, "toolCalls" | "read">): WorkAct[] {
  if (answer.toolCalls.length > 0) {
    return answer.toolCalls.map((call: AssistantToolCall) => ({
      name: call.name, status: call.status, key: call.target?.key ?? null, input: call.input, output: call.output,
    }))
  }
  if (answer.read?.acts?.length) return answer.read.acts.map((act) => ({ name: act.name, status: act.status, key: act.key ?? null }))
  // Une réponse d'avant que ses gestes soient gardés : ses lectures réussies, seules connues.
  return (answer.read?.tools ?? []).map((tool) => ({ name: tool.name, status: "success", key: null }))
}

/** Une réponse qui n'a rien fait d'autre ne montre que son texte et sa ligne grise (R137). */
export function didWork(answer: Pick<AssistantAnswer, "toolCalls" | "read">): boolean {
  return actsOf(answer).length > 0
}

/** Une phrase du détail, et le brut d'un geste quand la réponse vient d'arriver : un clic de plus (R133). */
export interface WorkSentence {
  text: string
  raw?: { input: string | null; output: string | null }
}

/** La raison d'un échec, sans le nom de l'outil que le serveur met devant. */
function reasonOf(output: string | null | undefined): string | null {
  const said = output?.replace(/^Tool \S+ failed: /, "").trim()
  return said || null
}

function sentenceOf(act: WorkAct, t: ThreadTexts): string {
  const words = toolWords(act.name, t)
  const fill = (text: string) => text.replace("{key}", act.key ?? t.theIssue)
  switch (act.status) {
    case "success": return fill(words.did)
    case "pending": return fill(words.waits ?? t.other.waits)
    case "question": return t.asked
    case "refused": return t.refused
    case "error": {
      const why = reasonOf(act.output)
      return why ? fillText(t.failedWhy, { why }) : t.failed
    }
    default: return fill(words.did)
  }
}

/**
 * Ce qui a été lu puis fait, en phrases : jamais un nom d'outil, ni « 5 note(s) · ARCHITECTURE · PROJET ». Une même phrase
 * ne se répète pas : trois lectures du tableau disent une fois qu'il a été lu.
 */
export function workSentences(answer: Pick<AssistantAnswer, "toolCalls" | "read">, t: ThreadTexts): WorkSentence[] {
  const read = answer.read
  const sentences: WorkSentence[] = []
  if (read) {
    if (read.notes > 0) {
      sentences.push({ text: read.notes === 1 ? t.didNoteOne : fillText(t.didNotes, { count: String(read.notes) }) })
    }
    for (const board of read.boards ?? []) {
      const seen = board.issues === 1
        ? fillText(t.didBoardOne, { project: board.project })
        : fillText(t.didBoards, { project: board.project, count: String(board.issues) })
      sentences.push({ text: board.open ? `${seen}, ${fillText(t.didBoardOpen, { key: board.open })}` : seen })
    }
    for (const issue of read.issues ?? []) {
      const text = issue.comments === 1
        ? fillText(t.didIssueComment, { key: issue.key })
        : issue.comments > 1
          ? fillText(t.didIssueComments, { key: issue.key, count: String(issue.comments) })
          : fillText(t.didIssue, { key: issue.key })
      sentences.push({ text })
    }
  }
  const said = new Set(sentences.map((sentence) => sentence.text))
  for (const act of actsOf(answer)) {
    const text = sentenceOf(act, t)
    if (said.has(text)) continue
    said.add(text)
    sentences.push(act.input == null && act.output == null ? { text } : { text, raw: { input: act.input ?? null, output: act.output ?? null } })
  }
  return sentences
}

/**
 * Ce que le serveur a répondu d'un geste, tel qu'une personne le lit : ni l'id qu'il donne aux agents (« (id 31) »), ni le
 * nom de l'app, puisque la phrase est dans l'app (R133, R136).
 */
export function plainOutput(output: string): string {
  return output.replace(/ \(id \d+\)/g, "").replace(/ in TaskForce\b/g, "").trim()
}

/** Ce que devient un geste repris sur une carte de questions : ce qu'il a fait, ou pourquoi il ne l'a pas fait. */
export function outcomeLine(call: Pick<AssistantToolCall, "status" | "output">, t: ThreadTexts): string | null {
  const said = reasonOf(call.output)
  if (!said) return null
  switch (call.status) {
    case "success":
    case "refused": return plainOutput(said)
    case "error": return `${t.outcomeFailed}${plainOutput(said)}`
    default: return null
  }
}

/**
 * Ranger un document (R156) : la carte dit quoi et où, d'après ses arguments (le titre, la cible, le dossier) ; null
 * quand ils ne le disent pas.
 */
function saveProposal(input: string | null | undefined, t: ThreadTexts): string | null {
  if (!input) return null
  try {
    const args = JSON.parse(input) as Record<string, unknown>
    const title = typeof args.title === "string" && args.title.trim() ? args.title.trim() : null
    const places = t.saveWhere as Readonly<Record<string, string | undefined>>
    const place = typeof args.storage === "string" ? places[args.storage] : undefined
    if (!title || !place) return null
    const folder = typeof args.folder === "string" && args.folder.trim() ? args.folder.trim() : null
    return fillText(t.proposesSave, { title, where: folder ? fillText(t.saveWhereFolder, { where: place, folder }) : place })
  } catch {
    return null
  }
}

/** Ce que dit la carte d'une action qui attend l'accord de la personne, sans le nom de son outil. */
export function proposalLine(tool: string, t: ThreadTexts, input?: string | null): string {
  const said = proposal(tool, t, input)
  if (said.values.length === 0) return `${said.lead}${said.tail}`
  return `${said.lead}: ${said.values.map(valueLine).join(", ")}${said.tail}`
}

/** Une valeur dite en texte : son nom puis la valeur, entre guillemets sauf un nombre. */
const valueLine = (value: ProposalValue) =>
  `${value.label ? `${value.label} ` : ""}${value.number ? value.text : `"${value.text}"`}`

/**
 * Une valeur que la carte montre (R160) : dans son propre élément, jamais lue comme la phrase de la carte, même quand
 * elle contient des guillemets ou une autre phrase.
 */
export interface ProposalValue {
  /** Le nom de l'argument en mots (« priority ») ; null pour le titre, qui se suffit. */
  label: string | null
  text: string
  number: boolean
}

/** La phrase de la carte en trois parties : ce qui précède les valeurs, les valeurs, ce qui les suit. */
export interface Proposal {
  lead: string
  values: ProposalValue[]
  tail: string
}

/** Marque la place des valeurs dans la phrase : elles ne passent jamais par le texte de la phrase. */
const VALUES_SLOT = "\u0000"

/**
 * La carte d'une action qui attend l'accord de la personne, sans le nom de son outil. Pour un outil connecté, l'action
 * en mots et ses valeurs principales (R160) : « Cortex proposes to create an issue in Linear: "…" » ; une action dont le
 * nom ne dit pas le geste : « Cortex proposes an action in GitHub: … », jamais le nom de l'outil.
 */
export function proposal(tool: string, t: ThreadTexts, input?: string | null): Proposal {
  const sentence = (lead: string): Proposal => ({ lead, values: [], tail: "" })
  if (tool === "save_document") {
    const save = saveProposal(input, t)
    if (save) return sentence(save)
  }
  const service = serviceOf(tool)
  if (service) {
    const action = actionWords(tool, service, argsOf(input))
    const values = mainValues(input, tool)
    if (!action && values.length === 0) return sentence(fillText(t.proposesExternal, { service }))
    const template = action ? t.proposesExternalAction : t.proposesExternalValues
    const [lead, tail = ""] = fillText(template, { action: action ?? "", service, values: VALUES_SLOT }).split(VALUES_SLOT)
    return { lead, values, tail }
  }
  return sentence(fillText(t.proposes, { what: toolWords(tool, t).proposes ?? t.proposesThis }))
}

// ---------------------------------------------------------------------------
// L'action d'un outil connecté, en mots (R160) : son verbe et ce sur quoi elle porte, ses valeurs principales, puis ses
// arguments un clic plus loin, et le brut à deux. Jamais le nom technique au premier regard (R133).
// ---------------------------------------------------------------------------

/** Les verbes d'une action qui porte sur une chose : « create an issue », « post a channel message ». */
const ACT_VERBS = new Set([
  "add", "approve", "archive", "assign", "book", "cancel", "capture", "charge", "close", "comment", "create", "delete",
  "dismiss", "draft", "edit", "fork", "invite", "mark", "merge", "move", "open", "pay", "post", "publish", "push",
  "refund", "reject", "remove", "rename", "reply", "request", "run", "save", "schedule", "send", "set", "share", "star",
  "start", "stop", "submit", "transfer", "trigger", "unstar", "update", "upload", "write",
])
/** Ces verbes lisent ou cherchent : sans article (« search code », « list issues »). */
const BARE_VERBS = new Set(["search", "list", "get", "read", "fetch", "find", "query", "look"])
const NO_ARTICLE = new Set(["a", "an", "the", "or", "and", "to", "from", "in", "on", "of", "for", "my", "your", "all", "each"])
/** Ce qui ne se compte pas ne prend pas d'article : « send money », « export data ». */
const UNCOUNTABLE = new Set([
  "access", "advice", "billing", "code", "content", "data", "equipment", "evidence", "feedback", "funding", "info",
  "information", "media", "metadata", "money", "music", "news", "payroll", "software", "storage", "traffic",
])

/**
 * L'action d'un outil externe en mots : `linear__create_issue` donne « create an issue », `slack__search_messages`
 * « search messages », `github-mcp__issue_write` avec `method: "update"` « update an issue ». null quand le nom ne dit
 * pas un geste connu : la carte dit alors « an action », jamais le nom de l'outil.
 */
export function actionWords(tool: string, service: string, args: Record<string, unknown> | null = null): string | null {
  const name = tool.slice(tool.indexOf("__") + 2)
  // `issue_write`, `label_write` (GitHub) : un outil pour plusieurs gestes, que l'argument `method` choisit.
  const write = /^(.+?)[_-]write$/i.exec(name)
  if (write) {
    const method = typeof args?.method === "string" ? args.method.trim().toLowerCase().split(/[_\s-]+/)[0] ?? "" : ""
    return ACT_VERBS.has(method) ? phrase(method, toolLabel(write[1], service).split(" ")) : null
  }
  const label = toolLabel(name, service).trim()
  if (!label) return null
  const [first, ...rest] = label.split(" ")
  const verb = first.toLowerCase()
  if (BARE_VERBS.has(verb)) return [verb, ...rest].join(" ")
  return ACT_VERBS.has(verb) ? phrase(verb, rest) : null
}

/** Le verbe et ce sur quoi il porte, avec l'article qui convient : « create an issue », « push files », « send money ». */
function phrase(verb: string, rest: string[]): string {
  const words = rest.map((word, i) => (i === 0 ? word.toLowerCase() : word)).filter(Boolean)
  if (words.length === 0) return verb
  const last = words[words.length - 1].toLowerCase()
  const plural = /s$/.test(last) && !/ss$/.test(last)
  const counted = !plural && !UNCOUNTABLE.has(last) && words.length <= 2 && !NO_ARTICLE.has(words[0]) && !/^\d/.test(words[0])
  return `${verb} ${counted ? `${articleFor(words[0])} ` : ""}${words.join(" ")}`
}

/**
 * « a » ou « an » d'après le son du mot, pas sa lettre : « a user », « a unit », « an update », « an hour ». Les mots
 * qui commencent par le son « you » ou « wun », et ceux dont le « h » ne se dit pas, sont listés par leur début.
 */
export function articleFor(word: string): "a" | "an" {
  const w = word.toLowerCase()
  if (/^(u[bcfgklmnprstv][aeiou]|uni|eu|ewe|one|once|ur[aeiou])/.test(w) && !/^(und|unl|unt|ups|ush|umb)/.test(w)) return "a"
  if (/^(hour|honest|honou?r|heir)/.test(w)) return "an"
  return /^[aeiou]/.test(w) ? "an" : "a"
}

/** Les arguments d'un geste, quand ils se lisent : un objet JSON, sinon null. */
function argsOf(input: string | null | undefined): Record<string, unknown> | null {
  if (!input) return null
  try {
    const args: unknown = JSON.parse(input)
    return isRecord(args) ? args : null
  } catch {
    return null
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)

/** Le nom d'un argument en mots : `assigneeId` donne « assignee id », `due_date` « due date ». */
function argWords(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/[\s_\-.]+/).filter(Boolean).map((w) => w.toLowerCase()).join(" ")
}

const TITLE_KEYS = new Set(["title", "name", "subject", "summary"])
const ID_WORD = /(^| )(id|ids|uuid|guid|token|cursor|url|uri|href|key|secret|password)$/
/**
 * Un argument dont le nom dit un secret : sa valeur ne se montre nulle part, ni dans la phrase, ni sous « Details ».
 * « auth » seul en est un ; `oauth` et `author` n'en sont pas.
 */
const SECRET_WORD = /(^| )(password|passwd|passphrase|pass|pin|secret|secrets|token|tokens|apikey|credential|credentials|auth|authorization|cookie|otp)$/
/**
 * « key » n'est un secret que seul, ou après un mot qui en fait un (`apiKey`, `privateKey`) : `issueKey` ou
 * `projectKey` disent où l'action arrive, et restent montrés.
 */
const SECRET_KEY = /^keys?$|(^| )(api|access|secret|private|client|signing|encryption|ssh|license|session|auth) keys?$/
/** Où l'action arrive : un canal, un dépôt, une page, un projet. Toujours dit, même quand c'est un identifiant. */
const PLACE_WORD = /^(channel|channels|conversation|thread|repo|repository|page|parent|project|database|board|folder|space|team|list|calendar|site|drive|table|sheet|base|workspace)( (id|ids|name|key|slug))?$/

/** Le nom de cet argument dit-il un secret (`password`, `apiKey`, `pin`) ? */
export function namesSecret(key: string): boolean {
  const words = argWords(key)
  return SECRET_WORD.test(words) || SECRET_KEY.test(words) || SECRET_WORD.test(key.toLowerCase())
}

/** Une valeur qui identifie plutôt qu'elle ne dit : un id, une adresse, un jeton opaque (« e3b0c442-98fc-1c14 »). */
function identifies(key: string, value: unknown): boolean {
  if (ID_WORD.test(argWords(key)) || namesSecret(key)) return true
  return typeof value === "string" && !/\s/.test(value) && value.length >= 12 && /\d/.test(value)
}

/** Une valeur longue s'arrête avant 60 caractères, sur un mot entier quand elle en a, puis « … ». */
function short(raw: string): string {
  // Une ligne : les retours à la ligne et les caractères de contrôle d'une valeur deviennent des espaces.
  const text = raw.replace(/[\p{Cc}\s]+/gu, " ").trim()
  if (text.length <= 60) return text
  const cut = text.slice(0, 59)
  const space = cut.lastIndexOf(" ")
  return `${(space > 40 ? cut.slice(0, space) : cut).replace(/[\s,;:.]+$/, "")}…`
}

/** Les devises que Stripe compte sans décimales, et celles qu'il compte en millièmes. */
const ZERO_DECIMAL = new Set(["BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"])
const THREE_DECIMALS = new Set(["BHD", "JOD", "KWD", "OMR", "TND"])
/** Les devises à deux décimales que la carte sait dire : une autre garde son nombre brut et son code. */
const TWO_DECIMALS = new Set(["AUD", "BRL", "CAD", "CHF", "CNY", "CZK", "DKK", "EUR", "GBP", "HKD", "INR", "MXN", "NOK", "NZD", "PLN", "SEK", "SGD", "USD", "ZAR"])

/**
 * Un montant tel que la carte le dit : en devise seulement quand l'unité est sûre (Stripe compte dans la plus petite
 * unité de la devise, sauf les devises sans décimales) ; sinon le nombre tel quel, avec le code de sa devise. Un montant
 * mal lu sur cette carte serait pire qu'un montant brut.
 */
export function amountText(amount: number, currency: string | null, connector: string): string {
  const code = currency?.trim().toUpperCase() ?? ""
  if (!/^[A-Z]{3}$/.test(code)) return String(amount)
  const digits = ZERO_DECIMAL.has(code) ? 0 : THREE_DECIMALS.has(code) ? 3 : TWO_DECIMALS.has(code) ? 2 : null
  if (connector !== "stripe" || digits === null || !Number.isInteger(amount)) return `${amount} ${code}`
  return new Intl.NumberFormat("en", { style: "currency", currency: code, minimumFractionDigits: digits, maximumFractionDigits: digits })
    .format(amount / 10 ** digits)
}

/**
 * Ce que l'action dit d'elle au premier regard : son titre, où elle arrive (un canal, un dépôt, une page, un projet,
 * même désigné par un identifiant), un montant dans sa devise, puis des valeurs courtes avec leur nom ; trois au plus,
 * jamais un secret ni un autre identifiant ; chacune sur une ligne, 60 caractères au plus.
 */
export function mainValues(input: string | null | undefined, tool = ""): ProposalValue[] {
  const args = argsOf(input)
  if (!args) return []
  const connector = tool.includes("__") ? tool.slice(0, tool.indexOf("__")).replace(/-mcp$/, "") : ""
  const text = (label: string | null, value: string): ProposalValue => ({ label, text: short(value), number: false })
  const plain = (label: string | null, value: string): ProposalValue => ({ label, text: short(value), number: true })
  const used = new Set<string>(["method"])
  const out: ProposalValue[] = []

  const title = Object.keys(args).find((key) => TITLE_KEYS.has(key.toLowerCase()) && typeof args[key] === "string" && String(args[key]).trim())
  if (title) { out.push(text(null, String(args[title]))); used.add(title) }

  // Où l'action arrive : le dépôt de GitHub se dit « owner/repo », un canal ou un projet même par son identifiant.
  if (typeof args.owner === "string" && typeof args.repo === "string") {
    out.push(text("repository", `${args.owner}/${args.repo}`))
    used.add("owner").add("repo")
  }
  for (const [key, value] of Object.entries(args)) {
    if (used.has(key) || namesSecret(key) || !PLACE_WORD.test(argWords(key))) continue
    if (typeof value === "string" && value.trim()) { out.push(text(argWords(key).replace(/ (id|ids|name|key|slug)$/, ""), value)); used.add(key) }
    else if (typeof value === "number") { out.push(plain(argWords(key).replace(/ (id|ids|name|key|slug)$/, ""), String(value))); used.add(key) }
  }

  // Un montant, dans sa devise quand elle est sûre ; sa devise n'est pas redite à part.
  for (const [key, value] of Object.entries(args)) {
    if (used.has(key) || typeof value !== "number" || !/(^| )amount$/.test(argWords(key))) continue
    const currency = typeof args.currency === "string" ? args.currency : null
    out.push(plain(argWords(key), amountText(value, currency, connector)))
    used.add(key)
    if (currency) used.add("currency")
  }

  for (const [key, value] of Object.entries(args)) {
    if (used.has(key) || identifies(key, value)) continue
    if (typeof value === "string" && value.trim()) out.push(text(argWords(key), value))
    else if (typeof value === "number") out.push(plain(argWords(key), String(value)))
  }
  return out.slice(0, 3)
}

/** Un argument d'une action, tel que « Details » le montre : son nom en mots, sa valeur, ou ses propres lignes. */
export interface ActionArgument {
  /** Le nom tel que l'action l'envoie : il distingue `teamId` de `team_id`, que leurs mots confondent. */
  key: string
  label: string
  /** La valeur en texte, ses retours à la ligne gardés ; vide pour un secret, qui ne se montre pas. */
  value: string
  secret: boolean
  /** Un objet, ou une liste d'objets : ses lignes, nom et valeur. */
  rows: ActionArgument[]
}

/** Au-delà de cette profondeur, un objet se dit sur une ligne. */
const MAX_DEPTH = 3

function argumentRow(key: string, label: string, value: unknown, t: ThreadTexts, depth: number): ActionArgument {
  const row = (text: string, rows: ActionArgument[] = []): ActionArgument => ({ key, label, value: text, secret: false, rows })
  if (namesSecret(key)) return { key, label, value: "", secret: true, rows: [] }
  if (typeof value === "string") return row(value)
  if (typeof value === "boolean") return row(value ? t.valueYes : t.valueNo)
  if (typeof value === "number") return row(String(value))
  if (value === null || value === undefined) return row("")
  if (depth >= MAX_DEPTH) return row(JSON.stringify(value))
  if (Array.isArray(value)) {
    // Une liste de mots se lit « Bug, Checkout » ; une liste d'objets, une ligne par élément, numérotée.
    if (value.every((item) => ["string", "number", "boolean"].includes(typeof item))) {
      return row(value.map((item) => (typeof item === "boolean" ? (item ? t.valueYes : t.valueNo) : String(item))).join(", "))
    }
    return row("", value.map((item, i) => argumentRow(`${key}.${i}`, String(i + 1), item, t, depth + 1)))
  }
  if (isRecord(value)) return row("", rowsOf(value, t, depth + 1, `${key}.`))
  return row(String(value))
}

function rowsOf(args: Record<string, unknown>, t: ThreadTexts, depth: number, prefix: string): ActionArgument[] {
  return Object.entries(args)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => {
      const words = argWords(key)
      return argumentRow(`${prefix}${key}`, words ? words.charAt(0).toUpperCase() + words.slice(1) : key, value, t, depth)
    })
}

/**
 * Les arguments d'une action, un clic plus loin (R160) : chacun avec son nom en mots et sa valeur ; une liste se lit
 * « Bug, Checkout », un objet en lignes, un secret masqué.
 */
export function actionArguments(input: string | null | undefined, t: ThreadTexts): ActionArgument[] {
  const args = argsOf(input)
  return args ? rowsOf(args, t, 0, "") : []
}

/** Le brut d'une action, à deux clics (R133) : le JSON reçu, ses secrets masqués. */
export function actionRaw(input: string | null | undefined, t: ThreadTexts): string | null {
  const args = argsOf(input)
  if (!args) return null
  const mask = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(mask)
    if (!isRecord(value)) return value
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, namesSecret(key) ? t.hiddenValue : mask(inner)]))
  }
  return JSON.stringify(mask(args), null, 2)
}
