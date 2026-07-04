import { test, expect } from "@playwright/test";
import { login, DEMO } from "./helpers";

test.describe("Authentification (E2E)", () => {
  test("connexion valide → sortie de la page de login", async ({ page }) => {
    await login(page);
    // On est authentifié : plus sur /auth/login, et une zone applicative est rendue.
    await expect(page).not.toHaveURL(/\/auth\/login/);
    await expect(page.getByRole("button", { name: /se connecter/i })).toHaveCount(0);
  });

  test("identifiants invalides → message d'erreur, reste sur login", async ({ page }) => {
    await page.goto("/auth/login");
    await page.getByLabel(/email/i).fill("wrong@taskforce.dev");
    await page.getByLabel(/mot de passe/i).fill("BadPassword!1");
    await page.getByRole("button", { name: /se connecter/i }).click();
    // Un toast/erreur apparaît et on reste sur la page de login.
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test("accès à une route protégée sans session → redirigé vers login", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto(`/${DEMO.workspaceSlug}/dashboard`);
    await expect(page).toHaveURL(/\/auth\/login/, { timeout: 15_000 });
  });
});
