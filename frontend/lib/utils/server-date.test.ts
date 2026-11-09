import { afterEach, describe, expect, it, vi } from "vitest"

import { parseServerDate, relativeTime } from "./server-date"

describe("parseServerDate", () => {
  it("lit une date sans fuseau comme de l'UTC (JVM du backend en UTC)", () => {
    expect(parseServerDate("2026-10-18T21:41:00").toISOString()).toBe("2026-10-18T21:41:00.000Z")
    expect(parseServerDate("2026-10-18T21:41:00.123456").toISOString()).toBe("2026-10-18T21:41:00.123Z")
  })

  it("garde le fuseau d'une date qui en porte un", () => {
    expect(parseServerDate("2026-10-18T21:41:00Z").toISOString()).toBe("2026-10-18T21:41:00.000Z")
    expect(parseServerDate("2026-10-18T23:41:00+02:00").toISOString()).toBe("2026-10-18T21:41:00.000Z")
  })
})

describe("relativeTime", () => {
  afterEach(() => { vi.useRealTimers() })

  it.each([
    ["2026-11-09T11:59:30", "just now"],
    ["2026-11-09T11:55:00", "5 min ago"],
    ["2026-11-09T09:00:00", "3h ago"],
    ["2026-11-08T06:00:00", "Yesterday"],
    ["2026-10-31T12:00:00", "9 days ago"],
  ])("dit %s depuis maintenant : %s", (at, said) => {
    vi.useFakeTimers({ now: new Date("2026-11-09T12:00:00Z") })
    expect(relativeTime(at)).toBe(said)
  })
})
