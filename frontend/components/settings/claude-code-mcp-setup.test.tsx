import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { ClaudeCodeMcpSetup, claudeMcpAddCommand, mcpServerUrl } from "./claude-code-mcp-setup";
import { useAccessTokenStore } from "@/lib/store/access-token-store";
import * as svc from "@/lib/api/access-token-service";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Aucun réseau : on pilote le serveur par le service, le vrai store fait le reste.
vi.mock("@/lib/api/access-token-service", () => ({
  listAccessTokens: vi.fn(),
  createAccessToken: vi.fn(),
  revokeAccessToken: vi.fn(),
}));

const TOKEN = { id: 3, name: "Laptop", hint: "tfp_abcdefgh", createdAt: "2026-10-18T12:00:00", lastUsedAt: null,
  expiresAt: "2027-01-16T12:00:00", expired: false };

describe("ClaudeCodeMcpSetup : jeton personnel pour Claude Code", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAccessTokenStore.setState({ tokens: null });
  });

  it("adresse du serveur MCP du workspace et commande de branchement", () => {
    expect(mcpServerUrl("acme", "https://api.example.org/")).toBe("https://api.example.org/api/workspaces/acme/mcp");
    expect(claudeMcpAddCommand("acme", "tfp_x", "https://api.example.org"))
      .toBe('claude mcp add --transport http taskforce https://api.example.org/api/workspaces/acme/mcp --header "Authorization: Bearer tfp_x"');
  });

  it("liste les jetons sans leur valeur, et révoque", async () => {
    vi.mocked(svc.listAccessTokens).mockResolvedValue([TOKEN]);
    vi.mocked(svc.revokeAccessToken).mockResolvedValue(undefined);
    render(<ClaudeCodeMcpSetup slug="acme" />);

    expect(await screen.findByText("Laptop")).toBeInTheDocument();
    expect(screen.getByText("tfp_abcdefgh...")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));

    await waitFor(() => expect(svc.revokeAccessToken).toHaveBeenCalledWith(3));
    await waitFor(() => expect(screen.queryByText("Laptop")).not.toBeInTheDocument());
  });

  it("crée un jeton, montre la commande une fois, puis l'oublie", async () => {
    vi.mocked(svc.listAccessTokens).mockResolvedValue([]);
    vi.mocked(svc.createAccessToken).mockResolvedValue({ token: TOKEN, value: "tfp_shown-once" });
    render(<ClaudeCodeMcpSetup slug="acme" />);

    fireEvent.click(await screen.findByRole("button", { name: "Create an access token" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Laptop" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(svc.createAccessToken).toHaveBeenCalledWith("Laptop", 90));
    expect(await screen.findByText(/claude mcp add --transport http taskforce/)).toBeInTheDocument();
    expect(screen.getByText(/Bearer tfp_shown-once/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByText(/tfp_shown-once/)).not.toBeInTheDocument();
  });
});
