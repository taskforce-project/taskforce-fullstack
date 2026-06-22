/**
 * Service RGPD — droits des personnes (CERT-C11.3/C11.4).
 * Routes: /api/gdpr/export · /api/gdpr/account
 */

import { apiClient } from "./client";
import { GDPR_ROUTES } from "../config/api-routes";

/** Export des données personnelles (structure libre, sérialisée en JSON). */
export async function exportMyData(): Promise<Record<string, unknown>> {
  const res = await apiClient.get<{ data: Record<string, unknown> }>(GDPR_ROUTES.EXPORT());
  return res.data.data;
}

/** Droit à l'effacement : anonymise le compte courant et coupe l'accès. */
export async function deleteMyAccount(): Promise<void> {
  await apiClient.delete(GDPR_ROUTES.ACCOUNT());
}
