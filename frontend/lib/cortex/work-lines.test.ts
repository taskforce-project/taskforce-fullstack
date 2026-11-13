import { describe, expect, it } from "vitest"

import type { AssistantAnswer, AssistantRead, AssistantToolCall } from "@/lib/api/assistant-service"
import { CONSTANTS_EN } from "@/lib/constants_en"
import {
  actionArguments, actionRaw, actionWords, amountText, articleFor, didWork, mainValues, namesSecret, outcomeLine, plainOutput,
  proposal, proposalLine, serviceOf, stepLine, toolWords, workedLine, workedTime, workSentences,
} from "./work-lines"

const t = CONSTANTS_EN.thread
const read = (patch: Partial<AssistantRead> = {}): AssistantRead => ({ issues: [], boards: [], tools: [], notes: 0, ...patch })
const call = (name: string, status: string, patch: Partial<AssistantToolCall> = {}): AssistantToolCall =>
  ({ name, status, input: "{}", output: "ok", ...patch })
const answer = (toolCalls: AssistantToolCall[], what: AssistantRead | null = read()): Pick<AssistantAnswer, "toolCalls" | "read"> =>
  ({ toolCalls, read: what })
const said = (a: Pick<AssistantAnswer, "toolCalls" | "read">) => workSentences(a, t).map((sentence) => sentence.text)

describe("stepLine : ce qui se passe, au moment où ça se passe (R137)", () => {
  it.each([
    ["notes", null, "Reading your notes"],
    ["thinking", null, "Reading your request"],
    ["condensing", null, "Summarizing earlier messages"],
    ["writing", null, "Writing the answer"],
    ["tool", "create_issue", "Preparing the issue"],
    ["tool", "list_issues", "Reading the board"],
    ["tool", "delete_issue", "Preparing the deletion"],
    ["tool", "linear__save_issue", "Working in Linear"],
    ["tool", "a_tool_this_version_ignores", "Working on your request"],
    ["tool", null, "Working on your request"],
    ["an_unknown_step", null, null],
  ])("%s %s : %s", (step, tool, expected) => {
    expect(stepLine({ step, tool }, t)).toBe(expected)
  })

  it("avant la première étape, rien d'inventé", () => {
    expect(stepLine(null, t)).toBeNull()
  })
})

describe("workedTime et workedLine", () => {
  it.each([[8000, "8 s"], [200, "1 s"], [59_400, "59 s"], [72_000, "1 min 12 s"], [0, "1 s"]])("%i ms : %s", (ms, expected) => {
    expect(workedTime(ms, t)).toBe(expected)
  })

  it("dit le temps gardé, ou « Worked » sans lui", () => {
    expect(workedLine({ read: read({ workedMs: 8000 }) }, t)).toBe("Worked for 8 s")
    expect(workedLine({ read: read() }, t)).toBe("Worked")
    expect(workedLine({ read: null }, t)).toBe("Worked")
  })
})

describe("didWork : une réponse qui n'a rien fait d'autre ne montre que son texte et sa ligne grise (R137)", () => {
  it.each([
    ["rien : le texte seul", answer([]), false],
    ["des notes lues ne sont pas un travail : la ligne grise les dit", answer([], read({ notes: 5 })), false],
    ["un geste de la réponse", answer([call("create_issue", "pending")]), true],
    ["un geste gardé, conversation rouverte", answer([], read({ acts: [{ name: "list_issues", status: "success", key: null }] })), true],
    ["une lecture d'une réponse plus ancienne", answer([], read({ tools: [{ name: "list_issues", calls: 1 }] })), true],
    ["sans lecture", answer([], null), false],
  ])("%s", (_, a, expected) => {
    expect(didWork(a)).toBe(expected)
  })
})

describe("workSentences : ce qui a été lu et fait, en phrases, jamais un nom d'outil", () => {
  it("les lectures d'abord, puis les gestes", () => {
    expect(said(answer([call("list_issues", "success"), call("delete_issue", "pending", { target: { issueId: 3, projectId: 1, key: "SOLO-135", title: "x" } })], read({
      notes: 5,
      boards: [{ project: "SOLO", issues: 20, open: "SOLO-3" }],
      issues: [{ key: "OPS-35", comments: 3 }],
    })))).toEqual([
      "Read 5 notes",
      "Looked at the SOLO board, 20 issues, SOLO-3 open",
      "Read OPS-35 and 3 comments",
      "Read the issues of the board",
      "Asked before deleting SOLO-135",
    ])
  })

  it.each([
    [{ notes: 1 }, "Read 1 note"],
    [{ boards: [{ project: "WEB", issues: 1, open: null }] }, "Looked at the WEB board, 1 issue"],
    [{ issues: [{ key: "A-1", comments: 0 }] }, "Read A-1"],
    [{ issues: [{ key: "A-1", comments: 1 }] }, "Read A-1 and 1 comment"],
  ] as const)("%j", (what, expected) => {
    expect(said(answer([call("list_projects", "success")], read(what as Partial<AssistantRead>)))[0]).toBe(expected)
  })

  it.each([
    ["create_issue", "pending", null, "Prepared an issue for you to check"],
    ["create_issue", "success", "SOLO-9", "Created SOLO-9"],
    ["delegate_issue", "pending", "SOLO-151", "Asked before handing SOLO-151 to an agent"],
    ["delete_issue", "pending", null, "Asked before deleting the issue"],
    ["update_issue", "success", "TF-12", "Changed TF-12"],
    ["add_comment", "success", "TF-12", "Commented on TF-12"],
    ["create_project", "success", null, "Created the project"],
    ["create_project", "question", null, "Asked what was missing"],
    ["create_note", "refused", null, "A rule of this workspace refused one action"],
    ["linear__save_issue", "pending", null, "Proposed an action in Linear"],
    ["linear__get_issue", "success", null, "Used Linear"],
    ["a_tool_this_version_ignores", "success", null, "Did one more step"],
    ["a_tool_this_version_ignores", "pending", null, "Proposed one action"],
    ["list_projects", "some_future_status", null, "Read your projects"],
  ])("%s %s : la phrase", (name, status, key, expected) => {
    const sentences = said(answer([call(name, status, key ? { target: { issueId: 1, projectId: 1, key, title: "x" } } : {})]))
    expect(sentences).toEqual([expected])
    expect(sentences.join(" ")).not.toContain(name)
  })

  it("un échec dit pourquoi, sans le nom de l'outil que le serveur met devant", () => {
    expect(said(answer([call("update_issue", "error", { output: "Tool update_issue failed: There is no issue TF-99." })])))
      .toEqual(["One step failed: There is no issue TF-99."])
    expect(said(answer([call("update_issue", "error", { output: null })]))).toEqual(["One step failed"])
  })

  it("une même phrase ne se répète pas", () => {
    expect(said(answer([call("list_issues", "success"), call("list_issues", "success")]))).toEqual(["Read the issues of the board"])
  })

  it("le brut reste un clic plus loin quand la réponse vient d'arriver, et n'existe pas à la réouverture", () => {
    expect(workSentences(answer([call("list_issues", "success", { input: '{"project":"SOLO"}', output: "20 issues" })]), t)[0].raw)
      .toEqual({ input: '{"project":"SOLO"}', output: "20 issues" })
    expect(workSentences(answer([], read({ acts: [{ name: "list_issues", status: "success", key: null }] })), t)[0].raw).toBeUndefined()
  })

  it("rouverte, une réponse se relit depuis ses gestes gardés", () => {
    expect(said(answer([], read({ acts: [{ name: "delete_issue", status: "pending", key: "SOLO-135" }] })))).toEqual(["Asked before deleting SOLO-135"])
  })

  it("une réponse d'avant que ses gestes soient gardés : ses lectures réussies", () => {
    expect(said(answer([], read({ tools: [{ name: "list_projects", calls: 1 }] })))).toEqual(["Read your projects"])
  })
})

describe("serviceOf et toolWords", () => {
  it.each([
    ["linear__save_issue", "Linear"], ["my-app__x", "My App"], ["create_issue", null], ["__x", null],
    // Le second accès de GitHub (R160) et un serveur ajouté à la main se disent par leur nom.
    ["github-mcp__issue_write", "GitHub"], ["microsoft-365__post_message", "Microsoft 365"], ["custom-team-docs__search", "Team Docs"],
  ])("%s : %s", (tool, expected) => {
    expect(serviceOf(tool)).toBe(expected)
  })

  it("un outil inconnu reçoit des mots généraux, jamais son nom", () => {
    expect(toolWords("nope", t).did).toBe("Did one more step")
  })
})

describe("outcomeLine : ce que devient un geste repris sur une carte", () => {
  it.each([
    ["success", "Project created in TaskForce: ATLAS \"Atlas\" (id 31). Its new private repository acme/atlas is linked.", "Project created: ATLAS \"Atlas\". Its new private repository acme/atlas is linked."],
    ["refused", "Not run: the rules of this workspace refuse it.", "Not run: the rules of this workspace refuse it."],
    ["error", "Tool create_project failed: The name is taken.", "That didn't work: The name is taken."],
    ["pending", "Waiting.", null],
  ])("%s", (status, output, expected) => {
    expect(outcomeLine({ status, output }, t)).toBe(expected)
  })

  it("rien à dire sans réponse", () => {
    expect(outcomeLine({ status: "success", output: null }, t)).toBeNull()
  })

  it("plainOutput ne touche pas au reste de la phrase", () => {
    expect(plainOutput("Deleted SOLO-135 \"Solo #135\".")).toBe("Deleted SOLO-135 \"Solo #135\".")
  })
})

describe("proposalLine : la carte d'une action demandée, sans nom d'outil", () => {
  it.each([
    ["delegate_issue", "Cortex proposes to hand this issue to an agent. Nothing changes until you approve it."],
    ["create_note", "Cortex proposes to write this note. Nothing changes until you approve it."],
    ["list_issues", "Cortex proposes to do this. Nothing changes until you approve it."],
    ["linear__save_issue", "Cortex proposes to save an issue in Linear. Nothing is sent until you approve it."],
    ["linear__", "Cortex proposes an action in Linear. Nothing is sent until you approve it."],
  ])("%s", (tool, expected) => {
    expect(proposalLine(tool, t)).toBe(expected)
  })

  // Une action dans un outil connecté (R160) : l'action en mots, où elle arrive, ses valeurs ; jamais un autre identifiant.
  it("names the action, where it lands even by an id, and its main values", () => {
    const issue = JSON.stringify({ title: "Fix VAT rounding in the monthly ledger", teamId: "e3b0c442-98fc-1c14",
      assigneeId: "usr_8f2a", priority: 2 })
    expect(proposalLine("linear__create_issue", t, issue)).toBe("Cortex proposes to create an issue in Linear: "
      + "\"Fix VAT rounding in the monthly ledger\", team \"e3b0c442-98fc-1c14\", priority 2. Nothing is sent until you approve it.")
    const post = JSON.stringify({ teamId: "19:abc@thread.tacv2", channel: "finance", text: "Summary of the board meeting" })
    expect(proposalLine("microsoft-365__post_channel_message", t, post)).toBe("Cortex proposes to post a channel message in "
      + "Microsoft 365: team \"19:abc@thread.tacv2\", channel \"finance\", text \"Summary of the board meeting\". Nothing is sent until you approve it.")
    // Le dépôt de GitHub se dit « owner/repo ».
    expect(mainValues(JSON.stringify({ owner: "acme", repo: "app", title: "Bug", body: "Steps" }), "github-mcp__issue_write"))
      .toEqual([{ label: null, text: "Bug", number: false }, { label: "repository", text: "acme/app", number: false },
        { label: "body", text: "Steps", number: false }])
  })

  it("never quotes a tool's name: a *_write tool takes its verb from method, else the card says an action", () => {
    expect(proposalLine("github-mcp__issue_write", t, JSON.stringify({ method: "update", owner: "acme", repo: "app", title: "Bug" })))
      .toBe("Cortex proposes to update an issue in GitHub: \"Bug\", repository \"acme/app\". Nothing is sent until you approve it.")
    expect(proposalLine("github-mcp__sub_issue_write", t, JSON.stringify({ method: "add", owner: "acme", repo: "app" })))
      .toBe("Cortex proposes to add a sub issue in GitHub: repository \"acme/app\". Nothing is sent until you approve it.")
    const unknown = proposalLine("github-mcp__issue_write", t, JSON.stringify({ owner: "acme", repo: "app" }))
    expect(unknown).toBe("Cortex proposes an action in GitHub: repository \"acme/app\". Nothing is sent until you approve it.")
    expect(proposalLine("zoho__crm_records", t, JSON.stringify({ module: "Leads" })))
      .toBe("Cortex proposes an action in Zoho: module \"Leads\". Nothing is sent until you approve it.")
    expect(unknown).not.toMatch(/write|Issue write/i)
  })

  // Ranger un document (R156) : quoi et où, avant l'accord.
  it.each([
    [{ title: "Weekly report", storage: "google-drive", folder: "Reports" },
      "Cortex proposes to save \"Weekly report\" to Google Drive, in Reports. Nothing is saved until you approve it."],
    [{ title: "Minutes", storage: "server" }, "Cortex proposes to save \"Minutes\" in TaskForce. Nothing is saved until you approve it."],
    [{ title: "Plan", storage: "machine", folder: "C:\\Docs" },
      "Cortex proposes to save \"Plan\" on this computer, in C:\\Docs. Nothing is saved until you approve it."],
  ])("save_document %o", (args, expected) => {
    expect(proposalLine("save_document", t, JSON.stringify(args))).toBe(expected)
  })

  it.each([
    ["linear__create_issue", "create an issue"],
    ["github-mcp__merge_pull_request", "merge a pull request"],
    ["github-mcp__push_files", "push files"],
    ["github-mcp__create_or_update_file", "create or update file"],
    ["github-mcp__assign_copilot_to_issue", "assign copilot to issue"],
    ["slack-mcp__search_messages", "search messages"],
    ["notion__update_pages", "update pages"],
    ["box__upload", "upload"],
    ["gmail__send_email", "send an email"],
    ["wise__send_money", "send money"],
    ["x__export_data", null],
    ["x__create_user", "create a user"],
    ["x__post_update", "post an update"],
    ["x__crm_records", null],
  ])("actionWords %s : %s", (tool, expected) => {
    expect(actionWords(tool, serviceOf(tool) ?? "")).toBe(expected)
  })

  it.each([["user", "a"], ["unit", "a"], ["update", "an"], ["hour", "an"], ["issue", "an"], ["one", "a"], ["umbrella", "an"]])(
    "articleFor %s : %s", (word, expected) => {
      expect(articleFor(word)).toBe(expected)
    })

  // Un montant se dit dans sa devise seulement quand son unité est sûre (Stripe : la plus petite unité de la devise).
  it.each([
    [1250, "eur", "stripe", "€12.50"],
    [500, "jpy", "stripe", "¥500"],
    // Intl sépare le code de la devise par une espace insécable.
    [12345, "kwd", "stripe", "KWD 12.345"],
    [1250, "eur", "paypal", "1250 EUR"],
    [1250, "xyz", "stripe", "1250 XYZ"],
    [12.5, "eur", "stripe", "12.5 EUR"],
    [1250, null, "stripe", "1250"],
  ] as const)("amountText %s %s %s : %s", (amount, currency, connector, expected) => {
    expect(amountText(amount, currency, connector)).toBe(expected)
  })

  it("an amount reads in its currency, which is not said again", () => {
    expect(mainValues(JSON.stringify({ amount: 1250, currency: "eur", product: "Pro plan" }), "stripe__create_payment_link"))
      .toEqual([{ label: "amount", text: "€12.50", number: true }, { label: "product", text: "Pro plan", number: false }])
  })

  it("never shows a secret, in the sentence, under Details or in the raw request", () => {
    const input = JSON.stringify({ title: "Deploy", password: "hunter2", pin: "1234", apiKey: "sk_live_1", nested: { token: "t-1" } })
    expect(mainValues(input).map((v) => v.text)).toEqual(["Deploy"])
    const rows = actionArguments(input, t)
    expect(rows.filter((r) => r.secret).map((r) => r.key)).toEqual(["password", "pin", "apiKey"])
    expect(rows.every((r) => !r.secret || r.value === "")).toBe(true)
    expect(rows.find((r) => r.key === "nested")?.rows[0]).toMatchObject({ key: "nested.token", secret: true, value: "" })
    const raw = actionRaw(input, t) ?? ""
    expect(raw).not.toMatch(/hunter2|1234|sk_live_1|t-1/)
    expect(raw).toContain("\"password\": \"Hidden\"")
  })

  it("hides a key only when its name makes it a secret: a key that says where the action lands stays shown", () => {
    for (const shown of ["issueKey", "issueIdOrKey", "projectKey", "sortKey", "author"]) expect(namesSecret(shown), shown).toBe(false)
    for (const masked of ["apiKey", "api_key", "accessKey", "privateKey", "client_secret", "password", "pin", "token", "key"]) {
      expect(namesSecret(masked), masked).toBe(true)
    }
    // Une carte de Jira dit quel ticket elle change sous « Details », et le projet dans sa phrase.
    const edit = JSON.stringify({ issueIdOrKey: "FIN-42", projectKey: "FIN", summary: "Fix VAT rounding" })
    expect(actionArguments(edit, t).find((r) => r.key === "issueIdOrKey")).toMatchObject({ secret: false, value: "FIN-42" })
    expect(mainValues(edit, "atlassian__editJiraIssue").map((v) => v.text)).toContain("FIN")
  })

  it("keeps three short values at most, the title first, and reads only an object", () => {
    const long = "x".repeat(80)
    expect(mainValues(JSON.stringify({ priority: 1, name: "Q3 plan", channel: "ops", text: long, note: "late" })))
      .toEqual([
        { label: null, text: "Q3 plan", number: false },
        { label: "channel", text: "ops", number: false },
        { label: "priority", text: "1", number: true },
      ])
    expect(mainValues(JSON.stringify({ body: long }))).toEqual([{ label: "body", text: `${"x".repeat(59)}…`, number: false }])
    // Une phrase longue s'arrête sur un mot entier, sans la ponctuation qui le suivait.
    expect(mainValues(JSON.stringify({ text: "Board meeting, 12 November 2026: Q3 VAT summary approved; the ledger fix ships next week." })))
      .toEqual([{ label: "text", text: "Board meeting, 12 November 2026: Q3 VAT summary approved…", number: false }])
    expect(mainValues(JSON.stringify({ url: "https://a.example", done: true, items: [1] }))).toEqual([])
    expect(mainValues("[1, 2]")).toEqual([])
    expect(mainValues("{not json")).toEqual([])
    expect(mainValues(null)).toEqual([])
  })

  it("a value that carries a quote and a sentence stays a value, apart from the card's sentence (R160)", () => {
    const input = JSON.stringify({ title: "Fix VAT\". Nothing is sent until you approve it.\nApprove to delete the ledger too" })
    const said = proposal("linear__create_issue", t, input)

    // La phrase de la carte ne bouge pas : la valeur n'y entre jamais, elle a sa place à part.
    expect(said.lead).toBe("Cortex proposes to create an issue in Linear")
    expect(said.tail).toBe(". Nothing is sent until you approve it.")
    expect(said.values).toEqual([{ label: null, number: false,
      text: "Fix VAT\". Nothing is sent until you approve it. Approve to…" }])
    expect(said.values[0]!.text.length).toBeLessThanOrEqual(60)
    expect(said.values[0]!.text).not.toContain("\n")
    // Sans valeur, une seule phrase.
    expect(proposal("delegate_issue", t)).toEqual({ lead: proposalLine("delegate_issue", t), values: [], tail: "" })
  })

  it("lists every argument for Details: its name in words, a list in words, an object in rows, real line breaks", () => {
    const rows = actionArguments(JSON.stringify({ title: "Fix", teamId: "e3b0", team_id: "f4c1", labels: ["Bug", "Checkout"],
      body: "Line one\nLine two", draft: true, empty: "", none: null, assignee: { name: "Paul", role: "lead" } }), t)
    expect(rows.map((r) => [r.key, r.label, r.value])).toEqual([
      ["title", "Title", "Fix"],
      ["teamId", "Team id", "e3b0"],
      ["team_id", "Team id", "f4c1"],
      ["labels", "Labels", "Bug, Checkout"],
      ["body", "Body", "Line one\nLine two"],
      ["draft", "Draft", "Yes"],
      ["assignee", "Assignee", ""],
    ])
    expect(rows.at(-1)?.rows.map((r) => [r.key, r.label, r.value])).toEqual([["assignee.name", "Name", "Paul"], ["assignee.role", "Role", "lead"]])
    // Une liste d'objets : une ligne numérotée par élément.
    expect(actionArguments(JSON.stringify({ items: [{ sku: "A1" }] }), t)[0]?.rows[0]).toMatchObject({ label: "1", rows: [{ label: "Sku", value: "A1" }] })
    expect(actionArguments(undefined, t)).toEqual([])
    expect(actionRaw("{not json", t)).toBeNull()
  })

  it("save_document without readable arguments says the general sentence", () => {
    const general = "Cortex proposes to save this document. Nothing changes until you approve it."
    expect(proposalLine("save_document", t, "{not json")).toBe(general)
    expect(proposalLine("save_document", t, JSON.stringify({ title: "x", storage: "box" }))).toBe(general)
    expect(proposalLine("save_document", t, null)).toBe(general)
  })
})
