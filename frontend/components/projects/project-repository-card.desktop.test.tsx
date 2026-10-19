import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

import type { Project } from "@/lib/api/project-service"
import type { DesktopToolsStatus } from "@/lib/desktop"

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
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

function status(github: DesktopToolsStatus["github"]): DesktopToolsStatus {
  return {
    claude: { installed: true, version: "2.1.293", signedIn: true },
    git: { installed: true, version: "2.54.0" },
    github,
  }
}

const SIGNED_IN = status({ installed: true, signedIn: true, login: "ada" })

/** Pont de la coque : seuls les outils et GitHub servent à la carte. */
function installBridge(tools: DesktopToolsStatus) {
  const bridge = {
    tools: { status: vi.fn().mockResolvedValue(tools) },
    github: {
      repos: vi.fn().mockResolvedValue({ ok: true, value: [
        { fullName: "acme/site", private: true, canPush: true },
        { fullName: "octo/readonly", private: false, canPush: false },
      ] }),
      repo: vi.fn(),
      createRepo: vi.fn(),
      signIn: vi.fn(),
      openSignInPage: vi.fn(),
      waitForSignIn: vi.fn().mockReturnValue(new Promise(() => {})),
      cancelSignIn: vi.fn(),
    },
  }
  ;(window as Window & { taskforceDesktop?: unknown }).taskforceDesktop = bridge
  return bridge
}

/** Build desktop : le drapeau est figé au chargement, la carte et ses stores sont rechargés avec lui. */
async function renderCard(repoFullName: string | null) {
  vi.stubEnv("NEXT_PUBLIC_DESKTOP", "true")
  vi.resetModules()
  const { ProjectRepositoryCard } = await import("./project-repository-card")
  const { useProjectStore } = await import("@/lib/store/project-store")
  const projects = await import("@/lib/api/project-service")
  const { toast } = await import("sonner")
  useProjectStore.setState({ activeProject: project(repoFullName), error: null })
  render(<ProjectRepositoryCard workspace={SLUG} projectId={PROJECT_ID} />)
  return { projects, toast, useProjectStore }
}

describe("ProjectRepositoryCard in the desktop app: GitHub through GitHub CLI", () => {
  beforeEach(() => vi.clearAllMocks())

  afterEach(() => {
    vi.unstubAllEnvs()
    delete (window as Window & { taskforceDesktop?: unknown }).taskforceDesktop
  })

  it("asks to install GitHub CLI when it is missing", async () => {
    installBridge(status({ installed: false, signedIn: false, login: null }))
    await renderCard(null)

    const link = await screen.findByRole("link", { name: /Install GitHub CLI/ })
    expect(link.getAttribute("href")).toBe("https://cli.github.com")
    expect(screen.queryByText("Open integrations")).toBeNull()
  })

  it("signs in to GitHub with a one-time code shown in the app", async () => {
    const bridge = installBridge(status({ installed: true, signedIn: false, login: null }))
    bridge.github.signIn.mockResolvedValue({ ok: true, value: "1A2B-3C4D" })
    await renderCard(null)

    fireEvent.click(await screen.findByRole("button", { name: "Sign in to GitHub" }))

    expect(await screen.findByText("1A2B-3C4D")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: /Copy the code and open GitHub/ }))
    await waitFor(() => expect(bridge.github.openSignInPage).toHaveBeenCalled())
  })

  it("links an existing repository after checking it with GitHub CLI", async () => {
    const bridge = installBridge(SIGNED_IN)
    bridge.github.repo.mockResolvedValue({ ok: true, value: { fullName: "acme/site", private: true, canPush: true } })
    const { projects } = await renderCard(null)
    vi.mocked(projects.setProjectRepo).mockResolvedValue({ projectId: PROJECT_ID, repoProvider: "github", repoFullName: "acme/site" })

    fireEvent.change(await screen.findByLabelText("Repository (owner/name)"), { target: { value: "acme/site" } })
    fireEvent.click(screen.getByRole("button", { name: "Link" }))

    await waitFor(() => expect(projects.setProjectRepo).toHaveBeenCalledWith(SLUG, PROJECT_ID, { mode: "LINK", repoFullName: "acme/site" }))
    expect(bridge.github.repo).toHaveBeenCalledWith("acme/site")
  })

  it("suggests only the repositories the person can push to", async () => {
    installBridge(SIGNED_IN)
    await renderCard(null)

    await waitFor(() => expect(document.querySelectorAll("datalist option")).toHaveLength(1))
    expect(document.querySelector("datalist option")?.getAttribute("value")).toBe("acme/site")
  })

  it("creates the repository with GitHub CLI, then links it by name", async () => {
    const bridge = installBridge(SIGNED_IN)
    bridge.github.createRepo.mockResolvedValue({ ok: true, value: "ada/new-site" })
    const { projects } = await renderCard(null)
    vi.mocked(projects.setProjectRepo).mockResolvedValue({ projectId: PROJECT_ID, repoProvider: "github", repoFullName: "ada/new-site" })

    fireEvent.click(await screen.findByRole("button", { name: "New repository" }))
    fireEvent.change(screen.getByLabelText("New repository name"), { target: { value: "new-site" } })
    fireEvent.click(screen.getByRole("button", { name: "Create and link" }))

    await waitFor(() => expect(projects.setProjectRepo).toHaveBeenCalledWith(SLUG, PROJECT_ID, { mode: "LINK", repoFullName: "ada/new-site" }))
    expect(bridge.github.createRepo).toHaveBeenCalledWith({ name: "new-site", private: true })
  })

  it("refuses a repository the person can't push to, without asking the server", async () => {
    const bridge = installBridge(SIGNED_IN)
    bridge.github.repo.mockResolvedValue({ ok: true, value: { fullName: "octo/readonly", private: false, canPush: false } })
    const { projects, toast } = await renderCard(null)

    fireEvent.change(await screen.findByLabelText("Repository (owner/name)"), { target: { value: "octo/readonly" } })
    fireEvent.click(screen.getByRole("button", { name: "Link" }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      "Your GitHub account can't push to octo/readonly: Claude Code couldn't open pull requests there"))
    expect(projects.setProjectRepo).not.toHaveBeenCalled()
  })

  it("lets the person change a linked repository once GitHub is ready", async () => {
    installBridge(SIGNED_IN)
    await renderCard("acme/site")

    expect(await screen.findByRole("button", { name: "Change" })).toBeTruthy()
    expect(screen.getByRole("link", { name: /acme\/site/ }).getAttribute("href")).toBe("https://github.com/acme/site")
  })
})
