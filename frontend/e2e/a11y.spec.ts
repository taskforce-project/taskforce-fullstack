import { test, expect, type Page } from "@playwright/test";
import path from "path";
import { login, DEMO } from "./helpers";

/**
 * Audit d'accessibilité (C13/C15 — RGAA / WCAG 2.1 AA) via axe-core injecté dans la page.
 * axe.min.js est copié depuis node_modules (voir README). On journalise les violations par impact
 * et on échoue sur les **critiques** (barre minimale) ; serious/moderate/minor sont rapportés.
 */

const AXE_PATH = path.join(__dirname, "axe.min.js");
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

interface AxeViolation {
  id: string;
  impact: string | null;
  help: string;
  helpUrl: string;
  nodes: unknown[];
}

async function scan(page: Page, label: string): Promise<AxeViolation[]> {
  await page.addScriptTag({ path: AXE_PATH });
  const results = await page.evaluate(async (tags) => {
    // @ts-expect-error axe est injecté globalement par addScriptTag
    return await window.axe.run(document, { runOnly: { type: "tag", values: tags } });
  }, WCAG_TAGS);

  const violations = (results.violations ?? []) as AxeViolation[];
  const count = (imp: string) => violations.filter((v) => v.impact === imp).reduce((n, v) => n + v.nodes.length, 0);
  console.log(
    `\n[a11y] ${label} — ${violations.length} règles en échec ` +
      `(critical=${count("critical")}, serious=${count("serious")}, moderate=${count("moderate")}, minor=${count("minor")})`,
  );
  for (const v of violations) {
    console.log(`  - [${v.impact}] ${v.id} × ${v.nodes.length} : ${v.help}`);
    for (const n of v.nodes.slice(0, 8) as Array<{ target: string[]; html: string }>) {
      console.log(`      -> ${n.target?.join(" ")} | ${n.html?.slice(0, 120)}`);
    }
  }
  return violations;
}

test.describe("Accessibilité (axe-core WCAG 2.1 AA)", () => {
  test("page de connexion", async ({ page }) => {
    await page.goto("/auth/login");
    await page.waitForLoadState("networkidle");
    const violations = await scan(page, "/auth/login");
    expect(violations.filter((v) => v.impact === "critical")).toEqual([]);
  });

  test("dashboard", async ({ page }) => {
    await login(page);
    await page.goto(`/${DEMO.workspaceSlug}/dashboard`);
    await page.waitForLoadState("networkidle");
    const violations = await scan(page, "dashboard");
    expect(violations.filter((v) => v.impact === "critical")).toEqual([]);
  });

  test("membres", async ({ page }) => {
    await login(page);
    await page.goto(`/${DEMO.workspaceSlug}/members`);
    await page.waitForLoadState("networkidle");
    // Attendre le rendu réel des lignes (fetch client) → scan stable.
    await page.getByText(/@seed\.taskforce\.dev/i).first().waitFor({ timeout: 15_000 });
    const violations = await scan(page, "membres");
    expect(violations.filter((v) => v.impact === "critical")).toEqual([]);
  });
});
