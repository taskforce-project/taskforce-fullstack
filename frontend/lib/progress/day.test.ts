import { describe, expect, it } from "vitest"

import { dayOf, timeOf } from "./day"

/** Les dates du volet « Progress » : un jour du calendrier reste ce jour, une date-heure de l'API se lit en UTC. */
describe("dayOf", () => {
  it.each([
    ["2026-11-02", "2 Nov"],
    ["2026-01-31", "31 Jan"],
  ])("writes the calendar day %s as it is, whatever the time zone", (value, day) => {
    expect(dayOf(value)).toBe(day)
  })

  it("reads a date-time of the API as UTC", () => {
    expect(dayOf("2026-11-07T10:04:00")).toBe(new Date("2026-11-07T10:04:00Z").toLocaleDateString("en-GB", {
      day: "numeric", month: "short",
    }))
  })

  it("gives the instant of a date-time, for the time axis of a curve", () => {
    expect(timeOf("2026-11-07T10:04:00")).toBe(Date.UTC(2026, 10, 7, 10, 4))
    expect(timeOf("2026-11-07T10:04:00Z")).toBe(Date.UTC(2026, 10, 7, 10, 4))
  })
})
