import { describe, expect, it } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

import { isLongText, UserMessage } from "./user-message"

describe("isLongText", () => {
  it.each([
    ["", false],
    ["a".repeat(1500), false],
    ["a".repeat(1501), true],
    ["line\n".repeat(19), false],
    ["line\n".repeat(20), true],
  ])("%#", (text, expected) => {
    expect(isLongText(text)).toBe(expected)
  })
})

/** La recette de la 1.13, étape 35 : un long texte collé se replie dans sa bulle, comme Claude (R137). */
describe("UserMessage", () => {
  it("un message court se lit tel quel", () => {
    render(<UserMessage text="Crée une issue Test" />)

    expect(screen.getByText("Crée une issue Test")).toBeInTheDocument()
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })

  it("un long texte se replie : son nombre de caractères et un chevron ; il se déplie entier", () => {
    const text = `${"The world must look three-dimensional. ".repeat(294)}Quel est le nom ?`
    render(<UserMessage text={text} />)

    const line = screen.getByRole("button", { name: `Pasted text · ${text.length.toLocaleString("en-US")} characters` })
    expect(line).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByText(/Quel est le nom/)).not.toBeInTheDocument()

    fireEvent.click(line)

    expect(line).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByText(/Quel est le nom/)).toBeInTheDocument()
  })

  it("rien sans texte, sans lever", () => {
    render(<UserMessage text={undefined} />)

    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })
})
