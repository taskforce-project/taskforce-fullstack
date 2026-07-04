import { defineConfig, devices } from "@playwright/test";

/**
 * Configuration Playwright — tests E2E des parcours critiques (F-T4).
 *
 * Cible l'app **déjà lancée** (docker-compose dev) : front sur http://localhost:3000, API sur
 * http://localhost:8080 (ports mappés sur l'hôte). Les navigateurs Playwright tournent sur l'hôte
 * ou dans l'image officielle `mcr.microsoft.com/playwright` (le conteneur front est Alpine → non
 * supporté). En CI, `webServer` peut être activé ; en local on suppose la stack déjà up.
 *
 * Lancer : `npm run e2e` (headless) · `npm run e2e:headed` · `npm run e2e:ui`.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["html", { outputFolder: "playwright-report", open: "never" }], ["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
