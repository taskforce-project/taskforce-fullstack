import { beforeEach, describe, expect, it, vi } from "vitest";

import * as service from "../api/passkey-service";
import * as browser from "../auth/passkeys";
import { usePasskeyStore } from "./passkey-store";

vi.mock("../api/passkey-service", () => ({
  listPasskeys: vi.fn(),
  passkeyRegistrationOptions: vi.fn(),
  registerPasskey: vi.fn(),
  removePasskey: vi.fn(),
}));

vi.mock("../auth/passkeys", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../auth/passkeys")>()),
  createPasskey: vi.fn(),
}));

const OLD = { id: "pk-0", label: "Security key or phone", createdAt: "2026-10-01T10:00:00", lastUsedAt: null };
const NEW = { id: "pk-1", label: "Passkey on Windows", createdAt: "2026-10-19T20:00:00", lastUsedAt: null };

describe("usePasskeyStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePasskeyStore.setState({ passkeys: null, error: null });
    vi.mocked(service.passkeyRegistrationOptions).mockResolvedValue({ challenge: "c" });
  });

  it("lists the passkeys of the account", async () => {
    vi.mocked(service.listPasskeys).mockResolvedValue([OLD]);

    expect(await usePasskeyStore.getState().fetchPasskeys()).toEqual([OLD]);
    expect(usePasskeyStore.getState().passkeys).toEqual([OLD]);
  });

  it("keeps the list unread when it can't be read", async () => {
    vi.mocked(service.listPasskeys).mockRejectedValue(new Error("offline"));

    expect(await usePasskeyStore.getState().fetchPasskeys()).toBeNull();
    expect(usePasskeyStore.getState().passkeys).toBeNull();
  });

  it("creates a passkey on this device, names it after the device and puts it first", async () => {
    usePasskeyStore.setState({ passkeys: [OLD] });
    vi.mocked(browser.createPasskey).mockResolvedValue({ id: "abc", authenticatorAttachment: "platform" });
    vi.mocked(service.registerPasskey).mockResolvedValue(NEW);
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");

    expect(await usePasskeyStore.getState().addPasskey()).toEqual(NEW);
    expect(browser.createPasskey).toHaveBeenCalledWith({ challenge: "c" });
    expect(service.registerPasskey).toHaveBeenCalledWith("Passkey on Windows", { id: "abc", authenticatorAttachment: "platform" });
    expect(usePasskeyStore.getState().passkeys).toEqual([NEW, OLD]);
  });

  it("adds the first passkey to an unread list", async () => {
    vi.mocked(browser.createPasskey).mockResolvedValue({ id: "abc" });
    vi.mocked(service.registerPasskey).mockResolvedValue(NEW);

    await usePasskeyStore.getState().addPasskey();

    expect(usePasskeyStore.getState().passkeys).toEqual([NEW]);
  });

  it("does nothing when the person closes the browser window", async () => {
    vi.mocked(browser.createPasskey).mockResolvedValue(null);

    expect(await usePasskeyStore.getState().addPasskey()).toBeNull();
    expect(usePasskeyStore.getState().error).toBeNull();
    expect(service.registerPasskey).not.toHaveBeenCalled();
  });

  it("explains a passkey this device already has", async () => {
    vi.mocked(browser.createPasskey).mockRejectedValue(new browser.PasskeyError("exists"));

    expect(await usePasskeyStore.getState().addPasskey()).toBeNull();
    expect(usePasskeyStore.getState().error).toBe("This device already has a passkey for this account.");
  });

  it("passes on the server's reason", async () => {
    vi.mocked(browser.createPasskey).mockResolvedValue({ id: "abc" });
    vi.mocked(service.registerPasskey).mockRejectedValue(new Error("Adding the passkey took too long. Try again."));

    expect(await usePasskeyStore.getState().addPasskey()).toBeNull();
    expect(usePasskeyStore.getState().error).toBe("Adding the passkey took too long. Try again.");
  });

  it("removes a passkey from the list", async () => {
    usePasskeyStore.setState({ passkeys: [NEW, OLD], error: "old" });
    vi.mocked(service.removePasskey).mockResolvedValue(undefined);

    expect(await usePasskeyStore.getState().removePasskey("pk-1")).toBe(true);
    expect(usePasskeyStore.getState().passkeys).toEqual([OLD]);
    expect(usePasskeyStore.getState().error).toBeNull();
  });

  it("removes from an unread list without failing", async () => {
    vi.mocked(service.removePasskey).mockResolvedValue(undefined);

    expect(await usePasskeyStore.getState().removePasskey("pk-1")).toBe(true);
    expect(usePasskeyStore.getState().passkeys).toEqual([]);
  });

  it("says why a passkey couldn't be removed", async () => {
    vi.mocked(service.removePasskey).mockRejectedValue(new Error("Passkey not found"));

    expect(await usePasskeyStore.getState().removePasskey("pk-9")).toBe(false);
    expect(usePasskeyStore.getState().error).toBe("Passkey not found");
  });
});
