import { afterEach, describe, expect, it, vi } from "vitest"
import { act, render, screen, waitFor } from "@testing-library/react"
import { useRef } from "react"

import { DependencyLayer, edgePath } from "./dependency-layer"
import type { DependencyEdge } from "@/lib/workflow/view"

const box = (left: number, top: number) => ({ left, right: left + 240, top, bottom: top + 80 })

/** Les dépendances du nœud choisi (séance n°25, §4.8) : des courbes, de ce qui bloque vers ce qui est bloqué. */
describe("Show all links", () => {
  it("draws at most its limit, the nearest first, and says how many more", async () => {
    const board = { current: null as HTMLDivElement | null }
    function Board() {
      return (
        <div ref={(element) => { board.current = element }} style={{ position: "relative" }}>
          {["issue-1", "issue-2", "issue-3", "issue-4"].map((key) => <div key={key} data-node-key={key} />)}
          <DependencyLayer
            boardRef={board}
            edges={[
              { from: "issue-1", to: "issue-2", side: "blocks" },
              { from: "issue-2", to: "issue-3", side: "blocks" },
              { from: "issue-3", to: "issue-4", side: "blocks" },
              { from: "issue-4", to: "issue-9", side: "blocks" },
            ]}
            limit={2}
            moreLabel={(count) => `and ${count} more links`}
          />
        </div>
      )
    }
    const { container } = render(<Board />)
    // issue-9 n'est pas à l'écran : sur trois arêtes visibles, deux se dessinent ; les deux autres se disent.
    await waitFor(() => expect(container.querySelectorAll("path.stroke-primary")).toHaveLength(2))
    expect(screen.getByText("and 2 more links")).toBeInTheDocument()
  })

  it("says how many links it doesn't draw, even when none of their cards is on screen", async () => {
    const board = { current: null as HTMLDivElement | null }
    const edges: DependencyEdge[] = [
      { from: "issue-7", to: "issue-8", side: "blocks" },
      { from: "issue-8", to: "issue-9", side: "blocks" },
    ]
    const { container } = render(
      <div ref={(element) => { board.current = element }}>
        <div data-node-key="issue-1" />
        <DependencyLayer boardRef={board} edges={edges} limit={200}
          moreLabel={(count) => `and ${count} more links`} />
      </div>,
    )
    expect(await screen.findByText("and 2 more links")).toBeInTheDocument()
    expect(container.querySelectorAll("path.stroke-primary")).toHaveLength(0)
  })
})

describe("la carte choisie parmi tous les liens", () => {
  it("garde ses liens pleins, et estompe les autres", async () => {
    const board = { current: null as HTMLDivElement | null }
    const edges: DependencyEdge[] = [
      { from: "issue-1", to: "issue-2", side: "blocks" },
      { from: "issue-3", to: "issue-4", side: "blocks" },
    ]
    const { container } = render(
      <div ref={(element) => { board.current = element }}>
        {["issue-1", "issue-2", "issue-3", "issue-4"].map((key) => <div key={key} data-node-key={key} />)}
        <DependencyLayer boardRef={board} edges={edges} limit={200} focus="issue-2" />
      </div>,
    )
    await waitFor(() => expect(container.querySelectorAll("g[data-strong]")).toHaveLength(2))
    expect(container.querySelector("g[data-strong='true']")?.getAttribute("class")).toBeNull()
    expect(container.querySelector("g[data-strong='false']")?.getAttribute("class")).toContain("opacity-25")
  })
})

describe("les liens suivent les cartes", () => {
  it("remesure quand la mise en page change sans défilement (densité, filtre, ce qui se déplie)", async () => {
    // Les cartes sont où la table le dit ; la table change, puis la mise en page aussi.
    const at: Record<string, { left: number; top: number }> = { "issue-1": { left: 0, top: 0 }, "issue-2": { left: 300, top: 0 } }
    const card = (key: string) => (element: HTMLDivElement | null) => {
      if (element) element.getBoundingClientRect = () => {
        const { left, top } = at[key]
        return { left, top, right: left + 200, bottom: top + 80, width: 200, height: 80, x: left, y: top, toJSON: () => ({}) } as DOMRect
      }
    }
    const board = { current: null as HTMLDivElement | null }
    // Les arêtes ne changent pas (le nœud choisi est le même) : seule la mise en page bouge.
    const edges: DependencyEdge[] = [{ from: "issue-1", to: "issue-2", side: "blocks" }]
    function Moving({ revision }: Readonly<{ revision: number }>) {
      return (
        <div ref={(element) => {
          board.current = element
          if (element) element.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
        }}>
          <div data-node-key="issue-1" ref={card("issue-1")} />
          <div data-node-key="issue-2" ref={card("issue-2")} />
          <DependencyLayer boardRef={board} edges={edges} revision={revision} />
        </div>
      )
    }
    const { container, rerender } = render(<Moving revision={1} />)
    await waitFor(() => expect(container.querySelector("path.stroke-primary")).not.toBeNull())
    const before = container.querySelector("path.stroke-primary")?.getAttribute("d")
    at["issue-2"] = { left: 300, top: 400 }
    rerender(<Moving revision={2} />)
    await waitFor(() => expect(container.querySelector("path.stroke-primary")?.getAttribute("d")).not.toBe(before))
  })
})

describe("edgePath", () => {
  it("leaves a card by its side, runs in the gutter between the columns, and enters the other card by its side", () => {
    // Vers la droite : du côté droit de la carte de départ à la gouttière (12 px avant la colonne), dans la carte par la gauche.
    expect(edgePath(box(0, 0), box(300, 100))).toBe("M 240 40 H 282 Q 288 40 288 46 V 134 Q 288 140 294 140 H 298")
    // Vers la gauche : du côté gauche à la gouttière qui suit la colonne d'arrivée, dans la carte par la droite.
    expect(edgePath(box(300, 0), box(0, 100))).toBe("M 300 40 H 258 Q 252 40 252 46 V 134 Q 252 140 246 140 H 242")
    // Dans la même colonne : par la gouttière de gauche.
    expect(edgePath(box(0, 0), box(0, 200))).toBe("M 0 40 H -6 Q -12 40 -12 46 V 234 Q -12 240 -6 240 H -2")
    // À la même hauteur : une ligne droite, qui ne passe que sous les cartes du milieu.
    expect(edgePath(box(0, 0), box(300, 0))).toBe("M 240 40 H 298")
    // Aucun segment ne passe sur une carte : les segments verticaux restent dans les gouttières.
    for (const d of [edgePath(box(0, 0), box(300, 100)), edgePath(box(300, 0), box(0, 100))]) {
      const xs = [...d.matchAll(/V [-\d.]+/g)].length
      expect(xs).toBe(1)
    }
  })

  it("draws under the cards", async () => {
    const { container } = render(<Board edges={[{ from: "issue-1", to: "issue-2", side: "blocks" }]} />)
    await waitFor(() => expect(container.querySelector("[data-links-layer]")).not.toBeNull())
    expect(container.querySelector("[data-links-layer]")?.getAttribute("class")).toContain("z-0")
  })
})

function Board({ edges }: Readonly<{ edges: DependencyEdge[] }>) {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div ref={ref} data-testid="board">
      <div data-node-key="issue-1" />
      <div data-node-key="issue-2" />
      <DependencyLayer boardRef={ref} edges={edges} />
    </div>
  )
}

describe("DependencyLayer", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("draws the edges of the chosen node between cards on screen, and none of them takes the pointer", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const key = this.dataset.nodeKey
      const rect = key === "issue-1" ? box(0, 0) : key === "issue-2" ? box(300, 100) : { left: 0, right: 1000, top: 0, bottom: 800 }
      return { ...rect, x: rect.left, y: rect.top, width: rect.right - rect.left, height: rect.bottom - rect.top, toJSON: () => rect } as DOMRect
    })
    render(<Board edges={[{ from: "issue-1", to: "issue-2", side: "blocks" }, { from: "issue-9", to: "issue-2", side: "blockedBy" }]} />)

    await waitFor(() => expect(document.querySelectorAll("path.stroke-primary")).toHaveLength(1))
    // Ni bande invisible, ni groupe qui reprend le pointeur : un clic sur une carte lui revient, liens montrés ou non (R159, N1).
    const layer = document.querySelector("[data-links-layer]") as SVGElement
    expect(layer.getAttribute("class")).toContain("pointer-events-none")
    expect(layer.querySelectorAll(".pointer-events-auto, [pointer-events]")).toHaveLength(0)
    expect(layer.querySelectorAll("path.stroke-transparent, title")).toHaveLength(0)
  })

  it("draws nothing without a chosen node", async () => {
    render(<Board edges={[]} />)
    await act(async () => { await new Promise((resolve) => requestAnimationFrame(() => resolve(null))) })
    expect(document.querySelector("svg")).toBeNull()
  })
})
