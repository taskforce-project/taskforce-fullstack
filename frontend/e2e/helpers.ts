import { type Page, expect } from "@playwright/test";

/** Identifiants du seed de démo (`dev_seed.sql` / realm Keycloak dev). */
export const DEMO = {
  email: "admin@taskforce.dev",
  password: "Admin@2024",
  workspaceSlug: "taskforce-demo",
};

/**
 * Connexion via le vrai formulaire, puis attente d'être sorti de la page de login.
 * L'app émet ses propres JWT (stockés côté client) → la session persiste sur les navigations.
 */
export async function login(page: Page, email = DEMO.email, password = DEMO.password) {
  await page.goto("/auth/login");
  await page.waitForLoadState("networkidle");
  // En dev, Next compile la route à la volée puis remonte (Fast Refresh) et vide le formulaire.
  // Un reload une fois la route compilée garantit une page stable (sans effet en prod/CI).
  await page.reload();
  await page.waitForLoadState("networkidle");

  // Bannière cookies — à fermer AVANT toute interaction : elle est en `fixed … z-50` et intercepte
  // par intermittence le clic sur « Se connecter », ce qui rendait la suite E2E instable.
  // Le libellé cherché était `/^accept/i` alors que le bouton dit « Got it » : ce garde-fou n'a
  // donc jamais rien fermé depuis qu'il existe.
  const acceptCookies = page.getByRole("button", { name: /got it/i });
  if (await acceptCookies.isVisible().catch(() => false)) {
    await acceptCookies.click();
    await acceptCookies.waitFor({ state: "hidden" }).catch(() => {});
  }

  const emailField = page.locator("#email");
  const passwordField = page.locator("#password");

  // Un remount (Fast Refresh en dev) peut vider les champs juste après le remplissage. La version
  // précédente s'en protégeait par une simple assertion : quand le remount tombait entre `fill` et
  // la vérification, le test ÉCHOUAIT au lieu de se rattraper — d'où une suite E2E intermittente.
  // `toPass` réessaie le bloc entier jusqu'à ce que la saisie tienne.
  await expect(async () => {
    await emailField.fill(email);
    await passwordField.fill(password);
    await expect(emailField).toHaveValue(email);
    await expect(passwordField).toHaveValue(password);
  }).toPass({ timeout: 15_000 });

  await page.getByRole("button", { name: /se connecter/i }).click();
  // Redirection hors de /auth/login une fois authentifié.
  await expect(page).not.toHaveURL(/\/auth\/login/, { timeout: 15_000 });
}
