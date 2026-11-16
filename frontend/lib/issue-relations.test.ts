import { describe, expect, it } from "vitest"

import { RELATION_FROM_TARGET, RELATION_LABELS, relationLabel } from "./issue-relations"

/** Le mot d'un lien sur la fiche : dans le sens où on le lit (la correction laissée par W0). */
describe("relationLabel", () => {
  it("reads a link as it was set from the issue that set it", () => {
    expect(relationLabel({ relationType: "BLOCKS", fromTarget: false })).toBe("Blocks")
    expect(relationLabel({ relationType: "DUPLICATE" })).toBe("Duplicate of")
  })

  it("turns the word around from the target: « Blocked by », not « Blocks »", () => {
    expect(relationLabel({ relationType: "BLOCKS", fromTarget: true })).toBe("Blocked by")
    expect(relationLabel({ relationType: "BLOCKED_BY", fromTarget: true })).toBe("Blocks")
    expect(relationLabel({ relationType: "DUPLICATE", fromTarget: true })).toBe("Duplicated by")
    expect(relationLabel({ relationType: "RELATES_TO", fromTarget: true })).toBe("Relates to")
  })

  it("has a word for every kind of link, in both directions", () => {
    expect(Object.keys(RELATION_FROM_TARGET)).toEqual(Object.keys(RELATION_LABELS))
  })
})
