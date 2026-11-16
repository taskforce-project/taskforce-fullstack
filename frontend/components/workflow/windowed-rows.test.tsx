import { describe, expect, it } from "vitest"
import { act, fireEvent, render } from "@testing-library/react"
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

function Column({ count, revealKey = null }: Readonly<{ count: number; revealKey?: string | null }>) {
  const ref = useRef<HTMLDivElement>(null)
  const rows = Array.from({ length: count }, (_, i) => ({ key: `row-${i}` }))
  return (
    <div ref={ref} style={{ height: 600, overflow: "auto" }}>
      <WindowedRows rows={rows} gap={8} estimate={() => 92} scrollRef={ref} revealKey={revealKey} renderRow={(row) => <p>{row.key}</p>} />
    </div>
  )
}

/** Un ResizeObserver qui rend tout de suite, pour chaque élément observé, la hauteur donnée (une ligne mesurée). */
function measuringObserver(height: number): typeof ResizeObserver {
  return class {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe(target: Element) {
      this.callback([{ target, borderBoxSize: [{ blockSize: height, inlineSize: 240 }], contentRect: { height } } as unknown as ResizeObserverEntry],
        this as unknown as ResizeObserver)
    }
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
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

  it("follows the scroll of the element its parent owns: the rows under the eyes render, the first ones leave", async () => {
    const { container } = render(<Column count={2000} />)
    const scroller = container.firstElementChild as HTMLElement
    await act(async () => {
      scroller.scrollTop = 100 * 100
      fireEvent.scroll(scroller)
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
    const keys = [...container.querySelectorAll<HTMLElement>("[data-row-key]")].map((row) => row.dataset.rowKey)
    expect(keys).toContain("row-100")
    expect(keys).not.toContain("row-0")
  })

  it("takes the measured height of each rendered row in place of its estimate", () => {
    const real = globalThis.ResizeObserver
    globalThis.ResizeObserver = measuringObserver(40)
    try {
      const { container, unmount } = render(<Column count={2000} />)
      // Des lignes de 40 px au lieu de 92 : plus de lignes tiennent dans ce qui se voit.
      const rendered = container.querySelectorAll("[data-row-key]").length
      expect(rendered).toBeGreaterThan(Math.ceil((FALLBACK_VIEWPORT + OVERSCAN_PX) / 100) + 1)
      unmount()
    } finally {
      globalThis.ResizeObserver = real
    }
  })

  it("brings the row chosen with the keyboard under the eyes, once per choice", () => {
    const { container, rerender } = render(<Column count={2000} />)
    const scroller = container.firstElementChild as HTMLElement
    rerender(<Column count={2000} revealKey="row-300" />)
    // La ligne 300 est à 30 000 px : l'élément défile jusqu'à elle.
    expect(scroller.scrollTop).toBeGreaterThan(29_000)
    rerender(<Column count={2000} revealKey="row-1" />)
    expect(scroller.scrollTop).toBeLessThan(200)
  })

  it("renders nothing for an empty column", () => {
    const { container } = render(<Column count={0} />)
    expect(container.querySelectorAll("[data-row-key]")).toHaveLength(0)
  })
})
