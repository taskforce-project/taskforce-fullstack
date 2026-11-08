import { describe, expect, it } from "vitest"

import type { AssistantRead } from "@/lib/api/assistant-service"
import { CONSTANTS_EN } from "@/lib/constants_en"
import { readLine, readParts } from "./read-line"

const t = CONSTANTS_EN.conversation
const read = (patch: Partial<AssistantRead>): AssistantRead => ({ issues: [], boards: [], tools: [], notes: 0, ...patch })

/** La ligne grise sous chaque réponse (R123) : le modèle, puis ce que TaskForce lui a donné à lire, compté. */
describe("readLine", () => {
  it("dit le modèle et l'issue lue avec ses commentaires : l'exemple de la séance n°18", () => {
    expect(readLine("qwen3:8b", read({ issues: [{ key: "OPS-35", comments: 3 }] }), t)).toBe("qwen3:8b · read OPS-35 and 3 comments")
  })

  it("dit aussi qu'un modèle n'a rien lu : un résumé écrit sans lire se voit", () => {
    expect(readLine("qwen3:8b", read({}), t)).toBe("qwen3:8b · read nothing in TaskForce")
  })

  it("une réponse d'avant la ligne grise : le modèle seul, sans rien affirmer de plus", () => {
    expect(readLine(" qwen3:8b ", null, t)).toBe("qwen3:8b")
  })

  it("rien sans modèle : un repli n'a rien fait lire", () => {
    expect(readLine(null, read({ notes: 2 }), t)).toBeNull()
    expect(readLine("  ", read({}), t)).toBeNull()
  })
})

describe("readParts", () => {
  it("compte chaque lecture, au singulier comme au pluriel, dans l'ordre de la ligne", () => {
    expect(readParts(read({
      issues: [{ key: "OPS-35", comments: 1 }, { key: "OPS-36", comments: 0 }],
      boards: [{ project: "OPS", issues: 12, open: "OPS-35" }, { project: "WEB", issues: 1, open: null }],
      tools: [{ name: "list_issues", calls: 2 }, { name: "search_brain", calls: 1 }],
      notes: 1,
    }), t)).toEqual([
      "read OPS-35 and 1 comment",
      "read OPS-36",
      "saw the OPS board, 12 issues, OPS-35 open",
      "saw the WEB board, 1 issue",
      "used list_issues 2 times",
      "used search_brain",
      "1 note",
    ])
    expect(readParts(read({ notes: 4 }), t)).toEqual(["4 notes"])
  })
})
