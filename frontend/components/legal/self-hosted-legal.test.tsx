import { afterEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

import { SelfHostedLegal, isSelfHosted } from "./self-hosted-legal"

describe("SelfHostedLegal", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("isSelfHosted suit NEXT_PUBLIC_SELF_HOSTED", () => {
    vi.stubEnv("NEXT_PUBLIC_SELF_HOSTED", "true")
    expect(isSelfHosted()).toBe(true)
    vi.stubEnv("NEXT_PUBLIC_SELF_HOSTED", "")
    expect(isSelfHosted()).toBe(false)
  })

  it("mentions légales : l'administrateur de l'instance en répond, le projet ne publie que le logiciel", () => {
    render(<SelfHostedLegal kind="legal" />)
    expect(screen.getByRole("heading", { name: "Legal notices" })).toBeInTheDocument()
    expect(screen.getByText(/run by its own administrator/)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "AGPL-3.0 license" })).toHaveAttribute(
      "href", "https://github.com/taskforce-project/taskforce-fullstack/blob/main/LICENSE")
    expect(screen.queryByText(/Pierre Michel/)).not.toBeInTheDocument()
  })

  it("confidentialité : les données restent sur l'instance, rien n'est envoyé au projet", () => {
    render(<SelfHostedLegal kind="privacy" />)
    expect(screen.getByRole("heading", { name: "Privacy" })).toBeInTheDocument()
    expect(screen.getByText(/Your data stays on this instance/)).toBeInTheDocument()
    expect(screen.getByText(/sends nothing to the TaskForce project/)).toBeInTheDocument()
  })
})
