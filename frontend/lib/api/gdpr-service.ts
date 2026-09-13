/**
 * Service RGPD - droits des personnes (CERT-C11.3/C11.4).
 * Routes: /api/gdpr/export · /api/gdpr/account
 */

import { apiClient } from "./client";
import { GDPR_ROUTES } from "../config/api-routes";

/** Export des données personnelles (structure libre, sérialisée en JSON). */
export async function exportMyData(): Promise<Record<string, unknown>> {
  const res = await apiClient.get<{ data: Record<string, unknown> }>(GDPR_ROUTES.EXPORT());
  return res.data.data;
}

/**
 * Droit à l'effacement (RGPD Art. 17) : PLANIFIE la suppression du compte après un délai de grâce.
 * Le compte reste actif et RÉCUPÉRABLE jusqu'à la date renvoyée (`scheduledPurgeAt`, ISO) ; au-delà,
 * un job purge réellement (les workspaces partagés sont transférés au membre le plus ancien, les
 * workspaces solo supprimés). Renvoie la date de purge prévue.
 */
export async function deleteMyAccount(): Promise<string> {
  const res = await apiClient.delete<{ data: { scheduledPurgeAt: string } }>(GDPR_ROUTES.ACCOUNT());
  return res.data.data.scheduledPurgeAt;
}

/**
 * Droit à l'effacement (RGPD Art. 17) - variante IMMÉDIATE : purge le compte SUR-LE-CHAMP, sans délai
 * de grâce. Irréversible (double confirmation côté UI : choix explicite + ressaisie de l'email). L'Art.
 * 17 permet l'effacement « sans délai indu » ; le délai de grâce n'est qu'un filet anti-erreur.
 */
export async function deleteMyAccountImmediately(): Promise<void> {
  await apiClient.delete(`${GDPR_ROUTES.ACCOUNT()}?immediate=true`);
}

/** Annule une suppression planifiée tant que le délai de grâce court (restaure le compte courant). */
export async function restoreMyAccount(): Promise<void> {
  await apiClient.post(GDPR_ROUTES.ACCOUNT_RESTORE());
}
