import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { RunActivity } from "./run-activity";
import { useDeliveryStore } from "@/lib/store/delivery-store";
import * as svc from "@/lib/api/delivery-service";
import type { DeliveryRunActivity, DeliveryRunApproval } from "@/lib/api/delivery-service";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Aucun réseau : la décision passe par le vrai store, le service est simulé.
vi.mock("@/lib/api/delivery-service", () => ({
  getRunActivity: vi.fn(),
  decideApproval: vi.fn(),
  downloadEvidence: vi.fn(),
  getRunnerStatus: vi.fn(),
  provisionRunner: vi.fn(),
  getDeliveryProviders: vi.fn(),
  getIssueRun: vi.fn(),
  listWorkspaceRuns: vi.fn(),
  delegateIssue: vi.fn(),
}));

const approval = (overrides: Partial<DeliveryRunApproval> = {}): DeliveryRunApproval => ({
  id: 9, tool: "Bash", summary: "npm install lodash", status: "PENDING", createdAt: null,
  expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(), decidedAt: null, decidedBy: null, canDecide: true,
  ...overrides,
});

const activity = (approvals: DeliveryRunApproval[] = []): DeliveryRunActivity => ({
  events: [
    { seq: 1, kind: "start", tool: null, text: "Claude Code 2.1.293 started", at: null },
    { seq: 2, kind: "tool", tool: "taskforce: get_issue", text: '{"projectId":12}', at: null },
    { seq: 3, kind: "denied", tool: "WebFetch", text: "Denied in TaskForce", at: null },
  ],
  approvals,
});

describe("RunActivity : chronologie en direct et validations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDeliveryStore.setState({ activity: {} });
  });

  it("montre la chronologie du run pendant qu'il tourne", () => {
    render(<RunActivity slug="acme" runId={100} activity={activity()} live />);

    expect(screen.getByRole("list", { name: "Agent activity" })).toBeInTheDocument();
    expect(screen.getByText("Claude Code 2.1.293 started")).toBeInTheDocument();
    expect(screen.getByText(/taskforce: get_issue/)).toBeInTheDocument();
    expect(screen.getByText("Denied in TaskForce")).toBeInTheDocument();
  });

  it("la personne qui a délégué autorise une action en attente", async () => {
    vi.mocked(svc.decideApproval).mockResolvedValue(undefined);
    vi.mocked(svc.getRunActivity).mockResolvedValue(activity([approval({ status: "ALLOWED", canDecide: false })]));
    render(<RunActivity slug="acme" runId={100} activity={activity([approval()])} live />);

    expect(screen.getByText(/Claude Code asks to run Bash/)).toBeInTheDocument();
    expect(screen.getByText("npm install lodash")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Allow" }));

    await waitFor(() => expect(svc.decideApproval).toHaveBeenCalledWith("acme", 100, 9, true));
  });

  it("refuser envoie DENY", async () => {
    vi.mocked(svc.decideApproval).mockResolvedValue(undefined);
    vi.mocked(svc.getRunActivity).mockResolvedValue(activity());
    render(<RunActivity slug="acme" runId={100} activity={activity([approval()])} live />);

    fireEvent.click(screen.getByRole("button", { name: "Deny" }));

    await waitFor(() => expect(svc.decideApproval).toHaveBeenCalledWith("acme", 100, 9, false));
  });

  it("un coéquipier voit la demande, sans pouvoir y répondre", () => {
    render(<RunActivity slug="acme" runId={100} activity={activity([approval({ canDecide: false })])} live />);

    expect(screen.getByText(/Waiting for the person who delegated/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Allow" })).not.toBeInTheDocument();
  });

  it("run terminé : plus de boutons, l'issue des demandes reste dans la chronologie repliée", () => {
    render(<RunActivity slug="acme" runId={100}
      activity={activity([approval({ status: "DENIED", decidedBy: "Ada", canDecide: false })])} live={false} />);

    expect(screen.queryByRole("button", { name: "Allow" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Show activity \(3 steps\)/ }));
    expect(screen.getByText(/Denied by Ada/)).toBeInTheDocument();
  });

  it("run terminé : le dossier se télécharge en JSON ou en Markdown", async () => {
    vi.mocked(svc.downloadEvidence).mockResolvedValue(undefined);
    render(<RunActivity slug="acme" runId={100} activity={activity()} live={false} />);

    fireEvent.click(screen.getByRole("button", { name: "JSON" }));
    fireEvent.click(screen.getByRole("button", { name: "Markdown" }));

    await waitFor(() => expect(svc.downloadEvidence).toHaveBeenCalledWith("acme", 100, "md"));
    expect(svc.downloadEvidence).toHaveBeenCalledWith("acme", 100, "json");
  });

  it("run sans dossier : le dit, sans rien télécharger", async () => {
    vi.mocked(svc.downloadEvidence).mockRejectedValue(new Error("404"));
    const { toast } = await import("sonner");
    render(<RunActivity slug="acme" runId={100} activity={activity()} live={false} />);

    fireEvent.click(screen.getByRole("button", { name: "JSON" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/No record for this run/)));
  });

  it("run en cours : pas encore de dossier à télécharger", () => {
    render(<RunActivity slug="acme" runId={100} activity={activity()} live />);
    expect(screen.queryByRole("button", { name: "JSON" })).not.toBeInTheDocument();
  });

  it("rien à montrer sans activité", () => {
    const { container } = render(<RunActivity slug="acme" runId={100} activity={undefined} live />);
    expect(container).toBeEmptyDOMElement();
  });
});
