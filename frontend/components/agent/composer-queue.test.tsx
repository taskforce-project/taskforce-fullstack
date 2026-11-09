import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

import { ComposerQueue } from "./composer-queue"
import { useCortexStore } from "@/lib/store/cortex-store"

const initial = useCortexStore.getState()
const waiting = (...texts: string[]) => texts.map((text, i) => ({ id: `q${i}`, text, attachments: [], files: [] }))

/** Ce qui attend son tour au-dessus de la boîte (R134) : visible, retirable, et rien ne part sans que la personne le voie. */
describe("ComposerQueue", () => {
  const sendNext = vi.fn().mockResolvedValue(true)

  beforeEach(() => {
    vi.clearAllMocks()
    useCortexStore.setState({ ...initial, queue: [], queueHalted: false, sentAt: null, sendNext })
  })

  it("shows nothing when nothing waits", () => {
    render(<ComposerQueue slug="acme" />)
    expect(screen.queryByRole("list")).toBeNull()
  })

  it("shows one line per message, each with its cross", () => {
    useCortexStore.setState({ queue: waiting("First thing", "Second thing"), sentAt: Date.now() })
    render(<ComposerQueue slug="acme" />)

    expect(screen.getAllByRole("listitem")).toHaveLength(2)
    fireEvent.click(screen.getByRole("button", { name: "Remove from the queue: First thing" }))

    expect(useCortexStore.getState().queue.map((m) => m.text)).toEqual(["Second thing"])
  })

  it("offers no click while the queue goes on by itself", () => {
    useCortexStore.setState({ queue: waiting("Next"), sentAt: Date.now() })
    render(<ComposerQueue slug="acme" />)

    expect(screen.queryByRole("button", { name: "Send next" })).toBeNull()
  })

  it("after a stop or a failure, one click sends the next", () => {
    useCortexStore.setState({ queue: waiting("Next", "After"), queueHalted: true })
    render(<ComposerQueue slug="acme" />)

    expect(screen.getAllByRole("button", { name: "Send next" })).toHaveLength(1)
    fireEvent.click(screen.getByRole("button", { name: "Send next" }))

    expect(sendNext).toHaveBeenCalledWith("acme")
  })
})
