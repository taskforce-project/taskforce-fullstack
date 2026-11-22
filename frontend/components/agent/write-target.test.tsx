import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"

import { CONSTANTS_EN } from "@/lib/constants_en"
import { WriteTarget } from "./write-target"

const t = CONSTANTS_EN.thread

describe("WriteTarget : la carte d'une écriture dit où elle écrit, avant le geste (R204)", () => {
  it("says TaskForce and its workspace for a write in TaskForce", () => {
    render(<WriteTarget where={{ system: "TaskForce", workspace: "Pierre", asked: null }} />)

    expect(screen.getByRole("group", { name: t.whereLabel })).toHaveTextContent("In TaskForce, workspace Pierre")
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("says the connected tool for a write there", () => {
    render(<WriteTarget where={{ system: "Linear" }} />)

    expect(screen.getByRole("group", { name: t.whereLabel })).toHaveTextContent("In Linear")
  })

  it("warns first when the request named another tool: « crée un projet dans Linear », a project of TaskForce (s17)", () => {
    render(<WriteTarget where={{ system: "TaskForce", workspace: "Pierre", asked: "Linear" }} />)

    expect(screen.getByRole("alert")).toHaveTextContent("You asked for Linear. This is done in TaskForce, not in Linear.")
    expect(screen.getByRole("group", { name: t.whereLabel })).toHaveTextContent("In TaskForce, workspace Pierre")
  })

  it("shows nothing for a card the server didn't tell where (an answer from before)", () => {
    const { container } = render(<WriteTarget where={null} />)

    expect(container).toBeEmptyDOMElement()
  })
})
