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
// Le direct se connecte tout de suite : sa première connexion lit les missions (une lecture au départ).
vi.mock("@/lib/hooks/use-stomp", () => ({
  subscribeTopics: vi.fn((_handlers: unknown, onConnect?: () => void) => { onConnect?.(); return () => {} }),
  subscribeTopic: vi.fn(() => () => {}),
}))
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

import { WorkflowView, detailLine } from "./workflow-view"
import { CONSTANTS_EN } from "@/lib/constants_en"
import { fillText } from "@/lib/delivery/result-card"
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

/** Fait défiler un élément, et laisse la liste relire ce qui se voit (une image plus tard). */
async function scrollTo(element: HTMLElement, top: number) {
  await act(async () => {
    element.scrollTop = top
    fireEvent.scroll(element)
    await new Promise((resolve) => setTimeout(resolve, 50))
  })
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
  useWorkflowViewStore.setState({ densities: {}, inspectorWidths: {}, allLinks: {}, legendOpen: false, live: null })
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
    const inspector = await screen.findByRole("region", { name: /, in detail$/ })
    expect(within(inspector).getByText("An issue in Todo.")).toBeInTheDocument()
    expect(card("Write the spec")).toHaveAttribute("aria-pressed", "true")

    fireEvent.keyDown(document, { key: "Escape" })
    expect(screen.queryByRole("region", { name: /, in detail$/ })).not.toBeInTheDocument()
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

  it("sous un filtre, seules les colonnes où il trouve quelque chose se montrent", async () => {
    const runs = [projectRun(deliveryRun(1, 2), [approval(5)])]
    serve({ issues: [issue(1, { title: "Write the spec" }), issue(2, { title: "Build it", status: DOING }), issue(3, { title: "Ship", status: DONE })], runs })
    realReplace(null, "", "/acme/projects/3/workflow?filter=needs-you")
    address.notify()
    render(<WorkflowView slug="acme" projectId={3} />)
    await waitFor(() => expect(card("Build it")).toBeInTheDocument())
    expect(document.querySelectorAll("[data-stage]")).toHaveLength(1)
    // La colonne gardée dit combien le filtre en garde, sur son total (R161, L4).
    expect(screen.getByRole("region", { name: "In Progress, 1 of 1 issues" })).toBeInTheDocument()
    expect(screen.getByText("1 of 1")).toBeInTheDocument()
  })

  it("Show all links : éteint par défaut ; L l'allume pour la personne, et la liste étroite compte les liens de chaque carte", async () => {
    Object.defineProperty(globalThis.window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(),
        addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
      })),
    })
    const a = issue(1, { title: "Write the spec" })
    const b = issue(2, { title: "Build it" })
    serve({ issues: [a, b], relations: [relation(1, a, b)] })
    render(<WorkflowView slug="acme" projectId={3} />)
    await waitFor(() => expect(card("Write the spec")).toBeInTheDocument())
    expect(screen.queryByText("1 link")).toBeNull()

    act(() => { fireEvent.keyDown(document, { key: "l" }) })
    expect(useWorkflowViewStore.getState().allLinks["7"]).toBe(true)
    await waitFor(() => expect(screen.getAllByText("1 link")).toHaveLength(2))
    act(() => { fireEvent.keyDown(document, { key: "l" }) })
    expect(useWorkflowViewStore.getState().allLinks["7"]).toBe(false)
    await waitFor(() => expect(screen.queryByText("1 link")).toBeNull())
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
    const inspector = await screen.findByRole("region", { name: /, in detail$/ })
    expect(within(inspector).queryByText("Blocked by")).not.toBeInTheDocument()

    // Le topic du projet annonce le lien posé depuis la fiche d'une issue du tableau.
    act(() => useIssueStore.getState().upsertRelationLocal(3, relation(1, a, b)))
    await waitFor(() => expect(within(screen.getByRole("region", { name: /, in detail$/ })).getByText("Blocked by")).toBeInTheDocument())
    expect(card("Build")).toHaveAccessibleName("Build, Blocked")
    expect(within(screen.getByRole("region", { name: /, in detail$/ })).getByRole("button", { name: /WEB-1/ })).toBeInTheDocument()
  })

  it("décider depuis le nœud : la règle sur la décision, puis la route qui existe, avec la raison (critère 3)", async () => {
    // Une échéance devant : la vue lit l'heure réelle, et une demande échue ne s'offre plus (R159, L2).
    const asks = approval(9, { reason: "Builds can touch the release", expiresAt: "2099-11-13T10:30:00" })
    const row = projectRun(deliveryRun(1, 2), [asks])
    serve({ issues: [issue(2, { title: "Release", status: DOING })], runs: [row] })
    vi.mocked(getProjectRun).mockResolvedValue(projectRun(deliveryRun(1, 2)))
    render(<WorkflowView slug="acme" projectId={3} />)
    await waitFor(() => expect(card("Release")).toBeInTheDocument())

    fireEvent.click(screen.getByRole("button", { name: "Decide" }))
    const decision = await screen.findByRole("region", { name: /^Let .* build the project\?$/ })
    expect(within(decision).getByText("Rule: Builds can touch the release")).toBeInTheDocument()
    expect(within(decision).getByText(/^Expires .*Then: No answer in time: refused\.$/)).toBeInTheDocument()
    expect(within(decision).getByText("Signing as Pierre Martin. Meaning: Approval.")).toBeInTheDocument()
    fireEvent.change(within(decision).getByLabelText("Why? (optional)"), { target: { value: "Checked the diff" } })
    fireEvent.click(within(decision).getByRole("button", { name: "Approve" }))

    await waitFor(() => expect(decideApproval).toHaveBeenCalledWith("acme", 1, 9, true, false, "Checked the diff"))
    await waitFor(() => expect(getProjectRun).toHaveBeenCalledWith("acme", 3, 1))
    await waitFor(() => expect(card("Release")).toHaveAccessibleName("Release, Working"))
  })

  it("pendant la lecture, le squelette se dit à un lecteur d'écran", () => {
    vi.mocked(listIssuesPage).mockImplementation(() => new Promise(() => {}))
    vi.mocked(listStatuses).mockResolvedValue(STATUSES)
    render(<WorkflowView slug="acme" projectId={3} />)
    expect(screen.getByRole("status")).toHaveTextContent("Loading the workflow")
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

/** Un ResizeObserver qui donne la même largeur à tout ce qu'il observe, tout de suite : un volet de cette largeur. */
function paneOf(width: number): typeof ResizeObserver {
  return class {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe(target: Element) {
      this.callback([{ target, contentRect: { width, height: 0 } } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver)
    }
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}

/** La ligne de l'ingénieur, en Detail (R161, L7). */
describe("la ligne de Detail", () => {
  it("dit d'abord les tests, puis le modèle et la branche, sans répéter l'agent de la ligne 2", () => {
    const run = projectRun(deliveryRun(1, 1, { model: "claude-opus-5", branch: "feat/a-very-long-branch-name-for-the-export",
      tests: { command: "npm test", ran: true, passed: true, passedCount: 12, total: 12 } }))
    const node = { run, issue: issue(1) } as unknown as Parameters<typeof detailLine>[0]
    const gov = CONSTANTS_EN.workflow.gov
    expect(detailLine(node, { name: "Claude Code", logoKey: null, model: null }, gov))
      .toBe(`${fillText(gov.tests, { passed: 12, total: 12 })} · claude-opus-5 · feat/a-very-long-branch-name-for-the-export`)
    // Le modèle déjà sur la ligne de l'agent ne se répète pas.
    expect(detailLine(node, { name: "TaskForce agent", logoKey: null, model: "claude-opus-5" }, gov))
      .toBe(`${fillText(gov.tests, { passed: 12, total: 12 })} · feat/a-very-long-branch-name-for-the-export`)
  })
})

/** La vue dans un volet de 592 px, la largeur par défaut de la fenêtre avec la conversation ouverte (R161, H2). */
describe("la vue dans un volet étroit", () => {
  const RealObserver = globalThis.ResizeObserver
  afterEach(() => { globalThis.ResizeObserver = RealObserver })

  it("sur un volet étroit, la densité et le filtre passent dans l'en-tête : la ligne des onglets n'en a plus", async () => {
    globalThis.ResizeObserver = paneOf(820)
    serve({ issues: [issue(1, { title: "Write the spec" })] })
    render(<WorkflowView slug="acme" projectId={3} />)
    await waitFor(() => expect(card("Write the spec")).toBeInTheDocument())
    expect(useWorkflowViewStore.getState().controlsInView).toBe(true)
    expect(screen.getByRole("radiogroup", { name: "How much to show" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^Filter/ })).toBeInTheDocument()
  })

  it("une vue de 528 px dans une fenêtre large devient la liste par étape : l'étroit se décide sur la vue", async () => {
    globalThis.ResizeObserver = paneOf(528)
    serve({ issues: [issue(1, { title: "Write the spec" }), issue(2, { title: "Build it", status: DOING })] })
    render(<WorkflowView slug="acme" projectId={3} />)
    await waitFor(() => expect(card("Write the spec")).toBeInTheDocument())
    expect(document.querySelector("[data-workflow-list]")).not.toBeNull()
    expect(document.querySelector("[data-stage-scroll]")).toBeNull()
  })

  it.each([
    [592, "full"],
    [820, "sheet"],
  ])("mesure sa largeur dès le premier rendu, même pendant la lecture : à %i px, l'inspecteur en %s", async (width, mode) => {
    globalThis.ResizeObserver = paneOf(width)
    serve({ issues: [issue(1, { title: "Write the spec" })] })
    render(<WorkflowView slug="acme" projectId={3} />)
    await waitFor(() => expect(card("Write the spec")).toBeInTheDocument())
    fireEvent.click(card("Write the spec"))
    await waitFor(() => expect(screen.getByRole("region", { name: /, in detail$/ })).toHaveAttribute("data-mode", mode))
  })

  it("à 592 px, la feuille prend le focus, rend inerte ce qu'elle cache, et le rend à la carte en se fermant (R161, N4)", async () => {
    globalThis.ResizeObserver = paneOf(592)
    serve({ issues: [issue(1, { title: "Write the spec" })] })
    render(<div id="app-root"><nav><button type="button">Projects</button></nav><WorkflowView slug="acme" projectId={3} /></div>)
    await waitFor(() => expect(card("Write the spec")).toBeInTheDocument())
    fireEvent.click(card("Write the spec"))
    const back = await screen.findByRole("button", { name: "Back to the workflow" })
    await waitFor(() => expect(back).toHaveFocus())
    expect(document.querySelector("[data-workflow-list]")).toHaveAttribute("inert")
    expect(document.querySelector("[data-objective-header]")).toHaveAttribute("inert")
    // À côté de la conversation, la feuille ne couvre que la vue : ce qui l'entoure reste à la personne.
    expect(screen.getByRole("navigation")).not.toHaveAttribute("inert")

    fireEvent.click(back)
    await waitFor(() => expect(card("Write the spec")).toHaveFocus())
    expect(document.querySelector("[data-workflow-list]")).not.toHaveAttribute("inert")
    expect(document.querySelector("[data-objective-header]")).not.toHaveAttribute("inert")
  })

  it("sur un téléphone, la feuille rend aussi inerte ce qui entoure la vue, le temps d'être ouverte ; Échap rend le focus à la carte", async () => {
    Object.defineProperty(globalThis.window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(),
        addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
      })),
    })
    serve({ issues: [issue(1, { title: "Write the spec" })] })
    render(<div id="app-root"><nav><button type="button">Projects</button></nav><WorkflowView slug="acme" projectId={3} /></div>)
    await waitFor(() => expect(card("Write the spec")).toBeInTheDocument())
    fireEvent.click(card("Write the spec"))
    await waitFor(() => expect(screen.getByRole("button", { name: "Back to the workflow" })).toHaveFocus())
    expect(screen.getByRole("navigation")).toHaveAttribute("inert")

    fireEvent.keyDown(document, { key: "Escape" })
    await waitFor(() => expect(card("Write the spec")).toHaveFocus())
    expect(screen.getByRole("navigation")).not.toHaveAttribute("inert")
    expect(document.querySelector("[data-workflow-list]")).not.toHaveAttribute("inert")
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
    // Sans fenêtre, les colonnes repliées en rendraient 163 : la borne tient seulement si les colonnes ne rendent que ce qui se voit.
    const rendered = document.querySelectorAll("[data-node-focus]").length
    expect(rendered).toBeLessThan(80)

    const target = document.querySelectorAll<HTMLButtonElement>("[data-node-focus]")[3]
    const key = target.dataset.nodeFocus as string
    const before = performance.now()
    act(() => { target.click() })
    await waitFor(() => expect(document.querySelector(`[data-node-focus="${key}"]`)).toHaveAttribute("aria-pressed", "true"))
    const selection = performance.now() - before
    expect(screen.getByRole("region", { name: /, in detail$/ })).toBeInTheDocument()

    // Les mesures du lot : bornes larges ici (une machine de CI chargée), mesures réelles dans le rapport.
    console.info(`[workflow] 2000 issues: first render ${Math.round(firstRender)} ms, ${rendered} cards rendered, select ${Math.round(selection)} ms`)
    expect(firstRender).toBeLessThan(8000)
    expect(selection).toBeLessThan(1500)

    // « Show {count} more » ouvre toute la colonne : elle ne rend toujours que ce qui se voit. Le bouton suit la
    // cinquantième carte : on fait d'abord défiler la colonne jusqu'à lui.
    await scrollTo(document.querySelector<HTMLElement>("[data-stage-scroll]") as HTMLElement, 5000)
    const mores = screen.getAllByRole("button", { name: /^Show \d+ more$/ })
    const hidden = Number(/\d+/.exec(mores[0].textContent ?? "")?.[0])
    expect(hidden).toBeGreaterThan(100)
    act(() => { mores[0].click() })
    await waitFor(() => expect(screen.queryAllByRole("button", { name: /^Show \d+ more$/ })).toHaveLength(mores.length - 1))
    expect(document.querySelectorAll("[data-node-focus]").length).toBeLessThan(80)
  }, 30_000)

  it("la liste de l'écran étroit ne rend aussi que ce qui se voit, même après « Show more »", async () => {
    Object.defineProperty(globalThis.window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(),
        addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
      })),
    })
    serve(bigProject(2000, 300, 3000))
    render(<WorkflowView slug="acme" projectId={3} />)
    await waitFor(() => expect(document.querySelectorAll("[data-node-focus]").length).toBeGreaterThan(0), { timeout: 10_000 })
    // Une section ne rend que ce qui se voit : sans fenêtre, la liste en rendrait 163.
    expect(document.querySelectorAll("[data-node-focus]").length).toBeLessThan(100)
    await scrollTo(document.querySelector<HTMLElement>("[data-workflow-list]") as HTMLElement, 5000)
    const mores = screen.getAllByRole("button", { name: /^Show \d+ more$/ })
    act(() => { mores[0].click() })
    await waitFor(() => expect(screen.queryAllByRole("button", { name: /^Show \d+ more$/ })).toHaveLength(mores.length - 1))
    expect(document.querySelectorAll("[data-node-focus]").length).toBeLessThan(100)
  }, 30_000)
})
