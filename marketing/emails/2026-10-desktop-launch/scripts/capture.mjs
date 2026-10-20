// Captures de l'interface desktop de TaskForce (build NEXT_PUBLIC_DESKTOP, données de démo du dev) pour l'e-mail :
// tableau de bord, board d'un projet, délégation d'un ticket à Claude Code, note du Brain OS (WebP). Passe par
// scripts/desktop-relay.cjs, qui joue le rôle de la coque. Sortie : captures/ (1440 x 900, x2, thème clair).
// Usage : node scripts/capture.mjs [--only=dashboard,board,delegate,brain-note]
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "playwright-core";

const BASE = "http://localhost:5180";
const WS = "taskforce-demo";
const OUT = join(import.meta.dirname, "..", "captures");
mkdirSync(OUT, { recursive: true });

const only = (process.argv.find((a) => a.startsWith("--only=")) ?? "").slice(7).split(",").filter(Boolean);
const want = (name) => only.length === 0 || only.includes(name);

const browser = await chromium.launch({ channel: "msedge" });
const context = await browser.newContext({
  baseURL: BASE,
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: "light",
  locale: "en-US",
});
await context.addInitScript(() => {
  // Pont de la coque (desktop/src/preload.ts), réduit à ce que ces pages lisent ; le relais pose le vrai jeton.
  const ok = (value) => Promise.resolve({ ok: true, value });
  const done = async () => {};
  window.taskforceDesktop = {
    launchToken: "tfd_capture",
    version: "1.2.1",
    platform: "win32",
    email: "admin@taskforce.dev",
    onboardedOnline: true,
    signOut: done,
    openAccountPage: done,
    checkForUpdates: async () => ({ status: "up-to-date", version: "1.2.1" }),
    openLogs: done,
    openBackups: done,
    notify: () => {},
    onNavigate: () => () => {},
    setTitleBarTheme: () => {},
    ai: { get: async () => ({ settings: { provider: "none" }, hasApiKey: false }), save: async () => ({ ok: true }) },
    tools: { status: async () => ({ claude: { installed: true, signedIn: true }, gh: { installed: true, signedIn: true }, git: { installed: true } }) },
    github: {
      repos: () => ok([]), repo: () => ok(null), createRepo: () => ok(""), signIn: () => ok(""),
      openSignInPage: done, waitForSignIn: async () => ({ ok: true }), cancelSignIn: done,
    },
    projects: {
      web: () => ok([]), bring: () => ok(null), send: () => ok(null),
      bringWorkspace: () => ok(null), sendWorkspace: () => ok(null), openWeb: done,
    },
    claude: { mcpStatus: () => ok({ connected: true }), connectMcp: () => ok(undefined), disconnectMcp: () => ok(undefined) },
  };
  try {
    localStorage.setItem("theme", "light");
    localStorage.setItem("tf-product-tour", JSON.stringify({ state: { hasSeen: true }, version: 0 }));
    localStorage.setItem("tf-cookie-consent", JSON.stringify({ analytics: false, v: 2, ts: Date.now() }));
  } catch {}
  const hide = () => {
    if (!document.head) return;
    const st = document.createElement("style");
    st.textContent = "nextjs-portal{display:none!important}";
    document.head.appendChild(st);
  };
  if (document.head) hide();
  else document.addEventListener("DOMContentLoaded", hide);
});
const page = await context.newPage();

/** Capture en PNG, puis WebP de haute qualité (les images composées sont bien plus petites, rien ne se voit). */
async function shot(name) {
  await page.waitForTimeout(900);
  const png = join(OUT, `${name}.png`);
  await page.screenshot({ path: png });
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", png, "-c:v", "libwebp", "-quality", "92", join(OUT, `${name}.webp`)]);
  rmSync(png);
  console.log("saved", name);
}

async function goto(path, readyText) {
  await page.goto(path, { waitUntil: "load" });
  if (readyText) await page.getByText(readyText).first().waitFor({ timeout: 90_000 });
  await page.waitForTimeout(1500);
}

if (want("dashboard")) {
  await goto(`/${WS}/dashboard`, /pick up where you left off/i);
  await shot("dashboard");
}

let boardPath = null;
if (want("board") || want("delegate")) {
  await goto(`/${WS}/projects`, /web application/i);
  await page.getByText(/^web application$/i).first().click();
  await page.getByText(/^backlog$/i).first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  boardPath = new URL(page.url()).pathname;
  console.log("board at", boardPath);
  if (want("board")) await shot("board");
}

if (want("delegate")) {
  await page.getByText("Rebuild the settings navigation").first().click({ timeout: 15_000 });
  await page.getByRole("dialog").first().waitFor({ timeout: 15_000 });
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: /change assignee/i }).first().click({ timeout: 10_000 });
  await page.keyboard.type("Claude", { delay: 60 });
  await page.getByText(/^claude code$/i).first().waitFor({ timeout: 15_000 });
  await shot("delegate");
  await page.keyboard.press("Escape");
}


if (want("brain-note")) {
  await goto(`/${WS}/brain`, /^web application$/i);
  await page.getByText(/^web application$/i).last().click();
  await page.waitForTimeout(2500);
  await shot("brain-note");
}

await browser.close();
