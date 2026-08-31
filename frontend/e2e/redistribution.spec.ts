import { test, expect } from "@playwright/test";
import { login, DEMO } from "./helpers";

/**
 * Parcours différenciateur (PROD-1.12, trou CDC #4) : un manager ouvre la redistribution
 * de charge et voit un plan proposé (déplacements from → to) qu'il peut valider ou refuser.
 */
test.describe("Redistribution de charge (E2E)", () => {
  test("un manager voit le bouton et un plan de redistribution", async ({ page }) => {
    await login(page);

    await page.goto(`/${DEMO.workspaceSlug}/members`);

    // Le OWNER voit l'action manager (couvre aussi la non-régression du bug canManage QF-1).
    const rebalance = page.getByRole("button", { name: /rééquilibrer la charge/i });
    await expect(rebalance).toBeVisible({ timeout: 15_000 });
    await rebalance.click();

    // Le dialog s'ouvre et calcule un plan (preview) - le seed a un membre surchargé.
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/redistribution suggérée/i)).toBeVisible();
    await expect(dialog.getByRole("button", { name: /appliquer/i })).toBeVisible();

    // On NE valide pas (on garde la démo intacte) : on annule.
    await dialog.getByRole("button", { name: /annuler/i }).click();
    await expect(dialog).toBeHidden();
  });

  // NB : les coéquipiers du seed (aicha, marcus…) sont créés en SQL sans compte Keycloak → non
  // loginables. Le cas « simple membre ne voit pas l'action » est déjà couvert en unitaire
  // (page Membres, garde `canManage`) et en backend (403 sur l'endpoint redistribute).
});
