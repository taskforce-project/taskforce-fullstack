import { describe, expect, it } from "vitest"

import { parseServerDate } from "./server-date"

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
