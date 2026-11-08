import { describe, expect, it } from "vitest"

import type { CortexSource } from "@/lib/api/cortex-sources-service"
import { CONSTANTS_EN } from "@/lib/constants_en"

import { sourceLines } from "./sources"

/** Ce que Cortex lit dans l'espace (R125, R129) : chaque source comptée, avec le jour de son dernier changement. */
describe("sourceLines", () => {
  it("names, counts and dates each source, in the server's order", () => {
    const sources: CortexSource[] = [
      { key: "issues", count: 1267, changedAt: "2026-11-07T18:02:00" },
      { key: "notes", count: 0, changedAt: null },
      { key: "connectors", count: 2, changedAt: null },
    ]

    expect(sourceLines(sources, CONSTANTS_EN.progress)).toEqual([
      { key: "issues", label: "Issues", count: "1,267", day: "7 Nov", changed: "changed 7 Nov" },
      { key: "notes", label: "Notes", count: "0", day: null, changed: null },
      { key: "connectors", label: "Connected tools", count: "2", day: null, changed: null },
    ])
  })

  it("keeps the key of a source it doesn't know yet", () => {
    const unknown = { key: "pages", count: 3, changedAt: null } as unknown as CortexSource

    expect(sourceLines([unknown], CONSTANTS_EN.progress)[0].label).toBe("pages")
  })
})
