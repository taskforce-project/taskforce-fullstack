import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"

import { ProjectTestCommand } from "./project-test-command"
import { useProjectStore } from "@/lib/store/project-store"
import type { Project } from "@/lib/api/project-service"

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock("sonner", () => ({ toast }))

const setTestCommand = vi.fn<(slug: string, id: number, command: string) => Promise<boolean>>()

function withProject(testCommand: string | null) {
  useProjectStore.setState({
    activeProject: { id: 12, name: "Website", repoFullName: "acme/website", testCommand } as Project,
    setTestCommand,
    error: null,
  })
}

describe("ProjectTestCommand : les tests lancés après l'agent (S1)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("montre la commande du projet et n'enregistre que si elle change", () => {
    withProject("npm test")
    render(<ProjectTestCommand workspace="acme" projectId={12} />)

    expect(screen.getByLabelText(/Tests after an agent's work/)).toHaveValue("npm test")
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled()
    expect(screen.getByText(/The agent itself doesn't run the repository's scripts/)).toBeInTheDocument()
  })

  it("enregistre la commande nettoyée", async () => {
    withProject(null)
    setTestCommand.mockResolvedValue(true)
    render(<ProjectTestCommand workspace="acme" projectId={12} />)

    fireEvent.change(screen.getByLabelText(/Tests after an agent's work/), { target: { value: "  npm run lint && npm test " } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => expect(setTestCommand).toHaveBeenCalledWith("acme", 12, "npm run lint && npm test"))
    expect(toast.success).toHaveBeenCalledWith("Test command saved")
  })

  it("vider la commande : plus aucun test lancé, et le dit", async () => {
    withProject("npm test")
    setTestCommand.mockResolvedValue(true)
    render(<ProjectTestCommand workspace="acme" projectId={12} />)

    fireEvent.change(screen.getByLabelText(/Tests after an agent's work/), { target: { value: "" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("No tests will run after an agent's work"))
  })

  it("un refus du serveur s'affiche", async () => {
    withProject(null)
    setTestCommand.mockImplementation(async () => {
      useProjectStore.setState({ error: "You can't change this project" })
      return false
    })
    render(<ProjectTestCommand workspace="acme" projectId={12} />)

    fireEvent.change(screen.getByLabelText(/Tests after an agent's work/), { target: { value: "npm test" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("You can't change this project"))
  })
})
