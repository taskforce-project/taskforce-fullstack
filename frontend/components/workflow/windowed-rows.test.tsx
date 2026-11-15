import { describe, expect, it } from "vitest"
import { render } from "@testing-library/react"
import { useRef } from "react"

import { FALLBACK_VIEWPORT, OVERSCAN_PX, WindowedRows, rowWindow } from "./windowed-rows"

/** Une colonne ne rend que ce qui se voit (séance n°25, §10) : 2 000 lignes, quelques dizaines rendues. */
describe("rowWindow", () => {
  it("keeps the rows in view and a margin around them, with the space above and below", () => {
    const heights = Array.from({ length: 100 }, () => 92)
    const top = 100 * 92
    const window = rowWindow(heights, 8, top, 900)
    expect(window.start).toBeGreaterThan(80)
    expect(window.end).toBeGreaterThan(window.start)
    expect(window.offsets[window.start]).toBeLessThanOrEqual(top - OVERSCAN_PX + 100)
    expect(window.before).toBe(window.offsets[window.start])
    expect(window.after).toBeGreaterThanOrEqual(0)
  })

  it("renders from the top when nothing is scrolled, and nothing for no rows", () => {
    const window = rowWindow([92, 92, 92], 8, 0, 900)
    expect(window).toMatchObject({ start: 0, end: 2, before: 0, after: 0 })
    expect(rowWindow([], 8, 0, 900)).toMatchObject({ start: 0, end: -1, before: 0, after: 0 })
  })
})

function Column({ count }: Readonly<{ count: number }>) {
  const ref = useRef<HTMLDivElement>(null)
  const rows = Array.from({ length: count }, (_, i) => ({ key: `row-${i}` }))
  return (
    <div ref={ref} style={{ height: 600, overflow: "auto" }}>
      <WindowedRows rows={rows} gap={8} estimate={() => 92} scrollRef={ref} renderRow={(row) => <p>{row.key}</p>} />
    </div>
  )
}

describe("WindowedRows", () => {
  it("renders only the first screen of 2,000 rows, with the height of the rest kept below", () => {
    const { container } = render(<Column count={2000} />)
    const rendered = container.querySelectorAll("[data-row-key]").length
    expect(rendered).toBeGreaterThan(5)
    expect(rendered).toBeLessThanOrEqual(Math.ceil((FALLBACK_VIEWPORT + OVERSCAN_PX) / 100) + 1)
    const spacer = container.querySelector("[data-row-key]")?.parentElement?.parentElement as HTMLElement
    expect(Number.parseInt(spacer.style.paddingBottom, 10)).toBeGreaterThan(150_000)
  })

  it("renders nothing for an empty column", () => {
    const { container } = render(<Column count={0} />)
    expect(container.querySelectorAll("[data-row-key]")).toHaveLength(0)
  })
})
