import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"

import { DesktopLegal } from "./desktop-legal"

describe("DesktopLegal", () => {
  it("mentions légales : l'éditeur, la licence, et le compte en ligne sous les conditions du service web", () => {
    render(<DesktopLegal kind="legal" />)
    expect(screen.getByRole("heading", { name: "Legal notices" })).toBeInTheDocument()
    expect(screen.getByText(/TaskForce Desktop is published by Pierre Michel/)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "AGPL-3.0 license" })).toHaveAttribute(
      "href", "https://github.com/taskforce-project/taskforce-fullstack/blob/main/LICENSE")
    expect(screen.getByText(/keeps your projects on it/)).toBeInTheDocument()
  })

  it("confidentialité : les projets restent sur l'ordinateur, aucune donnée d'usage n'est envoyée", () => {
    render(<DesktopLegal kind="privacy" />)
    expect(screen.getByRole("heading", { name: "Privacy" })).toBeInTheDocument()
    expect(screen.getByText(/are stored on this computer/)).toBeInTheDocument()
    expect(screen.getByText(/use Ollama on this computer/)).toBeInTheDocument()
    expect(screen.getByText(/sends no usage data/)).toBeInTheDocument()
    expect(screen.queryByText(/cookies/i)).not.toBeInTheDocument()
  })
})
