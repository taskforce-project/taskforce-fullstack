import type { DeliveryRun, DeliveryRunActivity, DeliveryRunApproval, DeliveryRunEvent } from "@/lib/api/delivery-service"
import type { CONSTANTS_EN } from "@/lib/constants_en"
import { fillText } from "@/lib/delivery/result-card"

// ---------------------------------------------------------------------------
// La mission comme un déroulé (R138, séance n°20) : les événements bruts d'une mission deviennent cinq étapes, toujours
// les mêmes, chacune avec son état, une phrase, et son détail en phrases. Lire et chercher avant le premier geste qui
// change quelque chose, c'est comprendre ; ce que l'agent dit qu'il va faire, c'est prévoir ; écrire, modifier, lancer ce
// qui change, c'est faire ; les tests du projet, c'est vérifier ; le résultat, c'est rendre. Une étape qui n'a pas eu lieu
// le dit d'un mot, elle ne disparaît pas. Aucune phrase ne reprend une commande : la ligne brute reste à part, pour
// l'interrupteur « Show commands » (R133 : une phrase d'abord, le détail à un clic, le brut à deux).
// ---------------------------------------------------------------------------

type SequenceTexts = (typeof CONSTANTS_EN)["missionSequence"]
type GestureKey = keyof SequenceTexts["gestures"]

export type MissionStepKey = "understand" | "plan" | "do" | "check" | "handover"
export type MissionStepState = "not-started" | "in-progress" | "waiting" | "done" | "skipped" | "failed" | "stopped"

const ORDER: readonly MissionStepKey[] = ["understand", "plan", "do", "check", "handover"]

/** Une ligne du détail d'une étape : sa phrase, et ce que l'interrupteur montre derrière (la ligne brute, son heure). */
export interface MissionLine {
  readonly seq: number
  readonly sentence: string
  /** La ligne telle que le runner l'a envoyée ; null quand il n'y a rien de plus que la phrase. */
  readonly raw: string | null
  readonly at: string | null
  readonly failed: boolean
}

export interface MissionStep {
  readonly key: MissionStepKey
  readonly name: string
  readonly state: MissionStepState
  readonly sentence: string
  readonly lines: readonly MissionLine[]
  /** L'étape où en est la mission : celle qui s'ouvre d'elle-même. */
  readonly current: boolean
}

export interface MissionSequence {
  readonly steps: readonly MissionStep[]
  /** Où en est la mission, en une phrase (« Waiting for you: 1 request », « Ready for your review »). */
  readonly status: string
}

/** Ce que le déroulé lit de la mission. */
export type SequencedRun = Pick<DeliveryRun, "status" | "refused" | "outcome" | "tests" | "error" | "issueId" | "issueKey" | "startedByName">

// ---------------------------------------------------------------------------
// Les gestes : ce qu'un appel d'outil veut dire, pour qui ne code pas
// ---------------------------------------------------------------------------

/** Lire, changer quelque chose, prévoir, vérifier ; `neutral` : on ne sait pas s'il change quelque chose, il ne compte pas. */
type Nature = "read" | "change" | "plan" | "test" | "neutral"

interface Gesture {
  readonly key: GestureKey
  readonly nature: Nature
  /** Ce que la phrase nomme : un fichier, une recherche, une adresse. */
  readonly value?: string
}

interface GestureText {
  readonly did: string
  readonly want: string
  readonly many?: string
  /** La phrase quand on ne sait pas nommer ce qu'elle vise. */
  readonly plain?: string
  readonly wantPlain?: string
}

const gesture = (nature: Nature) => (key: GestureKey, value?: string): Gesture => ({ key, nature, value })
const read = gesture("read")
const change = gesture("change")
const plan = gesture("plan")
const test = gesture("test")
const neutral = gesture("neutral")

/** Le dernier morceau d'un chemin : la phrase nomme le fichier, le chemin complet reste derrière l'interrupteur. */
function fileName(path: string): string | undefined {
  return path.split(/[\\/]/).filter(Boolean).pop()?.trim() || undefined
}

function hostOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "") || undefined
  } catch {
    return undefined
  }
}

/** Une valeur de chaîne dans des arguments JSON, même coupés par le runner (il borne chaque ligne). */
function stringArgument(text: string, name: string): string | undefined {
  const match = new RegExp(`"${name}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)`).exec(text)
  if (!match) return undefined
  try {
    return (JSON.parse(`"${match[1]}"`) as string).trim() || undefined
  } catch {
    return match[1].trim() || undefined
  }
}

function numberArgument(text: string, name: string): number | undefined {
  const match = new RegExp(`"${name}"\\s*:\\s*(\\d+)`).exec(text)
  return match ? Number(match[1]) : undefined
}

/** Un autre ticket que celui de la mission, quand l'appel le nomme ; sans nom, c'est le sien. */
function otherIssue(text: string, run: SequencedRun): boolean {
  const id = numberArgument(text, "issueId")
  if (id !== undefined) return id !== run.issueId
  const key = stringArgument(text, "issue")
  return key !== undefined && run.issueKey !== null && key !== run.issueKey
}

/** Les outils du serveur MCP de TaskForce (`TaskforceMcpTools`). */
const TASKFORCE: Readonly<Record<string, (text: string, run: SequencedRun) => Gesture>> = {
  get_issue: (text, run) => read(otherIssue(text, run) ? "readOtherIssue" : "readIssue"),
  list_issues: () => read("listIssues"),
  list_projects: () => read("listProjects"),
  list_issue_statuses: () => read("listStatuses"),
  list_my_issues: () => read("listMyIssues"),
  workspace_kpis: () => read("readHealth"),
  brain_search: (text) => read("searchNotes", stringArgument(text, "query")),
  get_mission: () => read("readMission"),
  smart_assign: () => read("recommend"),
  ask_cortex: () => read("askCortex"),
  add_comment: () => change("comment"),
  create_issue: () => change("createIssue"),
  update_issue: () => change("updateIssue"),
  check_checklist_item: () => change("checkItem"),
  delegate_issue: () => change("delegate"),
  delete_issue: () => change("deleteIssue"),
  create_project: () => change("createProject"),
}

/** Un outil d'un autre serveur : son nom dit parfois s'il lit ou s'il change quelque chose. */
function connectorGesture(tool: string): Gesture {
  if (/^(get|list|search|read|find|fetch|query)/i.test(tool)) return read("connector")
  if (/^(create|update|add|delete|remove|set|move|post|send|write|edit|merge|close|assign)/i.test(tool)) return change("connector")
  return neutral("connector")
}

const WORDS_ONLY = /^[\p{L}\p{N} _.-]{1,60}$/u

const NATIVE: Readonly<Record<string, (text: string) => Gesture>> = {
  Read: (text) => read("readFile", fileName(text)),
  NotebookRead: (text) => read("readFile", fileName(text)),
  Glob: () => read("findFiles"),
  LS: () => read("listFolder"),
  Grep: (text) => read("searchCode", WORDS_ONLY.test(text.trim()) ? text.trim() : undefined),
  WebFetch: (text) => read("openPage", hostOf(text.trim())),
  WebSearch: (text) => read("searchWeb", text.trim() || undefined),
  Write: (text) => change("wroteFile", fileName(text)),
  Edit: (text) => change("editedFile", fileName(text)),
  MultiEdit: (text) => change("editedFile", fileName(text)),
  NotebookEdit: (text) => change("editedFile", fileName(text)),
  TodoWrite: () => plan("todo"),
  ExitPlanMode: () => plan("proposedPlan"),
  Task: () => neutral("helper"),
  Agent: () => neutral("helper"),
  Skill: () => neutral("skill"),
  Bash: (text) => commandGesture(text),
}

// ---------------------------------------------------------------------------
// Une ligne de commande, lue pour savoir ce qu'elle fait : jamais montrée telle quelle
// ---------------------------------------------------------------------------

const TESTS = test("tests")
const CHECK_CODE = test("checkCode")
const BUILD = neutral("build")
const INSTALL = neutral("install")
const HISTORY = read("history")
const SCRIPT = neutral("script")
const COMMAND = neutral("command")
const FOLDERS = read("listFolder")
const LOOK_INSIDE = read("lookInside")
const SEARCH_CODE = read("searchCode")
const DELETED = change("deleted")
const MOVED = change("moved")
const COPIED = change("copied")
const FOLDER = change("folder")
const SAVED = change("saved")
const BRANCH = change("branch")
const REWORKED = change("reworked")
const PUSHED = change("pushed")
const PULL_REQUEST = change("pullRequest")
const SWITCHED = neutral("switchedBranch")

const PROGRAMS: Readonly<Record<string, Gesture>> = {
  vitest: TESTS, jest: TESTS, pytest: TESTS, mocha: TESTS, ava: TESTS, rspec: TESTS, phpunit: TESTS, ctest: TESTS, tox: TESTS, nox: TESTS,
  eslint: CHECK_CODE, ruff: CHECK_CODE, mypy: CHECK_CODE, flake8: CHECK_CODE, pylint: CHECK_CODE, biome: CHECK_CODE,
  ls: FOLDERS, dir: FOLDERS, tree: FOLDERS, pwd: FOLDERS, find: FOLDERS, fd: FOLDERS,
  cat: LOOK_INSIDE, head: LOOK_INSIDE, tail: LOOK_INSIDE, less: LOOK_INSIDE, more: LOOK_INSIDE, type: LOOK_INSIDE, wc: LOOK_INSIDE,
  stat: LOOK_INSIDE, file: LOOK_INSIDE, nl: LOOK_INSIDE, sed: LOOK_INSIDE, awk: LOOK_INSIDE,
  grep: SEARCH_CODE, rg: SEARCH_CODE, ag: SEARCH_CODE, ack: SEARCH_CODE, findstr: SEARCH_CODE,
  rm: DELETED, rmdir: DELETED, del: DELETED, unlink: DELETED,
  mv: MOVED, move: MOVED, ren: MOVED, rename: MOVED,
  cp: COPIED, copy: COPIED, xcopy: COPIED, rsync: COPIED,
  mkdir: FOLDER, md: FOLDER,
  python: SCRIPT, python3: SCRIPT, py: SCRIPT, node: SCRIPT, deno: SCRIPT, ruby: SCRIPT, perl: SCRIPT, php: SCRIPT,
  bash: SCRIPT, sh: SCRIPT, zsh: SCRIPT, pwsh: SCRIPT, powershell: SCRIPT, cmd: SCRIPT,
}

/** Les outils à sous-commandes : le mot qui suit dit ce qu'ils font ; le premier du tableau qui apparaît l'emporte. */
const MAVEN = { test: TESTS, verify: TESTS, package: BUILD, compile: BUILD, install: BUILD }
const GRADLE = { test: TESTS, check: TESTS, build: BUILD, assemble: BUILD }
const SUBCOMMANDS: Readonly<Record<string, Readonly<Record<string, Gesture>>>> = {
  mvn: MAVEN, mvnw: MAVEN, gradle: GRADLE, gradlew: GRADLE,
  go: { test: TESTS, vet: CHECK_CODE, build: BUILD },
  cargo: { test: TESTS, clippy: CHECK_CODE, check: CHECK_CODE, build: BUILD, fetch: INSTALL },
  dotnet: { test: TESTS, build: BUILD, restore: INSTALL },
  make: { test: TESTS, check: TESTS, build: BUILD },
  playwright: { test: TESTS },
  cypress: { run: TESTS },
  pip: { install: INSTALL }, pip3: { install: INSTALL },
  poetry: { install: INSTALL, add: INSTALL },
  uv: { sync: INSTALL, add: INSTALL, pip: INSTALL },
  bundle: { install: INSTALL },
  composer: { test: TESTS, install: INSTALL, require: INSTALL },
}

const GIT: Readonly<Record<string, Gesture>> = {
  status: HISTORY, log: HISTORY, diff: HISTORY, show: HISTORY, blame: HISTORY, "ls-files": HISTORY, "rev-parse": HISTORY, remote: HISTORY,
  fetch: HISTORY, add: SAVED, commit: SAVED, push: PUSHED, merge: REWORKED, rebase: REWORKED, pull: REWORKED, reset: REWORKED,
  restore: REWORKED, stash: REWORKED, "cherry-pick": REWORKED, revert: REWORKED, apply: REWORKED, am: REWORKED,
}

const WRAPPERS = new Set(["sudo", "time", "env", "npx", "command", "exec", "nohup", "uvx", "bunx", "pnpx"])
const NOISE = new Set(["cd", "echo", "printf", "true", "false", "sleep", "exit", "set", "export", "clear", ":", "pushd", "popd", "source", "."])
const PACKAGE_MANAGERS = new Set(["npm", "pnpm", "yarn", "bun"])

/** Les commandes simples d'une ligne (`&&`, `||`, `;`, `|`), hors des guillemets : un texte entre guillemets n'en sépare pas. */
function simpleCommands(line: string): string[] {
  const parts: string[] = []
  let current = ""
  let quote: string | null = null
  for (let i = 0; i < line.length; i++) {
    const char = line.charAt(i)
    if (quote) {
      if (char === quote) quote = null
      current += char
    } else if (char === "\"" || char === "'") {
      quote = char
      current += char
    } else if (char === ";" || char === "|" || char === "\n" || (char === "&" && line.charAt(i + 1) === "&")) {
      parts.push(current)
      current = ""
      if (char === "&" || (char === "|" && line.charAt(i + 1) === "|")) i++
    } else {
      current += char
    }
  }
  parts.push(current)
  return parts.map((part) => part.trim()).filter(Boolean)
}

/** Le fichier qu'une redirection écrit ; null sans redirection, ou vers nulle part. Les textes entre guillemets n'en sont pas. */
function redirectTarget(part: string): string | null {
  const bare = part.replace(/"[^"]*"|'[^']*'/g, "_").replace(/["'].*$/, "")
  const match = /(?<![\d&])>>?\s*([^\s&|;<>]+)/.exec(bare)
  return match && !/^(\/dev\/null|nul|\$null)$/i.test(match[1]) ? match[1] : null
}

function packageGesture(args: readonly string[]): Gesture {
  const script = args[0] === "run" || args[0] === "run-script" ? args[1] : args[0]
  if (script === undefined || /^(i|install|ci|add)$/.test(script)) return INSTALL
  if (/^(t|test)(:|$)/.test(script)) return TESTS
  if (/^(lint|typecheck|type-check|check-types|check)(:|$)/.test(script)) return CHECK_CODE
  if (/^build(:|$)/.test(script)) return BUILD
  return SCRIPT
}

function gitGesture(args: readonly string[]): Gesture {
  const sub = args[0] ?? ""
  if (sub === "checkout" || sub === "switch") return args.some((arg) => /^-[bcBC]$/.test(arg)) ? BRANCH : SWITCHED
  if (sub === "branch") return args.length > 1 && !args[1].startsWith("-") ? BRANCH : HISTORY
  return GIT[sub] ?? COMMAND
}

function githubGesture(args: readonly string[]): Gesture {
  if (args[0] === "pr" && args[1] === "create") return PULL_REQUEST
  return args.some((arg) => /^(view|list|status|diff|checks|watch)$/.test(arg)) ? read("github") : neutral("github")
}

function pythonGesture(args: readonly string[]): Gesture {
  const launched = args.indexOf("-m") >= 0 ? args[args.indexOf("-m") + 1] : undefined
  if (launched === "pytest" || launched === "unittest") return TESTS
  if (launched === "mypy" || launched === "ruff" || launched === "flake8" || launched === "pylint") return CHECK_CODE
  return launched === "pip" ? INSTALL : SCRIPT
}

/** Ce que fait une commande simple ; null pour ce qui ne fait rien de notable (`cd`, `echo`). */
function partGesture(part: string): Gesture | null {
  // Un mot entre guillemets reste un mot : un programme dans « Program Files », le texte d'un `python -c`.
  const words = part.match(/"[^"]*"|'[^']*'|\S+/g) ?? []
  let start = 0
  while (start < words.length && (/^\w+=/.test(words[start]) || WRAPPERS.has(words[start]))) start++
  const program = (words[start] ?? "").replace(/^["']|["']$/g, "").split(/[\\/]/).pop()?.toLowerCase().replace(/\.(exe|cmd|bat|ps1)$/, "") ?? ""
  const args = words.slice(start + 1)
  const target = redirectTarget(part)
  if (target) return change("wroteFile", target === "_" ? undefined : fileName(target))
  if (!program || NOISE.has(program)) return null
  if (PACKAGE_MANAGERS.has(program)) return packageGesture(args)
  if (program === "git") return gitGesture(args)
  if (program === "gh") return githubGesture(args)
  if (program === "python" || program === "python3" || program === "py") return pythonGesture(args)
  if (program === "node" && args.includes("--test")) return TESTS
  if (program === "tsc") return args.includes("--noEmit") ? CHECK_CODE : BUILD
  if ((program === "prettier" || program === "black") && args.includes("--check")) return CHECK_CODE
  if (program === "sed" && args.some((arg) => arg.startsWith("-i"))) return change("editedFile")
  if (program === "touch") return change("wroteFile", fileName(args.at(-1) ?? ""))
  const table = SUBCOMMANDS[program]
  if (table) {
    for (const [word, found] of Object.entries(table)) if (args.includes(word)) return found
    return COMMAND
  }
  return PROGRAMS[program] ?? COMMAND
}

const RANK: Readonly<Record<Nature, number>> = { test: 3, change: 2, plan: 1, read: 1, neutral: 1 }

/** Le geste d'une ligne de commande : ses tests d'abord, puis ce qu'elle change, sinon le premier de ses morceaux. */
function commandGesture(line: string): Gesture {
  let best: Gesture | null = null
  for (const part of simpleCommands(line)) {
    const found = partGesture(part)
    if (found && (best === null || RANK[found.nature] > RANK[best.nature])) best = found
  }
  return best ?? COMMAND
}

function toolGesture(tool: string, text: string, run: SequencedRun): Gesture {
  const native = NATIVE[tool]
  if (native) return native(text)
  // L'agent de TaskForce appelle ses outils sans préfixe ; le runner préfixe ceux du serveur MCP par son nom.
  const mcp = /^([^:]+): (.+)$/.exec(tool)
  const name = mcp ? mcp[2] : tool
  if (!mcp || mcp[1] === "taskforce") {
    const known = TASKFORCE[name]
    if (known) return known(text, run)
    if (mcp) return neutral("usedTaskforce")
    return neutral("tool")
  }
  return connectorGesture(name)
}

/** Les demandes que le runner pose lui-même : leur outil n'en est pas un, c'est le nom de ce qu'il veut faire. */
const RUNNER_REQUESTS: Readonly<Record<string, { readonly gesture: Gesture; readonly step: MissionStepKey }>> = {
  "Start the mission": { gesture: neutral("startMission"), step: "understand" },
  "Run the project's tests": { gesture: TESTS, step: "check" },
  "git push": { gesture: PUSHED, step: "handover" },
  "gh pr create": { gesture: PULL_REQUEST, step: "handover" },
}

function requestGesture(approval: Pick<DeliveryRunApproval, "tool" | "summary">, run: SequencedRun): Gesture {
  return RUNNER_REQUESTS[approval.tool]?.gesture ?? toolGesture(approval.tool, approval.summary, run)
}

function didOf(g: Gesture, t: SequenceTexts): string {
  const text: GestureText = t.gestures[g.key]
  return g.value ? fillText(text.did, { value: g.value }) : (text.plain ?? text.did)
}

function wantOf(g: Gesture, t: SequenceTexts): string {
  const text: GestureText = t.gestures[g.key]
  return g.value ? fillText(text.want, { value: g.value }) : (text.wantPlain ?? text.want)
}

const capitalized = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1)
const lowered = (text: string): string => text.charAt(0).toLowerCase() + text.slice(1)

/** Une action demandée, en mots : « Run a script ». La demande en attente la montre à la place de la commande. */
export function requestWords(approval: Pick<DeliveryRunApproval, "tool" | "summary">, run: SequencedRun, t: SequenceTexts): string {
  return capitalized(wantOf(requestGesture(approval, run), t))
}

/** La même, à la suite d'une phrase : « Claude Code wants to run a script ». */
export function requestWant(approval: Pick<DeliveryRunApproval, "tool" | "summary">, run: SequencedRun, t: SequenceTexts): string {
  return wantOf(requestGesture(approval, run), t)
}

// ---------------------------------------------------------------------------
// Les événements, placés dans leur étape
// ---------------------------------------------------------------------------

interface Placed {
  readonly step: MissionStepKey
  readonly line: MissionLine
  readonly gesture: Gesture | null
}

/** L'agent écrit en Markdown ; une phrase du détail n'en garde pas les marques. */
function plainWords(text: string): string {
  return text.replace(/[*`]+/g, "").replace(/^#+\s*/, "").replace(/\s+/g, " ").trim()
}

function sentencesOf(text: string): string[] {
  return plainWords(text).split(/(?<=[.!?])\s+/).filter(Boolean)
}

/** Une phrase où l'agent annonce ce qu'il va produire, pas seulement ce qu'il va regarder. */
const ANNOUNCES = /\b(?:I['’]ll|I will|I['’]m going to|I am going to|My plan|Je vais)\b/i
const ONLY_LOOKS =
  /\b(?:I['’]ll|I will|I['’]m going to|I am going to|Je vais)\s+(?:first\s+|now\s+|start\s+by\s+|begin\s+by\s+)?(?:look|read|check|search|see|find|get|fetch|review|examine|inspect|explore|verify|open|understand|getting|searching|reading|looking|commencer|regarder|lire|vérifier|chercher)/i

const announcesWork = (sentence: string): boolean => ANNOUNCES.test(sentence) && !ONLY_LOOKS.test(sentence)

/** Le dernier message de l'agent, quand la mission a rendu : aucun outil après lui. */
function finalWordsSeq(run: SequencedRun, events: readonly DeliveryRunEvent[]): number | null {
  if (run.status !== "DONE") return null
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].kind === "tool") return null
    if (events[i].kind === "text") return events[i].seq
  }
  return null
}

const rawOf = (event: DeliveryRunEvent): string => [event.tool, event.text].filter(Boolean).join(" ")

function testLine(text: string, t: SequenceTexts): string {
  if (/^Tests passed/i.test(text)) return t.tests.passed
  if (/^Tests failed/i.test(text)) return t.tests.failed
  if (/^Tests not run/i.test(text)) return t.tests.notRun
  if (/^Tests stopped/i.test(text)) return t.tests.tookTooLong
  return t.gestures.tests.did
}

function exitLine(event: DeliveryRunEvent, t: SequenceTexts): string {
  const allowed = /^allowed/i.test(event.text)
  const push = event.tool === "git push"
  if (allowed) return push ? t.gestures.pushed.did : t.gestures.pullRequest.did
  return push ? t.lines.pushRefused : t.lines.pullRequestRefused
}

interface Reading {
  readonly placed: readonly Placed[]
  /** Un premier geste qui change quelque chose a eu lieu. */
  readonly wrote: boolean
  /** L'agent a dit ce qu'il va produire, après avoir lu : le travail de compréhension a laissé place au plan. */
  readonly planned: boolean
}

function byNature(nature: Nature, wrote: boolean): MissionStepKey {
  if (nature === "test") return "check"
  if (nature === "change" || wrote) return "do"
  return nature === "plan" ? "plan" : "understand"
}

function readEvents(run: SequencedRun, events: readonly DeliveryRunEvent[], t: SequenceTexts): Reading {
  const finalWords = finalWordsSeq(run, events)
  const placed: Placed[] = []
  let wrote = false
  let hasRead = false
  let planned = false

  const place = (event: DeliveryRunEvent, step: MissionStepKey, sentence: string, g: Gesture | null, failed = false): void => {
    placed.push({ step, gesture: g, line: { seq: event.seq, sentence, raw: rawOf(event) || null, at: event.at, failed } })
  }

  for (const event of events) {
    const previous = placed.at(-1)?.step ?? "understand"
    switch (event.kind) {
      case "start":
        place(event, "understand", t.gestures.started.did, neutral("started"))
        break
      case "text":
        if (event.seq === finalWords) {
          place(event, "handover", t.lines.finalWords, null)
        } else {
          if (!wrote && hasRead && sentencesOf(event.text).some(announcesWork)) planned = true
          place(event, wrote ? "do" : "plan", plainWords(event.text), null)
        }
        break
      case "tool": {
        const g = toolGesture(event.tool ?? "", event.text, run)
        place(event, byNature(g.nature, wrote), didOf(g, t), g)
        if (g.nature === "change") wrote = true
        if (g.nature === "read" || g.nature === "neutral") hasRead = true
        if (g.nature === "plan" && !wrote) planned = true
        break
      }
      case "denied": {
        const g = toolGesture(event.tool ?? "", "", run)
        place(event, byNature(g.nature, wrote), fillText(t.lines.denied, { want: wantOf(g, t) }), null, true)
        break
      }
      case "test":
        place(event, "check", testLine(event.text, t), null, /^Tests (failed|stopped)/i.test(event.text))
        break
      case "exit":
        place(event, "handover", exitLine(event, t), null)
        break
      case "error":
        place(event, previous, t.lines.failed, null, true)
        break
      case "limit":
        place(event, previous, t.lines.limit, null)
        break
      default:
        place(event, previous, t.lines.other, null)
    }
  }
  return { placed, wrote, planned }
}

// ---------------------------------------------------------------------------
// Les phrases d'une étape
// ---------------------------------------------------------------------------

function joined(phrases: readonly string[], t: SequenceTexts): string {
  if (phrases.length < 2) return phrases[0] ?? ""
  return `${phrases.slice(0, -1).join(", ")}${t.and}${phrases[phrases.length - 1]}`
}

const MAX_PHRASES = 3

/** Ce qu'une étape a fait, en une phrase : un même geste compté, ce qui change avant ce qu'on ne sait pas dire. */
function summaryOf(placed: readonly Placed[], t: SequenceTexts): string {
  const groups = new Map<GestureKey, { gesture: Gesture; times: number; values: Set<string> }>()
  for (const { gesture: g } of placed) {
    if (!g) continue
    const group = groups.get(g.key) ?? { gesture: g, times: 0, values: new Set<string>() }
    group.times++
    if (g.value) group.values.add(g.value)
    groups.set(g.key, group)
  }
  const all = [...groups.values()]
  const telling = all.filter((group) => group.gesture.nature !== "neutral")
  const phrases = (telling.length > 0 ? telling : all).slice(0, MAX_PHRASES).map((group, index) => {
    const count = group.values.size > 0 ? group.values.size : group.times
    const text: GestureText = t.gestures[group.gesture.key]
    const phrase = count > 1 && text.many ? fillText(text.many, { count }) : didOf(group.gesture, t)
    return index === 0 ? phrase : lowered(phrase)
  })
  return joined(phrases, t)
}

/** Ce que l'agent a dit qu'il allait faire : sa dernière annonce, sinon le début de sa dernière phrase. */
function intentOf(placed: readonly Placed[], t: SequenceTexts): string {
  for (let i = placed.length - 1; i >= 0; i--) {
    if (placed[i].gesture) continue
    const announced = sentencesOf(placed[i].line.sentence).filter(announcesWork).at(-1)
    if (announced) return announced
  }
  const lastWords = [...placed].reverse().find((entry) => !entry.gesture)
  return lastWords ? (sentencesOf(lastWords.line.sentence)[0] ?? lastWords.line.sentence) : summaryOf(placed, t)
}

function testsWords(run: SequencedRun, t: SequenceTexts): string | null {
  const tests = run.tests
  if (!tests) return null
  if (!tests.ran) return t.tests.notRun
  const counted = tests.passedCount != null && tests.total != null
  if (tests.passed) return counted ? fillText(t.tests.passedCount, { passed: tests.passedCount as number, total: tests.total as number }) : t.tests.passed
  return counted ? fillText(t.tests.failedCount, { passed: tests.passedCount as number, total: tests.total as number }) : t.tests.failed
}

const testsFailed = (run: SequencedRun): boolean => run.tests?.ran === true && !run.tests.passed
const stoppedByPerson = (run: SequencedRun): boolean => run.outcome === "STOPPED"

const delegatorOf = (run: SequencedRun, t: SequenceTexts): string => run.startedByName?.trim() || t.requests.theDelegator

function outcomeWords(run: SequencedRun, t: SequenceTexts, you: boolean): string {
  switch (run.outcome) {
    case "APPLIED": return t.status.applied
    case "DISCARDED": return t.status.discarded
    case "MARKED_DONE": return t.status.markedDone
    case "RETRIED": return t.status.retried
    case "FOLLOWED_UP": return t.status.followedUp
    default: return you ? t.status.review : fillText(t.status.reviewOther, { who: delegatorOf(run, t) })
  }
}

function stateOf(key: MissionStepKey, current: MissionStepKey, happened: boolean, run: SequencedRun, waitingHere: boolean): MissionStepState {
  if (run.refused || run.status === "QUEUED") return "not-started"
  const index = ORDER.indexOf(key)
  const at = ORDER.indexOf(current)
  if (run.status === "DONE") {
    if (key === "handover") return run.outcome ? "done" : "waiting"
    if (key === "check" && testsFailed(run)) return "failed"
    if (key === "check" && run.tests?.ran === false) return "skipped"
    return happened ? "done" : "skipped"
  }
  if (run.status === "FAILED") {
    if (key === current) return stoppedByPerson(run) ? "stopped" : "failed"
    return index < at && happened ? "done" : "skipped"
  }
  if (key === current) return waitingHere ? "waiting" : "in-progress"
  if (index < at) return happened ? "done" : "skipped"
  // De retour au travail après une vérification : la vérification a eu lieu, le reste n'a pas commencé.
  return key === "check" && happened ? "done" : "not-started"
}

interface StepFacts {
  readonly key: MissionStepKey
  readonly state: MissionStepState
  readonly placed: readonly Placed[]
  readonly reached: boolean
  readonly request: DeliveryRunApproval | undefined
  readonly you: boolean
}

function doneSentence({ key, placed, you }: StepFacts, run: SequencedRun, t: SequenceTexts): string {
  switch (key) {
    case "plan": return intentOf(placed, t)
    case "check": return testsWords(run, t) ?? summaryOf(placed, t)
    case "handover": return outcomeWords(run, t, you)
    default: return summaryOf(placed, t)
  }
}

function sentenceOf(facts: StepFacts, run: SequencedRun, t: SequenceTexts): string {
  const { key, state, placed, reached, request } = facts
  switch (state) {
    case "not-started":
      return t.states["not-started"]
    case "skipped":
      if (key === "check" && run.tests?.ran === false) return t.tests.notRun
      return reached || key === "handover" ? t.skipped[key] : t.notReached
    case "waiting":
      return request ? fillText(t.wants, { want: wantOf(requestGesture(request, run), t) }) : outcomeWords(run, t, facts.you)
    case "failed":
      return key === "check" && testsFailed(run) ? (testsWords(run, t) as string) : t.failedHere
    case "stopped":
      return t.stoppedHere
    case "in-progress":
      if (key === "plan") return intentOf(placed, t)
      return placed.at(-1)?.line.sentence ?? t.starting
    default:
      return doneSentence(facts, run, t)
  }
}

/** Un échec dit ce qui s'est passé et quoi faire : la raison telle qu'elle arrive, et la suite quand elle ne la dit pas (R133). */
function failureWords(error: string | null, t: SequenceTexts): string {
  if (!error) return t.status.failedNoReason
  const reason = /[.!?]$/.test(error.trim()) ? error.trim() : `${error.trim()}.`
  const said = fillText(t.status.failed, { reason })
  return /\bagain\b/i.test(reason) ? said : `${said}${t.status.failedNext}`
}

function statusOf(run: SequencedRun, pending: readonly DeliveryRunApproval[], current: MissionStepKey, t: SequenceTexts, you: boolean): string {
  const s = t.status
  switch (run.status) {
    case "QUEUED":
      return s.queued
    case "RUNNING":
      if (pending.length === 0) return s.working[current]
      if (pending.some((approval) => approval.canDecide)) {
        return pending.length === 1 ? s.waitingOne : fillText(s.waitingMany, { count: pending.length })
      }
      return fillText(pending.length === 1 ? s.waitingOtherOne : s.waitingOtherMany, { who: delegatorOf(run, t), count: pending.length })
    case "DONE":
      return outcomeWords(run, t, you)
    default:
      if (run.refused) return run.error ? fillText(s.notStarted, { reason: run.error }) : t.states["not-started"]
      if (stoppedByPerson(run)) return you ? s.stoppedByYou : fillText(s.stoppedBy, { who: delegatorOf(run, t) })
      return failureWords(run.error, t)
  }
}

/** Le déroulé d'une mission. `you` : la personne qui regarde est celle qui a délégué. */
export function missionSequence(
  run: SequencedRun,
  activity: Pick<DeliveryRunActivity, "events" | "approvals"> | undefined,
  t: SequenceTexts,
  you = true,
): MissionSequence {
  const { placed, wrote, planned } = readEvents(run, activity?.events ?? [], t)
  const pending = run.status === "RUNNING" ? (activity?.approvals ?? []).filter((approval) => approval.status === "PENDING") : []
  const request = pending[0]
  const asked = request ? (RUNNER_REQUESTS[request.tool]?.step ?? byNature(requestGesture(request, run).nature, wrote)) : null

  const lastStep = placed.at(-1)?.step
  const current: MissionStepKey = asked
    ?? (run.status === "DONE" ? "handover"
      : !lastStep || lastStep === "understand" || lastStep === "plan" ? (planned ? "plan" : "understand")
      : lastStep)

  const steps = ORDER.map((key): MissionStep => {
    const own = placed.filter((entry) => entry.step === key)
    const waitingHere = asked === key
    const state = stateOf(key, current, own.length > 0, run, waitingHere)
    const reached = ORDER.indexOf(key) < ORDER.indexOf(current) || run.status === "DONE"
    return {
      key,
      name: t.steps[key],
      state,
      sentence: sentenceOf({ key, state, placed: own, reached, request: waitingHere ? request : undefined, you }, run, t),
      lines: own.map((entry) => entry.line),
      current: key === current,
    }
  })
  return { steps, status: statusOf(run, pending, current, t, you) }
}

/** Une même phrase de suite ne se lit qu'une fois, avec son nombre : quatre commentaires, une ligne. */
export function collapseRepeats(lines: readonly MissionLine[]): { line: MissionLine; times: number }[] {
  const out: { line: MissionLine; times: number }[] = []
  for (const line of lines) {
    const last = out.at(-1)
    if (last && last.line.sentence === line.sentence && last.line.failed === line.failed) last.times++
    else out.push({ line, times: 1 })
  }
  return out
}

// ---------------------------------------------------------------------------
// Les accords : ce qui a été permis, en phrases
// ---------------------------------------------------------------------------

/** « Ran a script: allowed by you for this mission » ; la commande reste derrière l'interrupteur (R133). */
export function approvalLine(approval: DeliveryRunApproval, run: SequencedRun, t: SequenceTexts, you = false): MissionLine {
  const g = requestGesture(approval, run)
  const r = t.requests
  const who = you ? r.you : (approval.decidedBy ?? r.theDelegator)
  const sentence = approval.status === "ALLOWED"
    ? fillText(approval.scope === "MISSION" ? r.allowedForMission : r.allowed, { did: didOf(g, t), who })
    : approval.status === "DENIED"
      ? fillText(r.refused, { want: wantOf(g, t), who })
      : approval.status === "EXPIRED"
        ? fillText(r.noAnswer, { want: wantOf(g, t) })
        : fillText(t.wants, { want: wantOf(g, t) })
  return {
    seq: approval.id,
    sentence,
    raw: [approval.tool, approval.summary].filter(Boolean).join(" ") || null,
    at: approval.decidedAt ?? approval.createdAt,
    failed: false,
  }
}

/** Les accords en une phrase : « 2 requests, allowed by you ». */
export function approvalsSentence(approvals: readonly DeliveryRunApproval[], t: SequenceTexts, you = false): string {
  const r = t.requests
  const count = approvals.length
  const allowed = approvals.filter((approval) => approval.status === "ALLOWED")
  if (allowed.length === count) {
    const who = you ? r.you : (allowed[0]?.decidedBy ?? r.theDelegator)
    return fillText(count === 1 ? r.oneAllowed : r.manyAllowed, { count, who })
  }
  if (allowed.length === 0) return fillText(count === 1 ? r.oneRefused : r.manyRefused, { count })
  return fillText(r.mixed, { count, allowed: allowed.length, refused: count - allowed.length })
}

// ---------------------------------------------------------------------------
// Le modèle de la mission, pour l'en-tête
// ---------------------------------------------------------------------------

/** « claude-opus-5 » se dit « Opus 5 » ; un autre modèle garde son nom. */
function modelName(id: string): string {
  const match = /^claude-([a-z]+)-(\d+(?:-\d{1,2})?)(?:-\d{8})?$/i.exec(id)
  return match ? `${capitalized(match[1])} ${match[2].replace("-", ".")}` : id
}

/** Le modèle qui a vraiment travaillé (Claude Code le dit en démarrant), sinon celui demandé ; null sans l'un ni l'autre. */
export function missionModel(run: Pick<DeliveryRun, "model">, events: readonly DeliveryRunEvent[]): string | null {
  const started = events.find((event) => event.kind === "start")
  const said = started ? /\bstarted with (\S+)/.exec(started.text)?.[1] : undefined
  const id = said ?? run.model
  return id ? modelName(id) : null
}
