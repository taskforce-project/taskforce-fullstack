import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CONSTANTS_EN } from "@/lib/constants_en";
import OAuthCallbackPage from "./page";

/**
 * Page de rappel OAuth : quand le 2FA est actif, la session n'est délivrée qu'après le code (OSS-1.1).
 */
const { mockOauthCallback, mockOauthTwoFactor, mockToastError } = vi.hoisted(() => ({
  mockOauthCallback: vi.fn(),
  mockOauthTwoFactor: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("code=auth-code&state=signed-state"),
}));
vi.mock("@/lib/api/auth-service", () => ({
  authService: { oauthCallback: mockOauthCallback, oauthTwoFactor: mockOauthTwoFactor },
}));
vi.mock("@/lib/api/invitation-service", () => ({ acceptInvitation: vi.fn() }));
vi.mock("@/lib/utils/pending-invitation", () => ({ takeInvitationToken: () => null }));
vi.mock("@/components/layout/login-intro", () => ({ LoginIntro: () => <div data-testid="intro" /> }));
vi.mock("sonner", () => ({ toast: { error: mockToastError, success: vi.fn() } }));
vi.mock("@/lib/store/preferences-store", async () => {
  const { CONSTANTS_EN: t } = await vi.importActual<typeof import("@/lib/constants_en")>("@/lib/constants_en");
  return { usePreferencesStore: () => ({ t }) };
});

const replace = vi.fn();

describe("OAuth callback page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "location", {
      value: { origin: "http://localhost:3000", replace },
      writable: true,
      configurable: true,
    });
  });

  it("enters the app directly when no second factor is needed", async () => {
    mockOauthCallback.mockResolvedValue({ user: { onboardingCompleted: true }, accessToken: "at" });

    render(<OAuthCallbackPage />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"), { timeout: 2000 });
    expect(mockOauthCallback).toHaveBeenCalledWith({
      code: "auth-code",
      state: "signed-state",
      redirectUri: "http://localhost:3000/auth/callback",
    });
    expect(mockOauthTwoFactor).not.toHaveBeenCalled();
  });

  it("asks for the code, then exchanges the challenge for the session", async () => {
    mockOauthCallback.mockResolvedValue({ twoFactorRequired: true, twoFactorChallenge: "sealed" });
    mockOauthTwoFactor.mockResolvedValue({ user: { onboardingCompleted: false }, accessToken: "at" });

    render(<OAuthCallbackPage />);

    const input = await screen.findByPlaceholderText("000000");
    expect(screen.getByText(CONSTANTS_EN.auth.ui.twoFactorTitle)).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();

    await userEvent.type(input, "123456");
    await userEvent.click(screen.getByRole("button", { name: CONSTANTS_EN.auth.ui.twoFactorVerify }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/onboarding"));
    expect(mockOauthTwoFactor).toHaveBeenCalledWith({ challenge: "sealed", totp: "123456" });
  });

  it("stays on the code step and reports a wrong code", async () => {
    mockOauthCallback.mockResolvedValue({ twoFactorRequired: true, twoFactorChallenge: "sealed" });
    mockOauthTwoFactor.mockRejectedValue(new Error("Invalid code"));

    render(<OAuthCallbackPage />);

    const input = await screen.findByPlaceholderText("000000");
    await userEvent.type(input, "000000");
    await userEvent.click(screen.getByRole("button", { name: CONSTANTS_EN.auth.ui.twoFactorVerify }));

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(CONSTANTS_EN.common.error, { description: "Invalid code" }),
    );
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText("000000")).toHaveValue("");
  });

  it("shows the failure screen when the provider exchange fails", async () => {
    mockOauthCallback.mockRejectedValue(new Error("Expired sign-in"));

    render(<OAuthCallbackPage />);

    expect(await screen.findByText("Expired sign-in")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("000000")).not.toBeInTheDocument();
  });
});
