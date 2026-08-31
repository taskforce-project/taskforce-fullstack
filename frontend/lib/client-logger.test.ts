import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { WORKSPACE_ROUTES } from "@/lib/config/api-routes";

/**
 * Journalisation client best-effort (E25). Le module porte un état au niveau module
 * (`lastSent` pour le throttle, `initialized` pour les handlers) → on le recharge à chaque
 * test (`resetModules` + import dynamique) pour repartir d'un état neuf et éviter les fuites
 * d'un test à l'autre.
 */
type ClientLogger = typeof import("./client-logger");

const TOKEN = "tok-123";
const EXPECTED_URL = `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080"}${WORKSPACE_ROUTES.CLIENT_LOG}`;

async function loadModule(): Promise<ClientLogger> {
  vi.resetModules();
  return import("./client-logger");
}

function withToken(present = true): void {
  vi.mocked(localStorage.getItem).mockImplementation((k: string) =>
    k === "accessToken" && present ? TOKEN : null,
  );
}

function bodyOf(mock: ReturnType<typeof vi.fn>, call = 0): Record<string, unknown> {
  return JSON.parse((mock.mock.calls[call][1] as RequestInit).body as string);
}

describe("client-logger - reportClientError", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("n'envoie rien hors session (aucun token)", async () => {
    withToken(false);
    const { reportClientError } = await loadModule();
    reportClientError("error", "boom");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POST authentifié avec le bon corps quand un token est présent", async () => {
    withToken(true);
    const { reportClientError } = await loadModule();
    reportClientError("warn", "hello", "src.ts", "the-stack");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(EXPECTED_URL);
    expect(opts.method).toBe("POST");
    expect((opts.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    const body = bodyOf(fetchMock);
    expect(body).toMatchObject({ level: "warn", message: "hello", source: "src.ts", stack: "the-stack" });
    expect(typeof body.userAgent).toBe("string");
  });

  it("throttle/dédup : même clé dans la fenêtre → 1 envoi, puis renvoi après expiration", async () => {
    withToken(true);
    // Base = timestamp réaliste (~1e12) : le garde `(lastSent ?? 0) + THROTTLE_MS > now`
    // laisserait passer un premier envoi seulement si `now` dépasse THROTTLE_MS (vrai en prod).
    const T0 = 1_000_000_000_000;
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(T0);
    const { reportClientError } = await loadModule();

    reportClientError("error", "meme-message");
    reportClientError("error", "meme-message");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    nowSpy.mockReturnValue(T0 + 10_001); // > THROTTLE_MS (10 s)
    reportClientError("error", "meme-message");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("tronque message / source / stack aux bornes", async () => {
    withToken(true);
    const { reportClientError } = await loadModule();
    reportClientError("error", "m".repeat(5000), "s".repeat(1000), "k".repeat(20000));
    const body = bodyOf(fetchMock);
    expect(body.message).toHaveLength(2000);
    expect(body.source).toHaveLength(512);
    expect(body.stack).toHaveLength(8000);
  });

  it("best-effort : une exception synchrone de fetch est avalée (jamais de throw)", async () => {
    withToken(true);
    fetchMock.mockImplementation(() => {
      throw new Error("sync boom");
    });
    const { reportClientError } = await loadModule();
    expect(() => reportClientError("error", "explose")).not.toThrow();
  });
});

describe("client-logger - initClientLogger", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let addSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("fetch", fetchMock);
    addSpy = vi.spyOn(window, "addEventListener");
  });

  afterEach(() => {
    // Le code de prod ne retire jamais ses handlers globaux (voulu) ; en test, chaque
    // `resetModules` en pose de nouveaux → sans nettoyage ils s'accumulent sur `window` et
    // faussent le comptage. On retire exactement ceux que ce test a posés.
    for (const [type, handler] of addSpy.mock.calls) {
      window.removeEventListener(type as string, handler as EventListener);
    }
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("installe les handlers globaux une seule fois (idempotent)", async () => {
    const { initClientLogger } = await loadModule();
    initClientLogger();
    expect(addSpy).toHaveBeenCalledWith("error", expect.any(Function));
    expect(addSpy).toHaveBeenCalledWith("unhandledrejection", expect.any(Function));
    const callsAfterFirst = addSpy.mock.calls.length;
    initClientLogger(); // second appel = no-op
    expect(addSpy.mock.calls.length).toBe(callsAfterFirst);
  });

  it("window.onerror → remonte l'erreur", async () => {
    withToken(true);
    const { initClientLogger } = await loadModule();
    initClientLogger();
    window.dispatchEvent(new ErrorEvent("error", { message: "boom", filename: "a.ts" }));
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(bodyOf(fetchMock).message).toBe("boom");
  });

  it("unhandledrejection → remonte le motif", async () => {
    withToken(true);
    const { initClientLogger } = await loadModule();
    initClientLogger();
    const ev = new Event("unhandledrejection") as Event & { reason?: unknown };
    ev.reason = { message: "rejet-x", stack: "stack-x" };
    window.dispatchEvent(ev);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(bodyOf(fetchMock).message).toContain("Unhandled rejection: rejet-x");
  });
});
