import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { PendingApproval } from "./pending-approval";
import { useDeliveryStore } from "@/lib/store/delivery-store";
import * as svc from "@/lib/api/delivery-service";
import type { DeliveryRun, DeliveryRunActivity, DeliveryRunApproval } from "@/lib/api/delivery-service";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Aucun réseau : la décision passe par le vrai store, le service est simulé.
vi.mock("@/lib/api/delivery-service", () => ({
  getRunActivity: vi.fn(),
  decideApproval: vi.fn(),
  listOpenApprovals: vi.fn(),
  downloadEvidence: vi.fn(),
  getRunnerStatus: vi.fn(),
  provisionRunner: vi.fn(),
  getDeliveryProviders: vi.fn(),
  getIssueRun: vi.fn(),
  listWorkspaceRuns: vi.fn(),
  delegateIssue: vi.fn(),
}));

const RUN = { status: "RUNNING", refused: false, outcome: null, tests: null, error: null, issueId: 28, issueKey: "TF-28", startedByName: "Pierre" } as Pick<
  DeliveryRun, "status" | "refused" | "outcome" | "tests" | "error" | "issueId" | "issueKey" | "startedByName">;

const approval = (overrides: Partial<DeliveryRunApproval> = {}): DeliveryRunApproval => ({
  id: 9, tool: "Bash", summary: "python scripts/gen.py", status: "PENDING", createdAt: null,
  expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(), decidedAt: null, decidedBy: null, canDecide: true,
  ...overrides,
});

const NO_ACTIVITY: DeliveryRunActivity = { events: [], approvals: [] };

function show(asked: DeliveryRunApproval, props: { goal?: string; compact?: boolean; showCommand?: boolean } = {}) {
  return render(<PendingApproval slug="acme" runId={100} approval={asked} run={RUN} {...props} />);
}

describe("PendingApproval : ce que l'agent demande, en mots (R78, R133)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDeliveryStore.setState({ activity: {} });
    vi.mocked(svc.getRunActivity).mockResolvedValue(NO_ACTIVITY);
    vi.mocked(svc.listOpenApprovals).mockResolvedValue([]);
  });

  it("la demande se dit en mots : l'action, la raison de la règle, la tâche, et ce qui se passe si l'on refuse", () => {
    show(approval({
      tool: "WebSearch", summary: "electron-updater progress", action: "web.search", rule: "search-web",
      reason: "A web search sends its query out of the machine, where it cannot be taken back.",
    }), { goal: "Make the update visible (TF-31)" });

    expect(screen.getByRole("group", { name: "Claude Code wants to search the web" })).toBeInTheDocument();
    expect(screen.getByText("Search the web for electron-updater progress")).toBeInTheDocument();
    expect(screen.getByText(/Send this query to a search engine/)).toBeInTheDocument();
    expect(screen.getByText("A web search sends its query out of the machine, where it cannot be taken back.")).toBeInTheDocument();
    expect(screen.getByText("Make the update visible (TF-31)")).toBeInTheDocument();
    expect(screen.getByText("It continues without this search.")).toBeInTheDocument();
    expect(screen.getByText(/means no\. You will see that it was refused\./)).toBeInTheDocument();
  });

  it("la commande reste repliée : une phrase d'abord, le brut derrière un clic", () => {
    show(approval({ action: "shell" }));

    expect(screen.getByText("Run a script")).toBeInTheDocument();
    expect(screen.getByText("Show the command").closest("details")).not.toHaveAttribute("open");
  });

  it("l'interrupteur de la vue montre la commande tout de suite", () => {
    show(approval({ action: "shell" }), { showCommand: true });

    expect(screen.getByText("Bash python scripts/gen.py")).toBeVisible();
    expect(screen.queryByText("Show the command")).toBeNull();
  });

  it("une action sans règle se dit en mots, jamais par le nom de l'outil", () => {
    show(approval({ tool: "taskforce: delete_issue", summary: '{"issueId":3}', action: null }));

    expect(screen.getByRole("group", { name: "Claude Code wants to delete an issue" })).toBeInTheDocument();
  });

  it("la personne qui a délégué autorise pour le reste de la mission (R46)", async () => {
    vi.mocked(svc.decideApproval).mockResolvedValue(undefined);
    show(approval());

    fireEvent.click(screen.getByRole("button", { name: "Allow for this mission" }));

    await waitFor(() => expect(svc.decideApproval).toHaveBeenCalledWith("acme", 100, 9, true, true));
    const { toast } = await import("sonner");
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Allowed for this mission"));
  });

  it("refuser envoie DENY, sans portée", async () => {
    vi.mocked(svc.decideApproval).mockResolvedValue(undefined);
    show(approval());

    fireEvent.click(screen.getByRole("button", { name: "Refuse" }));

    await waitFor(() => expect(svc.decideApproval).toHaveBeenCalledWith("acme", 100, 9, false, false));
    const { toast } = await import("sonner");
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Refused: the agent goes on without it"));
  });

  it("une demande de TaskForce lui-même le dit, et s'accorde une fois (J4)", async () => {
    vi.mocked(svc.decideApproval).mockResolvedValue(undefined);
    show(approval({ tool: "git push", askedBy: "runner", action: "git.push" }));

    expect(screen.getByRole("group", { name: "TaskForce wants to push the branch" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Allow for this mission" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Allow" }));

    await waitFor(() => expect(svc.decideApproval).toHaveBeenCalledWith("acme", 100, 9, true, false));
  });

  it("une décision refusée par le serveur ne dit pas qu'elle a réussi", async () => {
    vi.mocked(svc.decideApproval).mockRejectedValue(new Error("expired"));
    show(approval());

    fireEvent.click(screen.getByRole("button", { name: "Refuse" }));

    await waitFor(() => expect(svc.listOpenApprovals).toHaveBeenCalled());
    const { toast } = await import("sonner");
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("un coéquipier voit la demande, sans pouvoir y répondre", () => {
    show(approval({ canDecide: false }));

    expect(screen.getByText(/Waiting for the person who delegated/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Allow for this mission" })).not.toBeInTheDocument();
  });

  it("sans échéance connue, le délai est passé", () => {
    show(approval({ expiresAt: null }));

    expect(screen.getByText(/less than a minute means no/)).toBeInTheDocument();
  });

  describe("compact : dans la conversation et sur l'issue", () => {
    it("une ligne et ses deux boutons, sans le pourquoi", async () => {
      vi.mocked(svc.decideApproval).mockResolvedValue(undefined);
      show(approval({ action: "shell", reason: "Commands can change things." }), { compact: true });

      expect(screen.getByRole("group", { name: "Claude Code wants to run a command" })).toBeInTheDocument();
      expect(screen.queryByText("Commands can change things.")).toBeNull();
      expect(screen.queryByText("Show the command")).toBeNull();
      expect(screen.getByText(/means no/)).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Allow for this mission" }));
      await waitFor(() => expect(svc.decideApproval).toHaveBeenCalledWith("acme", 100, 9, true, true));
    });

    it("un coéquipier y voit seulement qu'elle attend", () => {
      show(approval({ canDecide: false }), { compact: true });

      expect(screen.getByText(/Waiting for the person who delegated/)).toBeInTheDocument();
      expect(screen.queryByRole("button")).toBeNull();
    });
  });
  // Une règle de l'entreprise désigne qui accorde (R98) : la carte le dit, à qui attend comme à qui signe.
  it("la règle du CEO : la personne qui a délégué voit qui accorde, la responsable voit ses boutons", () => {
    const waiting = { waitingFor: [["Marie Martin"]], signatures: 1, separate: false, signedBy: [] };
    show(approval({ ...waiting, canDecide: false }));
    expect(screen.getByText(/Waits for Marie Martin\./)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Allow/ })).not.toBeInTheDocument();
  });

  it("deux signatures sans celle de qui a délégué : la carte compte les signatures, et garde les boutons", () => {
    show(approval({ waitingFor: [], signatures: 2, separate: true, signedBy: ["Ada"] }), { compact: true });
    expect(screen.getByText(/2 different people approve: 1 so far\./)).toBeInTheDocument();
    expect(screen.getByText(/The person who delegated this task can't approve it\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Allow/ })).toBeInTheDocument();
  });
});
