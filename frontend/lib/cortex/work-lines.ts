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
 * en mots et ses valeurs principales (R160) : « Cortex proposes to create an issue in Linear: "…" ».
 */
export function proposal(tool: string, t: ThreadTexts, input?: string | null): Proposal {
  const sentence = (lead: string): Proposal => ({ lead, values: [], tail: "" })
  if (tool === "save_document") {
    const save = saveProposal(input, t)
    if (save) return sentence(save)
  }
  const service = serviceOf(tool)
  if (service) {
    const action = actionWords(tool, service, t)
    if (!action) return sentence(fillText(t.proposesExternal, { service }))
    const [lead, tail = ""] = fillText(t.proposesExternalAction, { action, service, values: VALUES_SLOT }).split(VALUES_SLOT)
    return { lead, values: mainValues(input), tail }
  }
  return sentence(fillText(t.proposes, { what: toolWords(tool, t).proposes ?? t.proposesThis }))
}

// ---------------------------------------------------------------------------
// L'action d'un outil connecté, en mots (R160) : son verbe et ce sur quoi elle porte, ses valeurs principales, puis ses
// arguments un clic plus loin. Jamais le nom technique au premier regard (R133).
// ---------------------------------------------------------------------------

/** Les verbes d'une action qui porte sur une chose : « create an issue », « post a channel message ». */
const ACT_VERBS = new Set([
  "add", "approve", "archive", "assign", "book", "cancel", "close", "comment", "create", "delete", "draft", "edit",
  "fork", "invite", "merge", "move", "open", "post", "publish", "reject", "remove", "rename", "reply", "request", "run",
  "save", "schedule", "send", "set", "share", "start", "stop", "submit", "trigger", "update", "upload", "write",
])
/** Ces verbes lisent ou cherchent : sans article (« search code », « list issues »). */
const BARE_VERBS = new Set(["search", "list", "get", "read", "fetch", "find", "query", "look"])
const NO_ARTICLE = new Set(["a", "an", "the", "or", "and", "to", "from", "in", "on", "of", "for", "my", "your", "all", "each"])

/**
 * L'action d'un outil externe en mots : `linear__create_issue` donne « create an issue », `slack__search_messages`
 * « search messages » ; un nom qui ne commence pas par un verbe connu se dit `use "Issue write"`. Vide sans nom.
 */
export function actionWords(tool: string, service: string, t: ThreadTexts): string {
  const label = toolLabel(tool.slice(tool.indexOf("__") + 2), service).trim()
  if (!label) return ""
  const [first, ...rest] = label.split(" ")
  const verb = first.toLowerCase()
  if (BARE_VERBS.has(verb) || (ACT_VERBS.has(verb) && rest.length === 0)) return [verb, ...rest].join(" ")
  if (!ACT_VERBS.has(verb)) return fillText(t.proposesUse, { action: label })
  const last = rest[rest.length - 1]
  const plural = /s$/i.test(last) && !/ss$/i.test(last)
  const article = !plural && rest.length <= 2 && !NO_ARTICLE.has(rest[0].toLowerCase()) && !/^\d/.test(rest[0])
    ? (/^[aeiou]/i.test(rest[0]) ? "an " : "a ")
    : ""
  return `${verb} ${article}${rest.join(" ")}`
}

/** Les arguments d'un geste, quand ils se lisent : un objet JSON, sinon null. */
function argsOf(input: string | null | undefined): Record<string, unknown> | null {
  if (!input) return null
  try {
    const args: unknown = JSON.parse(input)
    return args && typeof args === "object" && !Array.isArray(args) ? (args as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** Le nom d'un argument en mots : `assigneeId` donne « assignee id », `due_date` « due date ». */
function argWords(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/[\s_\-.]+/).filter(Boolean).map((w) => w.toLowerCase()).join(" ")
}

const TITLE_KEYS = new Set(["title", "name", "subject", "summary"])
const ID_WORD = /(^| )(id|ids|uuid|guid|token|cursor|url|uri|href|key|secret|password)$/

/** Une valeur qui identifie plutôt qu'elle ne dit : un id, une adresse, un jeton opaque (« e3b0c442-98fc-1c14 »). */
function identifies(key: string, value: unknown): boolean {
  if (ID_WORD.test(argWords(key))) return true
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

/**
 * Ce que l'action dit d'elle au premier regard : son titre, puis des valeurs courtes avec leur nom (« priority 2 »,
 * « channel "finance" »), trois au plus, jamais un identifiant ; chacune sur une ligne, 60 caractères au plus.
 */
export function mainValues(input: string | null | undefined): ProposalValue[] {
  const args = argsOf(input)
  if (!args) return []
  const said = Object.entries(args)
    .filter(([, value]) => (typeof value === "string" && value.trim() !== "") || typeof value === "number")
    .filter(([key, value]) => !identifies(key, value))
  const valueOf = (label: string | null, value: unknown): ProposalValue =>
    typeof value === "number" ? { label, text: String(value), number: true } : { label, text: short(String(value)), number: false }
  const title = said.find(([key]) => TITLE_KEYS.has(key.toLowerCase()))
  const others = said.filter((entry) => entry !== title)
  return [
    ...(title ? [valueOf(null, title[1])] : []),
    ...others.map(([key, value]) => valueOf(argWords(key), value)),
  ].slice(0, 3)
}

/** Un argument d'une action, tel que « Details » le montre : son nom en mots, sa valeur. */
export interface ActionArgument {
  label: string
  value: string
}

/** Les arguments d'une action, un clic plus loin (R160) : chacun avec son nom en mots et sa valeur entière. */
export function actionArguments(input: string | null | undefined): ActionArgument[] {
  const args = argsOf(input)
  if (!args) return []
  return Object.entries(args)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => {
      const words = argWords(key)
      return {
        label: words ? words.charAt(0).toUpperCase() + words.slice(1) : key,
        value: typeof value === "string" ? value : JSON.stringify(value),
      }
    })
}
