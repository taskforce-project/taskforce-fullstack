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
  await page.waitForLoadState("networkidle"); // laisse le dev-server finir de compiler la route

  // Bannière cookies (non bloquante) — on l'accepte si présente pour une page propre.
  const acceptCookies = page.getByRole("button", { name: /^accept/i });
  if (await acceptCookies.isVisible().catch(() => false)) {
    await acceptCookies.click();
  }

  const emailField = page.locator("#email");
  const passwordField = page.locator("#password");
  await emailField.fill(email);
  await passwordField.fill(password);
  // Garde-fou : un remount (Fast Refresh en dev) peut vider le champ → on s'assure qu'il tient.
  await expect(emailField).toHaveValue(email);

  await page.getByRole("button", { name: /se connecter/i }).click();
  // Redirection hors de /auth/login une fois authentifié.
  await expect(page).not.toHaveURL(/\/auth\/login/, { timeout: 15_000 });
}
