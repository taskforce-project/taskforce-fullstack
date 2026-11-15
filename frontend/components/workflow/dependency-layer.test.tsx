import { afterEach, describe, expect, it, vi } from "vitest"
import { act, render, screen, waitFor } from "@testing-library/react"
import { useRef } from "react"

import { DependencyLayer, edgePath } from "./dependency-layer"
import type { DependencyEdge } from "@/lib/workflow/view"

const box = (left: number, top: number) => ({ left, right: left + 240, top, bottom: top + 80 })

/** Les dépendances du nœud choisi (séance n°25, §4.8) : des courbes, de ce qui bloque vers ce qui est bloqué. */
describe("edgePath", () => {
  it("goes from side to side, left to right or right to left, and around the left inside a column", () => {
    expect(edgePath(box(0, 0), box(300, 100))).toMatch(/^M 240 40 C .* 298 140$/)
    expect(edgePath(box(300, 0), box(0, 100))).toMatch(/^M 300 40 C .* 242 140$/)
    expect(edgePath(box(0, 0), box(0, 200))).toBe("M 0 40 C -28 40, -28 240, -2 240")
  })
})

function Board({ edges }: Readonly<{ edges: DependencyEdge[] }>) {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div ref={ref} data-testid="board">
      <div data-node-key="issue-1" />
      <div data-node-key="issue-2" />
      <DependencyLayer boardRef={ref} edges={edges} labels={{ blocks: "Blocks", blockedBy: "Blocked by" }} />
    </div>
  )
}

describe("DependencyLayer", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("draws the edges of the chosen node between cards on screen, with their word on hover", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const key = this.dataset.nodeKey
      const rect = key === "issue-1" ? box(0, 0) : key === "issue-2" ? box(300, 100) : { left: 0, right: 1000, top: 0, bottom: 800 }
      return { ...rect, x: rect.left, y: rect.top, width: rect.right - rect.left, height: rect.bottom - rect.top, toJSON: () => rect } as DOMRect
    })
    render(<Board edges={[{ from: "issue-1", to: "issue-2", side: "blocks" }, { from: "issue-9", to: "issue-2", side: "blockedBy" }]} />)

    await waitFor(() => expect(document.querySelectorAll("path.stroke-primary")).toHaveLength(1))
    expect(screen.getByText("Blocks", { selector: "title" })).toBeInTheDocument()
  })

  it("draws nothing without a chosen node", async () => {
    render(<Board edges={[]} />)
    await act(async () => { await new Promise((resolve) => requestAnimationFrame(() => resolve(null))) })
    expect(document.querySelector("svg")).toBeNull()
  })
})
