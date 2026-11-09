import { describe, expect, it } from "vitest"

import type { AssistantRead } from "@/lib/api/assistant-service"
import { CONSTANTS_EN } from "@/lib/constants_en"
import { greyLine, inASentence, readLine, readPieces } from "./read-line"

const c = CONSTANTS_EN.conversation
const t = CONSTANTS_EN.thread
const read = (patch: Partial<AssistantRead>): AssistantRead => ({ issues: [], boards: [], tools: [], notes: 0, ...patch })
const line = (model: string | null, what: AssistantRead | null) => readLine(greyLine(model, what, c, t), c)

/** La ligne grise sous chaque réponse (R123, R137) : le modèle, puis ce que TaskForce lui a donné à lire, en une phrase. */
describe("readLine", () => {
  it.each([
    ["l'exemple de la recette : les notes, puis le tableau", { notes: 5, boards: [{ project: "SOLO", issues: 20, open: null }] }, "qwen3:8b · read 5 notes and the SOLO board"],
    ["l'exemple de la séance n°18", { issues: [{ key: "OPS-35", comments: 3 }] }, "qwen3:8b · read OPS-35 and 3 comments"],
    ["une note, une issue et son commentaire", { notes: 1, issues: [{ key: "OPS-35", comments: 1 }] }, "qwen3:8b · read 1 note and OPS-35 and 1 comment"],
    ["trois choses : une virgule, puis « and »", { notes: 2, boards: [{ project: "OPS", issues: 12, open: "OPS-35" }], issues: [{ key: "OPS-36", comments: 0 }] }, "qwen3:8b · read 2 notes, the OPS board and OPS-36"],
    ["ce que ses outils ont lu, en mots", { tools: [{ name: "list_projects", calls: 1 }] }, "qwen3:8b · read your projects"],
    ["un outil externe se dit par son connecteur", { tools: [{ name: "linear__list_issues", calls: 1 }] }, "qwen3:8b · read Linear"],
    ["deux lectures du même tableau se disent une fois", { boards: [{ project: "OPS", issues: 2, open: null }, { project: "OPS", issues: 3, open: null }] }, "qwen3:8b · read the OPS board"],
    ["chercher dans les notes ne s'ajoute pas aux notes lues", { notes: 3, tools: [{ name: "search_brain", calls: 2 }] }, "qwen3:8b · read 3 notes"],
    ["dit aussi qu'un modèle n'a rien lu : un résumé écrit sans lire se voit", {}, "qwen3:8b · read nothing in TaskForce"],
    ["les fichiers joints d'abord (R134) : jamais « read nothing » quand il en a reçu", { files: [{ name: "notes.md" }], notes: 1 }, "qwen3:8b · read notes.md and 1 note"],
  ] as const)("%s", (_, what, expected) => {
    expect(line("qwen3:8b", read(what as Partial<AssistantRead>))).toBe(expected)
  })

  it("une réponse d'avant la ligne grise : le modèle seul, sans rien affirmer de plus", () => {
    expect(line(" qwen3:8b ", null)).toBe("qwen3:8b")
  })

  it("rien sans modèle : un repli n'a rien fait lire", () => {
    expect(line(null, read({ notes: 2 }))).toBeNull()
    expect(greyLine("  ", read({}), c, t)).toBeNull()
  })

  it("aucun mot interne : ni nom d'outil, ni domaine", () => {
    const said = line("qwen3:8b", read({ tools: [{ name: "list_issues", calls: 2 }, { name: "new_tool_unknown", calls: 1 }], notes: 1 }))
    expect(said).not.toMatch(/list_issues|new_tool_unknown|ARCHITECTURE/)
  })
})

describe("readPieces", () => {
  it("les notes sont un morceau à part : elles se nomment d'un clic", () => {
    expect(readPieces(read({ notes: 4, boards: [{ project: "WEB", issues: 1, open: null }] }), c, t)).toEqual([
      { kind: "notes", text: "4 notes" },
      { kind: "text", text: "the WEB board" },
    ])
    expect(readPieces(read({ notes: 1 }), c, t)).toEqual([{ kind: "notes", text: "1 note" }])
  })

  it("une lecture sans mots connus ne se dit pas", () => {
    expect(readPieces(read({ tools: [{ name: "a_tool_this_version_ignores", calls: 1 }] }), c, t)).toEqual([])
  })
})

describe("inASentence", () => {
  it.each([
    [["a"], ["a"]],
    [["a", "b"], ["a", " and ", "b"]],
    [["a", "b", "c"], ["a", ", ", "b", " and ", "c"]],
  ])("%j", (pieces, expected) => {
    expect(inASentence(pieces, c)).toEqual(expected)
  })
})
