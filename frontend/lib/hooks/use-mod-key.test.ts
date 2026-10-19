import { describe, it, expect, vi, afterEach } from "vitest"
import { renderHook } from "@testing-library/react"

import { modKeyLabel, useModKeyLabel } from "./use-mod-key"

describe("modKeyLabel", () => {
  it.each([
    ["MacIntel", "⌘"],
    ["iPhone", "⌘"],
    ["iPad", "⌘"],
    ["Win32", "Ctrl"],
    ["Linux x86_64", "Ctrl"],
    ["", "Ctrl"],
  ])("%s → %s", (platform, label) => {
    expect(modKeyLabel(platform)).toBe(label)
  })
})

describe("useModKeyLabel", () => {
  afterEach(() => vi.restoreAllMocks())

  it("lit la plateforme du navigateur", () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel")
    const { result } = renderHook(() => useModKeyLabel())
    expect(result.current).toBe("⌘")
  })

  it("affiche Ctrl hors Mac", () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("Win32")
    const { result } = renderHook(() => useModKeyLabel())
    expect(result.current).toBe("Ctrl")
  })
})
