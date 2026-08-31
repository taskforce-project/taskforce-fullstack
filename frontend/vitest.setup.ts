import { expect, afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock window.matchMedia
Object.defineProperty(globalThis.window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock IntersectionObserver
globalThis.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  takeRecords() {
    return [];
  }
  unobserve() {}
} as any;

// Mock ResizeObserver
globalThis.ResizeObserver = class ResizeObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
} as any;

// Setup localStorage mock
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
globalThis.localStorage = localStorageMock as any;

// Mock window.alert, window.confirm, window.prompt
globalThis.alert = vi.fn();
globalThis.confirm = vi.fn(() => true);
globalThis.prompt = vi.fn(() => null);

// --------------------------------------------------------------------------
// Réseau désactivé en test (happy-dom) - filet de sécurité.
// Des composants déclenchent au montage des appels vers le backend (localhost:8080)
// qui n'existe pas en test → sans stub, happy-dom tente une vraie connexion et rejette
// en ECONNREFUSED *après* la fin du test → rejet non géré → `vitest run` sort en erreur
// (CI rouge) alors que tous les tests passent. On fait échouer le réseau **immédiatement**
// et **de façon déterministe** : le try/catch du composant gère l'échec pendant le test.
// Les tests qui veulent une réponse mockent `apiClient`/les services en amont (ce stub
// n'est atteint que par les appels non mockés).
globalThis.fetch = vi.fn(() =>
  Promise.reject(new Error("Network disabled in tests")),
) as unknown as typeof fetch;

class MockXMLHttpRequest {
  onerror: ((e?: unknown) => void) | null = null;
  onabort: (() => void) | null = null;
  onload: (() => void) | null = null;
  onreadystatechange: (() => void) | null = null;
  readyState = 0;
  status = 0;
  response = "";
  responseText = "";
  open() {}
  setRequestHeader() {}
  abort() {
    this.onabort?.();
  }
  getAllResponseHeaders() {
    return "";
  }
  getResponseHeader() {
    return null;
  }
  addEventListener(type: string, cb: () => void) {
    if (type === "error") this.onerror = cb as (e?: unknown) => void;
  }
  removeEventListener() {}
  send() {
    // Échec réseau immédiat (microtask) → axios rejette « Network Error » tout de suite,
    // capté par l'appelant dans la fenêtre du test (pas de rejet tardif non géré).
    queueMicrotask(() => this.onerror?.(new Error("Network disabled in tests")));
  }
}
globalThis.XMLHttpRequest = MockXMLHttpRequest as unknown as typeof XMLHttpRequest;
