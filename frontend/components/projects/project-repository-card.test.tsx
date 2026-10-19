import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { toast } from "sonner"

import { ProjectRepositoryCard } from "./project-repository-card"
import { useProjectStore } from "@/lib/store/project-store"
import { useIntegrationStore } from "@/lib/store/integration-store"
import { useSettingsStore } from "@/lib/store/settings-store"
import * as integrations from "@/lib/api/integration-service"
import * as projects from "@/lib/api/project-service"
import type { Project } from "@/lib/api/project-service"

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

// Aucun réseau : on pilote le serveur par les services, les vrais stores font le reste.
vi.mock("@/lib/api/integration-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/integration-service")>()),
  getGitHubStatus: vi.fn(),
  getGitHubRepos: vi.fn(),
}))
vi.mock("@/lib/api/project-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/project-service")>()),
  setProjectRepo: vi.fn(),
  unsetProjectRepo: vi.fn(),
}))

const SLUG = "acme"
const PROJECT_ID = 7

function project(repoFullName: string | null): Project {
  return {
    id: PROJECT_ID, name: "Website", identifier: "WEB", description: null, status: "ACTIVE", isPublic: false,
    isFavorite: false, workspaceId: 1, workspaceSlug: SLUG, createdById: 1, iconUrl: null, color: "#2f6bf6",
    growthMode: false, repoProvider: repoFullName ? "github" : null, repoFullName,
    createdAt: "2026-10-01T00:00:00", updatedAt: "2026-10-01T00:00:00",
  } as Project
}

function github(connected: boolean) {
  vi.mocked(integrations.getGitHubStatus).mockResolvedValue({
    id: connected ? 1 : null, provider: "GITHUB", connected, meta: null, connectedAt: null,
  })
}

function axiosError(message: string) {
  return Object.assign(new Error("Request failed with status code 400"), {
    isAxiosError: true, response: { status: 400, data: { message } },
  })
}

describe("ProjectRepositoryCard : le dépôt de code d'un projet", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useIntegrationStore.setState({ githubStatus: null, githubRepos: [] })
    useSettingsStore.setState({ open: false })
    vi.mocked(integrations.getGitHubRepos).mockResolvedValue([
      { fullName: "acme/website", name: "website", isPrivate: true, htmlUrl: "https://github.com/acme/website", openIssues: 0 },
    ])
  })

  it("GitHub non connecté : propose d'ouvrir les intégrations du workspace", async () => {
    github(false)
    useProjectStore.setState({ activeProject: project(null) })

    render(<ProjectRepositoryCard workspace={SLUG} projectId={PROJECT_ID} />)
    fireEvent.click(await screen.findByRole("button", { name: /Open integrations/ }))

    expect(screen.getByText(/Connect GitHub for this workspace/)).toBeInTheDocument()
    expect(useSettingsStore.getState().open).toBe(true)
    expect(useSettingsStore.getState().section).toBe("integrations")
  })

  it("lie un dépôt existant : saisie validée avec la règle du backend, puis lien affiché", async () => {
    github(true)
    useProjectStore.setState({ activeProject: project(null) })
    vi.mocked(projects.setProjectRepo).mockResolvedValue({ projectId: PROJECT_ID, repoProvider: "github", repoFullName: "acme/website" })

    render(<ProjectRepositoryCard workspace={SLUG} projectId={PROJECT_ID} />)
    const input = await screen.findByRole("combobox", { name: "Repository (owner/name)" })
    fireEvent.change(input, { target: { value: "website" } })
    expect(screen.getByText(/Use the owner\/name form/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Link" })).toBeDisabled()

    fireEvent.change(input, { target: { value: "acme/website" } })
    fireEvent.click(screen.getByRole("button", { name: "Link" }))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Linked to acme/website"))
    expect(projects.setProjectRepo).toHaveBeenCalledWith(SLUG, PROJECT_ID, { mode: "LINK", repoFullName: "acme/website" })
    expect(screen.getByRole("link", { name: /acme\/website/ })).toHaveAttribute("href", "https://github.com/acme/website")
    expect(integrations.getGitHubRepos).toHaveBeenCalledWith(SLUG)
  })

  it("crée un nouveau dépôt privé et le lie", async () => {
    github(true)
    useProjectStore.setState({ activeProject: project(null) })
    vi.mocked(projects.setProjectRepo).mockResolvedValue({ projectId: PROJECT_ID, repoProvider: "github", repoFullName: "me/new-site" })

    render(<ProjectRepositoryCard workspace={SLUG} projectId={PROJECT_ID} />)
    fireEvent.click(await screen.findByRole("button", { name: "New repository" }))
    fireEvent.change(screen.getByRole("textbox", { name: "New repository name" }), { target: { value: "new site" } })
    fireEvent.click(screen.getByRole("button", { name: "Create and link" }))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Created me/new-site and linked it"))
    expect(projects.setProjectRepo).toHaveBeenCalledWith(SLUG, PROJECT_ID, { mode: "CREATE", repoName: "new-site", privateRepo: true })
  })

  it("un refus du backend est dit tel quel (dépôt introuvable)", async () => {
    github(true)
    useProjectStore.setState({ activeProject: project(null) })
    vi.mocked(projects.setProjectRepo).mockRejectedValue(axiosError("GitHub repository not found or not accessible: acme/nope"))

    render(<ProjectRepositoryCard workspace={SLUG} projectId={PROJECT_ID} />)
    fireEvent.change(await screen.findByRole("combobox", { name: "Repository (owner/name)" }), { target: { value: "acme/nope" } })
    fireEvent.click(screen.getByRole("button", { name: "Link" }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("GitHub repository not found or not accessible: acme/nope"))
    expect(screen.queryByRole("link", { name: /acme\/nope/ })).not.toBeInTheDocument()
  })

  it("délier demande confirmation, puis retire le dépôt du projet", async () => {
    github(true)
    useProjectStore.setState({ activeProject: project("acme/website") })
    vi.mocked(projects.unsetProjectRepo).mockResolvedValue({ projectId: PROJECT_ID, repoProvider: null, repoFullName: null })

    render(<ProjectRepositoryCard workspace={SLUG} projectId={PROJECT_ID} />)
    fireEvent.click(await screen.findByRole("button", { name: "Unlink" }))
    expect(projects.unsetProjectRepo).not.toHaveBeenCalled()
    expect(screen.getByText(/The repository itself stays on GitHub/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Unlink" }))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Repository unlinked"))
    expect(projects.unsetProjectRepo).toHaveBeenCalledWith(SLUG, PROJECT_ID)
    expect(useProjectStore.getState().activeProject?.repoFullName).toBeNull()
  })

  it("« Change » rouvre la saisie, « Cancel » la referme sans rien changer", async () => {
    github(true)
    useProjectStore.setState({ activeProject: project("acme/website") })

    render(<ProjectRepositoryCard workspace={SLUG} projectId={PROJECT_ID} />)
    fireEvent.click(await screen.findByRole("button", { name: "Change" }))
    expect(screen.getByRole("combobox", { name: "Repository (owner/name)" })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(screen.getByRole("link", { name: /acme\/website/ })).toBeInTheDocument()
    expect(projects.setProjectRepo).not.toHaveBeenCalled()
  })
})
