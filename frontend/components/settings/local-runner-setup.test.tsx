import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { toast } from "sonner";

import { LocalRunnerSetup, runnerEnvFile } from "./local-runner-setup";
import { useDeliveryStore } from "@/lib/store/delivery-store";
import * as svc from "@/lib/api/delivery-service";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Aucun réseau : on pilote le serveur par le service, le vrai store fait le reste.
vi.mock("@/lib/api/delivery-service", () => ({
  getRunnerStatus: vi.fn(),
  provisionRunner: vi.fn(),
  getDeliveryProviders: vi.fn(),
  getIssueRun: vi.fn(),
  listWorkspaceRuns: vi.fn(),
  delegateIssue: vi.fn(),
  getDeliveryKey: vi.fn(),
  connectDeliveryKey: vi.fn(),
  disconnectDeliveryKey: vi.fn(),
}));

const OWNER = "pierre@example.com";
const CREDS = { clientId: "tf-runner-u29", clientSecret: "s3cr3t-value", ownerEmail: OWNER };

function serverHasRunner(exists: boolean) {
  vi.mocked(svc.getRunnerStatus).mockResolvedValue({ exists, clientId: "tf-runner-u29", ownerEmail: OWNER });
}

describe("LocalRunnerSetup : identité de runner en libre-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDeliveryStore.setState({ runner: null });
  });

  it("aucun runner : le crée puis affiche le .env et les commandes, secret compris", async () => {
    serverHasRunner(false);
    vi.mocked(svc.provisionRunner).mockResolvedValue(CREDS);

    render(<LocalRunnerSetup />);
    fireEvent.click(await screen.findByRole("button", { name: "Set up local runner" }));

    expect(await screen.findByText(/secret is shown only once/)).toBeInTheDocument();
    expect(screen.getByText(/TASKFORCE_RUNNER_CLIENT_SECRET=s3cr3t-value/)).toBeInTheDocument();
    expect(screen.getByText(/git clone --depth 1/)).toBeInTheDocument();
    expect(screen.getByText(/npm run check/)).toBeInTheDocument();
    expect(svc.provisionRunner).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith("Local runner created");
  });

  it("« Done » retire le secret de l'écran", async () => {
    serverHasRunner(false);
    vi.mocked(svc.provisionRunner).mockResolvedValue(CREDS);

    render(<LocalRunnerSetup />);
    fireEvent.click(await screen.findByRole("button", { name: "Set up local runner" }));
    fireEvent.click(await screen.findByRole("button", { name: "Done" }));

    expect(screen.queryByText(/s3cr3t-value/)).not.toBeInTheDocument();
  });

  it("runner existant : régénérer demande confirmation avant de casser l'ancien secret", async () => {
    serverHasRunner(true);
    vi.mocked(svc.provisionRunner).mockResolvedValue(CREDS);

    render(<LocalRunnerSetup />);
    expect(await screen.findByText(/is set up for pierre@example.com/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Regenerate secret" }));
    expect(svc.provisionRunner).not.toHaveBeenCalled();
    expect(screen.getByText(/stops working until you paste the new secret/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    expect(await screen.findByText(/TASKFORCE_RUNNER_CLIENT_ID=tf-runner-u29/)).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith("New runner secret generated");
  });

  it("« Cancel » referme la confirmation sans rien régénérer", async () => {
    serverHasRunner(true);

    render(<LocalRunnerSetup />);
    fireEvent.click(await screen.findByRole("button", { name: "Regenerate secret" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("button", { name: "Regenerate secret" })).toBeInTheDocument();
    expect(svc.provisionRunner).not.toHaveBeenCalled();
  });

  it("échec du provisioning : message d'erreur, aucun secret affiché", async () => {
    serverHasRunner(false);
    vi.mocked(svc.provisionRunner).mockRejectedValue(new Error("boom"));

    render(<LocalRunnerSetup />);
    fireEvent.click(await screen.findByRole("button", { name: "Set up local runner" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't set up the runner. Please try again."));
    expect(screen.queryByText(/TASKFORCE_RUNNER_CLIENT_SECRET/)).not.toBeInTheDocument();
  });

  it("copier un bloc passe par le presse-papiers", async () => {
    serverHasRunner(false);
    vi.mocked(svc.provisionRunner).mockResolvedValue(CREDS);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    render(<LocalRunnerSetup />);
    fireEvent.click(await screen.findByRole("button", { name: "Set up local runner" }));
    fireEvent.click(await screen.findByRole("button", { name: "Copy: 2. Save as taskforce-runner/.env" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(runnerEnvFile(CREDS)));
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });
});

describe("runnerEnvFile", () => {
  it("suffixe l'URL publique de l'API par /api, sans double slash", () => {
    expect(runnerEnvFile(CREDS, "https://api.taskforce-project.fr/")).toBe(
      [
        "TASKFORCE_API_URL=https://api.taskforce-project.fr/api",
        "TASKFORCE_RUNNER_CLIENT_ID=tf-runner-u29",
        "TASKFORCE_RUNNER_CLIENT_SECRET=s3cr3t-value",
      ].join("\n"),
    );
  });
});
