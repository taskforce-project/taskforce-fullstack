import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { useSyncExternalStore } from "react"

// L'adresse : `useSearchParams` suit `history.replaceState`, comme Next.js le fait.
const address = vi.hoisted(() => {
  const listeners = new Set<() => void>()
  return {
    listeners,
    notify: () => listeners.forEach((listener) => listener()),
    push: vi.fn(),
  }
})
vi.mock("next/navigation", () => ({
  usePathname: () => globalThis.location.pathname,
  useParams: () => ({ workspace: "acme", id: "3" }),
  useRouter: () => ({ push: address.push, replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => {
    const search = useSyncExternalStore(
      (listener) => {
        address.listeners.add(listener)
        return () => address.listeners.delete(listener)
      },
      () => globalThis.location.search,
      () => "",
    )
    return new URLSearchParams(search)
  },
}))
vi.mock("@/lib/hooks/use-project-realtime", () => ({ useProjectRealtime: vi.fn() }))
vi.mock("@/lib/hooks/use-stomp", () => ({ subscribeTopics: vi.fn(() => () => {}), subscribeTopic: vi.fn(() => () => {}) }))
vi.mock("@/lib/api/issue-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/issue-service")>()),
  listStatuses: vi.fn(),
  listIssuesPage: vi.fn(),
  listProjectRelations: vi.fn(),
  listActivity: vi.fn(async () => []),
}))
vi.mock("@/lib/api/delivery-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/delivery-service")>()),
  listProjectRuns: vi.fn(),
  getProjectRun: vi.fn(),
  getRunActivity: vi.fn(async () => ({ events: [], approvals: [] })),
  decideApproval: vi.fn(async () => undefined),
  listOpenApprovals: vi.fn(async () => []),
  getDeliveryProviders: vi.fn(async () => [{ key: "claude-code", displayName: "Claude Code", logoKey: "claude", available: true, ready: true, models: [], reason: null }]),
  getEvidence: vi.fn(async () => ({ format: "taskforce-evidence/1", events: [], root: "" })),
  getMissionChanges: vi.fn(async () => ({ mode: null, live: false, added: 0, removed: 0, more: 0, files: [], canRevert: false, canComment: false, canCorrect: false, blockedReason: null, correction: null })),
}))
vi.mock("@/lib/api/attachment-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/attachment-service")>()),
  listAttachmentCounts: vi.fn(async () => [{ issueId: 1, count: 2 }]),
}))
vi.mock("@/lib/api/project-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/project-service")>()),
  getProjectObjective: vi.fn(async () => ({ goal: null, targetDate: null, criteria: [], updatedBy: null, updatedAt: null, canEdit: true })),
}))

import { WorkflowView } from "./workflow-view"
import { decideApproval, getProjectRun, listProjectRuns, type ProjectRun } from "@/lib/api/delivery-service"
import { listIssuesPage, listProjectRelations, listStatuses, type Issue, type ProjectIssueRelation } from "@/lib/api/issue-service"
import type { AuthUser } from "@/lib/auth"
import { useDeliveryStore } from "@/lib/store/delivery-store"
import { useIssueStore } from "@/lib/store/issue-store"
import { useProjectStore } from "@/lib/store/project-store"
import { useUserStore } from "@/lib/store/user-store"
import { useWorkflowViewStore } from "@/lib/store/workflow-view-store"
import {
  approval, bigProject, deliveryRun, DOING, DONE, issue, projectRun, relation, STATUSES,
} from "@/lib/workflow/__tests__/fixtures"

const realReplace = globalThis.history.replaceState.bind(globalThis.history)

function serve({ issues, runs = [], relations = [] }: { issues: Issue[]; runs?: ProjectRun[]; relations?: ProjectIssueRelation[] }) {
  vi.mocked(listStatuses).mockResolvedValue(STATUSES)
  vi.mocked(listIssuesPage).mockImplementation(async (_slug, _project, page, size = 100) => {
    const content = issues.slice(page * size, (page + 1) * size)
    const totalPages = Math.max(1, Math.ceil(issues.length / size))
    return { content, pageNumber: page, pageSize: size, totalElements: issues.length, totalPages, first: page === 0, last: page >= totalPages - 1, empty: content.length === 0 }
  })
  vi.mocked(listProjectRuns).mockImplementation(async (_slug, _project, page = 0, size = 20) => {
    const content = runs.slice(page * size, (page + 1) * size)
    const totalPages = Math.max(1, Math.ceil(runs.length / size))
    return { content, pageNumber: page, pageSize: size, totalElements: runs.length, totalPages, first: page === 0, last: page >= totalPages - 1, empty: content.length === 0 }
  })
  vi.mocked(listProjectRelations).mockResolvedValue({ relations, subIssues: [] })
}

const card = (title: string) => screen.getByRole("button", { name: new RegExp(`^${title}, `) })

beforeEach(() => {
  vi.clearAllMocks()
  globalThis.history.replaceState = (...args: Parameters<History["replaceState"]>) => {
    realReplace(...args)
    address.notify()
  }
  realReplace(null, "", "/acme/projects/3/workflow")
  // Une fenêtre large : les colonnes, pas la liste de l'écran étroit.
  Object.defineProperty(globalThis.window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: true, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(),
      addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    })),
  })
  useUserStore.setState({ user: { id: "7", email: "pierre@acme.dev", displayName: "Pierre Martin" } as AuthUser })
  useIssueStore.getState().clearIssues()
  useDeliveryStore.setState({ projectRuns: {}, activity: {}, projectProviders: {}, runs: {}, evidence: {}, missionChanges: {} })
  useProjectStore.setState({ projects: [{ id: 3, name: "Website", createdAt: "2026-11-01T09:00:00" } as never], objectives: {} })
  useWorkflowViewStore.setState({ densities: {}, inspectorWidths: {}, legendOpen: false, live: null })
})

afterEach(() => {
  globalThis.history.replaceState = realReplace
})

/** Le workflow d'un projet (séance n°25, W1), sur les données vivantes de l'API seulement. */
describe("le workflow d'un projet", () => {
  it("chaque nœud rendu est une issue de l'API, dans sa colonne, avec son état (critère 2)", async () => {
    const issues = [
      issue(1, { title: "Write the spec" }),
      issue(2, { title: "Build the export", status: DOING }),
      issue(3, { title: "Ship it", status: DONE }),
      issue(4, { title: "Review the API", status: DOING }),
    ]
    const runs = [projectRun(deliveryRun(1, 2), [approval(5)]), projectRun(deliveryRun(2, 4, { status: "FAILED", error: "Tests failed" }))]
    serve({ issues, runs })
    render(<WorkflowView slug="acme" projectId={3} />)

    await waitFor(() => expect(card("Write the spec")).toBeInTheDocument())
    expect(card("Build the export")).toHaveAccessibleName("Build the export, Needs you")
    expect(card("Review the API")).toHaveAccessibleName("Review the API, Failed")
    expect(card("Ship it")).toHaveAccessibleName("Ship it, Done")
    expect(card("Write the spec")).toHaveAccessibleName("Write the spec, Not started")
    // Rien d'autre que ces quatre issues : aucune donnée inventée.
    expect(screen.getAllByRole("button", { pressed: false }).filter((b) => b.dataset.nodeFocus)).toHaveLength(4)
    const progress = screen.getByRole("region", { name: /In Progress/ })
    expect(within(progress).getByText("WEB-2")).toBeInTheDocument()
    expect(screen.getByText("Waiting for your approval: build the project.")).toBeInTheDocument()
    // L'en-tête dit ce qui demande l'attention, sans objectif : il propose d'en écrire un.
    expect(screen.getByRole("button", { name: "Needs you 1" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Failed 1" })).toBeInTheDocument()
    expect(screen.getByText("This project has no objective yet.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Add an objective" })).toBeInTheDocument()
    // Une page d'issues, jamais toutes en un appel ; les missions par pages de W0.
    expect(listIssuesPage).toHaveBeenCalledWith("acme", 3, 0, 100)
    expect(listProjectRuns).toHaveBeenCalledWith("acme", 3, 0, 50)
  })

  it("choisir un nœud le met dans l'adresse et ouvre l'inspecteur ; Échap ferme l'inspecteur, puis la sélection", async () => {
    serve({ issues: [issue(1, { title: "Write the spec" }), issue(2, { title: "Plan the release" })] })
    render(<WorkflowView slug="acme" projectId={3} />)
    await waitFor(() => expect(card("Write the spec")).toBeInTheDocument())

    fireEvent.click(card("Write the spec"))
    expect(globalThis.location.search).toBe("?node=issue-1")
    const inspector = await screen.findByRole("complementary", { name: "About the chosen node" })
    expect(within(inspector).getByText("An issue in Todo.")).toBeInTheDocument()
    expect(card("Write the spec")).toHaveAttribute("aria-pressed", "true")

    fireEvent.keyDown(document, { key: "Escape" })
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument()
    expect(globalThis.location.search).toBe("?node=issue-1")
    fireEvent.keyDown(document, { key: "Escape" })
    expect(globalThis.location.search).toBe("")
  })

  it("au clavier : j et k d'un nœud à l'autre, f vers l'attention, 1 2 3 pour la densité retenue pour la personne", async () => {
    serve({
      issues: [issue(1, { title: "First" }), issue(2, { title: "Second" }), issue(3, { title: "Third", status: DOING })],
      runs: [projectRun(deliveryRun(1, 3), [approval(9)])],
    })
    render(<WorkflowView slug="acme" projectId={3} />)
    await waitFor(() => expect(card("First")).toBeInTheDocument())

    fireEvent.keyDown(document, { key: "j" })
    expect(globalThis.location.search).toBe("?node=issue-1")
    fireEvent.keyDown(document, { key: "j" })
    expect(globalThis.location.search).toBe("?node=issue-2")
    fireEvent.keyDown(document, { key: "k" })
    expect(globalThis.location.search).toBe("?node=issue-1")
    fireEvent.keyDown(document, { key: "f" })
    expect(globalThis.location.search).toBe("?node=issue-3")

    fireEvent.keyDown(document, { key: "1" })
    expect(useWorkflowViewStore.getState().densities["7"]).toBe("summary")
    expect(new URLSearchParams(globalThis.location.search).get("view")).toBe("summary")
    // En Summary, seules les exceptions gardent une carte.
    await waitFor(() => expect(screen.queryByRole("button", { name: /^First, / })).not.toBeInTheDocument())
    expect(screen.getByRole("button", { name: /^Third, Needs you/ })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: "2" })
    expect(useWorkflowViewStore.getState().densities["7"]).toBe("plan")
    expect(new URLSearchParams(globalThis.location.search).get("view")).toBeNull()
    // Une touche tapée dans un champ n'est pas un geste.
    const field = document.createElement("input")
    document.body.appendChild(field)
    fireEvent.keyDown(field, { key: "3" })
    expect(useWorkflowViewStore.getState().densities["7"]).toBe("plan")
    field.remove()
  })

  it("un compteur de l'en-tête est un filtre, un seul à la fois", async () => {
    serve({
      issues: [issue(1, { title: "Calm" }), issue(2, { title: "Asks", status: DOING })],
      runs: [projectRun(deliveryRun(1, 2), [approval(9)])],
    })
    render(<WorkflowView slug="acme" projectId={3} />)
    await waitFor(() => expect(card("Calm")).toBeInTheDocument())

    fireEvent.click(screen.getByRole("button", { name: "Needs you 1" }))
    expect(globalThis.location.search).toBe("?filter=needs-you")
    await waitFor(() => expect(screen.queryByRole("button", { name: /^Calm, / })).not.toBeInTheDocument())
    expect(card("Asks")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Needs you 1" }))
    expect(globalThis.location.search).toBe("")
  })

  it("une dépendance posée sur le tableau se voit à la sélection du nœud, sans recharger (critère 4)", async () => {
    const a = issue(1, { title: "Design" })
    const b = issue(2, { title: "Build" })
    serve({ issues: [a, b] })
    render(<WorkflowView slug="acme" projectId={3} />)
    await waitFor(() => expect(card("Build")).toBeInTheDocument())
    fireEvent.click(card("Build"))
    const inspector = await screen.findByRole("complementary")
    expect(within(inspector).queryByText("Blocked by")).not.toBeInTheDocument()

    // Le topic du projet annonce le lien posé depuis la fiche d'une issue du tableau.
    act(() => useIssueStore.getState().upsertRelationLocal(3, relation(1, a, b)))
    await waitFor(() => expect(within(screen.getByRole("complementary")).getByText("Blocked by")).toBeInTheDocument())
    expect(card("Build")).toHaveAccessibleName("Build, Blocked")
    expect(within(screen.getByRole("complementary")).getByRole("button", { name: /WEB-1/ })).toBeInTheDocument()
  })

  it("décider depuis le nœud : la règle sur la décision, puis la route qui existe, avec la raison (critère 3)", async () => {
    const asks = approval(9, { reason: "Builds can touch the release", expiresAt: "2026-11-13T10:30:00" })
    const row = projectRun(deliveryRun(1, 2), [asks])
    serve({ issues: [issue(2, { title: "Release", status: DOING })], runs: [row] })
    vi.mocked(getProjectRun).mockResolvedValue(projectRun(deliveryRun(1, 2)))
    render(<WorkflowView slug="acme" projectId={3} />)
    await waitFor(() => expect(card("Release")).toBeInTheDocument())

    fireEvent.click(screen.getByRole("button", { name: "Decide" }))
    const decision = await screen.findByRole("region", { name: "Approve build the project?" })
    expect(within(decision).getByText("Rule: Builds can touch the release")).toBeInTheDocument()
    expect(within(decision).getByText(/^Expires .*Then: No answer in time: refused\.$/)).toBeInTheDocument()
    expect(within(decision).getByText("Signing as Pierre Martin. Meaning: Approval.")).toBeInTheDocument()
    fireEvent.change(within(decision).getByLabelText("Why? (optional)"), { target: { value: "Checked the diff" } })
    fireEvent.click(within(decision).getByRole("button", { name: "Approve" }))

    await waitFor(() => expect(decideApproval).toHaveBeenCalledWith("acme", 1, 9, true, false, "Checked the diff"))
    await waitFor(() => expect(getProjectRun).toHaveBeenCalledWith("acme", 3, 1))
    await waitFor(() => expect(card("Release")).toHaveAccessibleName("Release, Working"))
  })

  it("un projet sans travail le dit, et propose d'en créer ; un échec dit quoi faire", async () => {
    serve({ issues: [] })
    const { unmount } = render(<WorkflowView slug="acme" projectId={3} />)
    expect(await screen.findByText("This project has no work yet.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Create an issue" })).toBeInTheDocument()
    unmount()

    useIssueStore.getState().clearIssues()
    vi.mocked(listIssuesPage).mockRejectedValue(new Error("offline"))
    render(<WorkflowView slug="acme" projectId={3} />)
    expect(await screen.findByText("Couldn't load the workflow. Check your connection, then try again.")).toBeInTheDocument()
    serve({ issues: [issue(1, { title: "Back" })] })
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    await waitFor(() => expect(card("Back")).toBeInTheDocument())
  })
})

/**
 * Les grands projets (le premier client de la Présidence) : 2 000 issues, 300 missions, 3 000 liens. La vue lit tout par
 * pages, calcule en une passe et ne rend que ce qui se voit ; le premier rendu et le choix d'un nœud restent rapides.
 */
describe("un grand projet", () => {
  it("2 000 issues, 300 missions et 3 000 liens : seules les cartes visibles se rendent, le choix d'un nœud reste immédiat", async () => {
    const big = bigProject(2000, 300, 3000)
    serve(big)
    const started = performance.now()
    render(<WorkflowView slug="acme" projectId={3} />)
    await waitFor(() => expect(document.querySelectorAll("[data-node-focus]").length).toBeGreaterThan(0), { timeout: 10_000 })
    const firstRender = performance.now() - started

    // Toutes les pages lues (20 d'issues, 6 de missions), jamais tout en un appel.
    expect(listIssuesPage).toHaveBeenCalledTimes(20)
    expect(listProjectRuns).toHaveBeenCalledTimes(6)
    const rendered = document.querySelectorAll("[data-node-focus]").length
    expect(rendered).toBeLessThan(200)

    const target = document.querySelectorAll<HTMLButtonElement>("[data-node-focus]")[3]
    const key = target.dataset.nodeFocus as string
    const before = performance.now()
    act(() => { target.click() })
    await waitFor(() => expect(document.querySelector(`[data-node-focus="${key}"]`)).toHaveAttribute("aria-pressed", "true"))
    const selection = performance.now() - before
    expect(screen.getByRole("complementary")).toBeInTheDocument()

    // Les mesures du lot : bornes larges ici (une machine de CI chargée), mesures réelles dans le rapport.
    console.info(`[workflow] 2000 issues: first render ${Math.round(firstRender)} ms, ${rendered} cards rendered, select ${Math.round(selection)} ms`)
    expect(firstRender).toBeLessThan(8000)
    expect(selection).toBeLessThan(1500)
  }, 30_000)
})
