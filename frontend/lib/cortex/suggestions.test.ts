import { describe, expect, it } from "vitest"

import { suggestionsFor } from "./suggestions"

describe("suggestionsFor", () => {
  it.each([
    ["/acme/dashboard", "Create a project"],
    ["/acme/projects", "Create a project"],
    ["/acme/projects/12", "Create an issue"],
    ["/acme/projects/12/issues/40", "Create an issue"],
    ["/acme/my-work", "What should I do next?"],
  ])("on %s, the first suggestion is %s", (pathname, first) => {
    expect(suggestionsFor(pathname)[0].label).toBe(first)
  })

  it("always offers three suggestions, each writing something", () => {
    for (const pathname of ["/acme/dashboard", "/acme/projects/1", "/acme/my-work"]) {
      const list = suggestionsFor(pathname)
      expect(list).toHaveLength(3)
      expect(list.every((s) => s.text.trim().length > 0)).toBe(true)
    }
  })
})
