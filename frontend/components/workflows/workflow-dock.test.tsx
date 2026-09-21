import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

import { WorkflowPanelContent } from "./workflow-dock";
import { useDeliveryStore } from "@/lib/store/delivery-store";
import { useWorkflowStore } from "@/lib/store/workflow-store";
import { useWorkspaceStore } from "@/lib/store/workspace-store";
import type { DeliveryRun } from "@/lib/api/delivery-service";
import type { AnalysisJob } from "@/lib/api/analysis-service";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useParams: () => ({ workspace: "acme" }),
}));

// Le canvas (React Flow) n'est pas l'objet de ce test : le panneau doit se rendre sans lui.
vi.mock("@/components/workflows/workflow-canvas-dialog", () => ({
  WorkflowCanvasDialog: () => null,
}));

// Aucun réseau : le panneau recharge l'historique à l'ouverture, on lui rend ce que le store contient déjà.
vi.mock("@/lib/api/delivery-service", () => ({
  listWorkspaceRuns: vi.fn(async () => useDeliveryStore.getState().workspaceRuns),
  getDeliveryProviders: vi.fn(async () => useDeliveryStore.getState().providers),
  getIssueRun: vi.fn(),
  delegateIssue: vi.fn(),
  getDeliveryKey: vi.fn(),
  connectDeliveryKey: vi.fn(),
  disconnectDeliveryKey: vi.fn(),
}));

function makeRun(overrides: Partial<DeliveryRun> = {}): DeliveryRun {
  return {
    id: 8, issueId: 1080, issueKey: "SOLO-151", issueTitle: "Runner self-test: add a hello file",
    projectId: 20, projectName: "Solo Initiatives", providerKey: "claude-code", model: "claude-sonnet-5",
    status: "DONE", summary: "Added the hello file and verified it.", resultUrl: "https://github.com/acme/site/pull/9",
    error: null, startedById: 1, createdAt: "2026-09-20T18:48:00", updatedAt: "2026-09-20T18:48:18",
    ...overrides,
  };
}

const CLAUDE_CODE = { key: "claude-code", displayName: "Claude Code", logoKey: "anthropic", available: true, models: [] };

function seed(runs: DeliveryRun[], jobs: AnalysisJob[] = []) {
  useDeliveryStore.setState({ workspaceRuns: runs, providers: [CLAUDE_CODE] });
  useWorkflowStore.setState({ jobs });
}

describe("WorkflowPanelContent : historique des délégations", () => {
  beforeEach(() => {
    push.mockClear();
    useWorkspaceStore.setState({ activeWorkspace: { slug: "acme" } as never });
    seed([]);
  });

  it("panneau vide : dit comment une délégation ou une analyse arrive ici", () => {
    render(<WorkflowPanelContent />);
    expect(screen.getByText("No workflows")).toBeInTheDocument();
    expect(screen.getByText(/Delegate an issue to an agent/)).toBeInTheDocument();
  });

  it("une délégation passée est lisible : clé + titre de l'issue, agent, projet, statut", () => {
    seed([makeRun()]);
    render(<WorkflowPanelContent />);

    expect(screen.getByText("Delegations")).toBeInTheDocument();
    expect(screen.getByText("SOLO-151 · Runner self-test: add a hello file")).toBeInTheDocument();
    expect(screen.getByText(/Claude Code · Solo Initiatives/)).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(screen.queryByText("No workflows")).not.toBeInTheDocument();
  });

  it("dépliée : résumé, lien du résultat, et « Open issue » ouvre l'issue par le lien profond du board", () => {
    seed([makeRun()]);
    render(<WorkflowPanelContent />);
    fireEvent.click(screen.getByText("SOLO-151 · Runner self-test: add a hello file"));

    expect(screen.getByText("Added the hello file and verified it.")).toBeInTheDocument();
    const result = screen.getByRole("link", { name: /View result/ });
    expect(result).toHaveAttribute("href", "https://github.com/acme/site/pull/9");
    expect(result).toHaveAttribute("target", "_blank");
    expect(result).toHaveAttribute("rel", "noopener noreferrer");

    fireEvent.click(screen.getByRole("button", { name: /Open issue/ }));
    expect(push).toHaveBeenCalledWith("/acme/projects/20?issue=1080");
  });

  it("une délégation en échec montre l'erreur, sans lien de résultat", () => {
    seed([makeRun({ id: 7, status: "FAILED", summary: null, resultUrl: null, error: "Runner lost: no heartbeat." })]);
    render(<WorkflowPanelContent />);
    fireEvent.click(screen.getByText("SOLO-151 · Runner self-test: add a hello file"));

    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("Runner lost: no heartbeat.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /View result/ })).not.toBeInTheDocument();
  });

  it("une délégation active est dépliée d'office et dit ce qui se passe", () => {
    seed([makeRun({ id: 9, status: "QUEUED", summary: null, resultUrl: null })]);
    render(<WorkflowPanelContent />);

    expect(screen.getByText("Queued")).toBeInTheDocument();
    expect(screen.getByText("Waiting for the agent to pick it up.")).toBeInTheDocument();
  });

  it("run sans clé ni projet (cas dégradé) : repli sur l'id, pas de bouton qui mènerait nulle part", () => {
    seed([makeRun({ issueKey: null, issueTitle: null, projectId: null, projectName: null })]);
    render(<WorkflowPanelContent />);
    fireEvent.click(screen.getByText("Issue #1080"));

    expect(screen.queryByRole("button", { name: /Open issue/ })).not.toBeInTheDocument();
  });

  it("agent inconnu du catalogue : sa clé sert de nom", () => {
    seed([makeRun({ providerKey: "some-new-agent" })]);
    render(<WorkflowPanelContent />);
    expect(screen.getByText(/some-new-agent · Solo Initiatives/)).toBeInTheDocument();
  });

  it("délégations et analyses cohabitent, les délégations d'abord", () => {
    const job = {
      id: 3, projectId: 17, projectName: "Web Application", depth: "QUICK", status: "DONE", plan: [], question: null, error: null,
    } as unknown as AnalysisJob;
    seed([makeRun()], [job]);
    const { container } = render(<WorkflowPanelContent />);

    const labels = [...container.querySelectorAll("p")].map((p) => p.textContent ?? "").filter((t) => /^(Delegations|Analyses)/.test(t));
    expect(labels.map((t) => t.replace(/\s*\d+$/, ""))).toEqual(["Delegations", "Analyses"]);
    expect(within(container).getByText("Web Application")).toBeInTheDocument();
  });
});
