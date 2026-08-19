import { test, expect, type Page } from "@playwright/test";
import path from "path";
import { login, DEMO } from "./helpers";

/**
 * Audit d'accessibilité (C13/C15 — RGAA / WCAG 2.1 AA) via axe-core injecté dans la page.
 * axe.min.js est copié depuis node_modules (voir README).
 *
 * <p><b>Seuil relevé le 22/07/2026.</b> Ce fichier s'intitulait « WCAG 2.1 AA » mais n'échouait que
 * sur les violations <i>critical</i>. Or les manquements au niveau AA remontent en <i>serious</i> :
 * <code>color-contrast</code> (critère 1.4.3) et <code>nested-interactive</code> (4.1.2) passaient
 * donc silencieusement, et l'audit affichait « 0 violation » alors que la page de connexion en
 * comptait 4 et le dashboard 6. Le test attestait un niveau qu'il ne vérifiait pas.
 *
 * <p>Les deux pages sont désormais à zéro et le seuil inclut <b>serious</b>, pour que la régression
 * ne puisse pas repasser inaperçue. `moderate` et `minor` restent journalisés sans bloquer.
 */

/** Impacts qui font échouer le test : ce sont ceux qui recouvrent le niveau AA. */
const BLOCKING = new Set(["critical", "serious"]);

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

// Exécution SÉRIELLE. Les tests connectés partagent le compte `admin@taskforce.dev` : lancés en
// parallèle, deux connexions simultanées du même utilisateur se neutralisent et l'une des deux reste
// bloquée sur /auth/login. Le symptôme alternait entre `dashboard` et `membres` d'une exécution à
// l'autre, ce qui donnait l'apparence d'un test instable alors que la cause était déterministe.
// (À revoir si l'on introduit un `storageState` partagé : plus rapide, et sans reconnexion.)
test.describe.configure({ mode: "serial" });

test.describe("Accessibilité (axe-core WCAG 2.1 AA)", () => {
  test("page de connexion", async ({ page }) => {
    await page.goto("/auth/login");
    await page.waitForLoadState("networkidle");
    // La bannière cookies s'affiche depuis un `useEffect` (lecture de localStorage), donc APRÈS
    // `networkidle`. Sans cette attente, axe scannait tantôt avant tantôt après son apparition :
    // le résultat oscillait entre 0 et 3 violations sans qu'aucun code ne change. On attend qu'elle
    // soit là — au passage, elle entre réellement dans le périmètre audité.
    await page.getByRole("button", { name: /got it/i }).waitFor({ state: "visible", timeout: 10_000 });
    const violations = await scan(page, "/auth/login");
    expect(violations.filter((v) => BLOCKING.has(v.impact ?? ""))).toEqual([]);
  });

  test("dashboard", async ({ page }) => {
    await login(page);
    await page.goto(`/${DEMO.workspaceSlug}/dashboard`);
    await page.waitForLoadState("networkidle");
    const violations = await scan(page, "dashboard");
    expect(violations.filter((v) => BLOCKING.has(v.impact ?? ""))).toEqual([]);
  });

  test("membres", async ({ page }) => {
    await login(page);
    await page.goto(`/${DEMO.workspaceSlug}/members`);
    await page.waitForLoadState("networkidle");
    // Attendre le rendu réel des lignes (fetch client) → scan stable.
    // `state: "attached"` et non la visibilité par défaut : à la largeur de test, la colonne e-mail
    // est masquée par les classes responsives. Le sélecteur résolvait donc bien 33 éléments, tous
    // « hidden », et le test expirait alors que la page était parfaitement chargée. axe analyse le
    // DOM — la visibilité de ce span précis n'entre pas en compte.
    await page.getByText(/@seed\.taskforce\.dev/i).first().waitFor({ state: "attached", timeout: 15_000 });
    const violations = await scan(page, "membres");
    expect(violations.filter((v) => BLOCKING.has(v.impact ?? ""))).toEqual([]);
  });
});
