import { describe, expect, it } from "vitest"

import type { AssistantAnswer, AssistantRead, AssistantToolCall } from "@/lib/api/assistant-service"
import { CONSTANTS_EN } from "@/lib/constants_en"
import { didWork, outcomeLine, plainOutput, proposalLine, serviceOf, stepLine, toolWords, workedLine, workedTime, workSentences } from "./work-lines"

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
  it.each([["linear__save_issue", "Linear"], ["my-app__x", "My app"], ["create_issue", null], ["__x", null]])("%s : %s", (tool, expected) => {
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
    ["linear__save_issue", "Cortex proposes an action in Linear. Nothing is sent until you approve it."],
  ])("%s", (tool, expected) => {
    expect(proposalLine(tool, t)).toBe(expected)
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

  it("save_document without readable arguments says the general sentence", () => {
    const general = "Cortex proposes to save this document. Nothing changes until you approve it."
    expect(proposalLine("save_document", t, "{not json")).toBe(general)
    expect(proposalLine("save_document", t, JSON.stringify({ title: "x", storage: "box" }))).toBe(general)
    expect(proposalLine("save_document", t, null)).toBe(general)
  })
})
