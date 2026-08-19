import { describe, it, expect, afterEach, vi } from "vitest";
import { render } from "@testing-library/react";
import { TurnstileWidget } from "./turnstile-widget";

/**
 * Frontière d'intégration anti-bot : on ne charge jamais le vrai `api.js` de Cloudflare en test.
 * On simule l'API globale `window.turnstile` et on vérifie le cycle de vie que le composant pilote
 * lui-même : rendu explicite unique, câblage des callbacks (jeton / expiration / erreur), injection
 * du script quand l'API est absente, et retrait au démontage.
 */

const SCRIPT_ID = "cf-turnstile-script";
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";

type RenderOptions = {
  sitekey: string;
  action?: string;
  theme?: "light" | "dark" | "auto";
  callback: (token: string) => void;
  "expired-callback": () => void;
  "error-callback": () => void;
};

function installTurnstile(widgetId = "widget-1") {
  const api = {
    // Signature portée par le type générique (et non par des paramètres nommés inutilisés) → l'appel
    // `api.render.mock.calls[0][1]` reste typé `RenderOptions` sans déclencher no-unused-vars.
    render: vi.fn<(container: HTMLElement, options: RenderOptions) => string>(() => widgetId),
    remove: vi.fn<(id: string) => void>(() => {}),
  };
  (window as unknown as { turnstile?: typeof api }).turnstile = api;
  return api;
}

function clearTurnstile(): void {
  delete (window as unknown as { turnstile?: unknown }).turnstile;
}

afterEach(() => {
  clearTurnstile();
  document.querySelectorAll(`#${SCRIPT_ID}`).forEach((s) => s.remove());
  vi.restoreAllMocks();
});

describe("TurnstileWidget", () => {
  it("rend le widget une seule fois avec la sitekey et câble le callback jeton", () => {
    const api = installTurnstile();
    const onToken = vi.fn();

    render(<TurnstileWidget siteKey="site-123" onToken={onToken} />);

    expect(api.render).toHaveBeenCalledOnce();
    const opts = api.render.mock.calls[0][1];
    expect(opts.sitekey).toBe("site-123");

    opts.callback("tok-xyz");
    expect(onToken).toHaveBeenCalledWith("tok-xyz");
  });

  it("vide le jeton à l'expiration et à l'erreur", () => {
    const api = installTurnstile();
    const onToken = vi.fn();
    render(<TurnstileWidget siteKey="s" onToken={onToken} />);
    const opts = api.render.mock.calls[0][1];

    opts["expired-callback"]();
    opts["error-callback"]();
    expect(onToken).toHaveBeenNthCalledWith(1, "");
    expect(onToken).toHaveBeenNthCalledWith(2, "");
  });

  it("retire le widget au démontage", () => {
    const api = installTurnstile("w-42");
    const { unmount } = render(<TurnstileWidget siteKey="s" onToken={vi.fn()} />);
    unmount();
    expect(api.remove).toHaveBeenCalledWith("w-42");
  });

  it("injecte le script Turnstile quand l'API globale est absente, puis rend au load", () => {
    clearTurnstile();
    render(<TurnstileWidget siteKey="s" onToken={vi.fn()} />);

    const script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    expect(script).not.toBeNull();
    expect(script?.src).toBe(SCRIPT_SRC);

    // Le script charge → l'API globale apparaît → rendu explicite.
    const api = installTurnstile();
    script?.dispatchEvent(new Event("load"));
    expect(api.render).toHaveBeenCalledOnce();
  });

  it("ne réinjecte pas le script s'il existe déjà", () => {
    clearTurnstile();
    const pre = document.createElement("script");
    pre.id = SCRIPT_ID;
    document.head.appendChild(pre);

    render(<TurnstileWidget siteKey="s" onToken={vi.fn()} />);
    expect(document.querySelectorAll(`#${SCRIPT_ID}`)).toHaveLength(1);

    const api = installTurnstile();
    pre.dispatchEvent(new Event("load"));
    expect(api.render).toHaveBeenCalledOnce();
  });

  it("ne fait rien sans sitekey", () => {
    clearTurnstile();
    render(<TurnstileWidget siteKey="" onToken={vi.fn()} />);
    expect(document.getElementById(SCRIPT_ID)).toBeNull();
  });
});
