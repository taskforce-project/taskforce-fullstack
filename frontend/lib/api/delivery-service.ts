/**
 * Service de délégation à un agent de livraison (coding agent) - TF-AGENT-DELIVERY.
 * Slice 2 : liste des providers délégables (pour le picker « déléguer à... »).
 */

import { apiClient } from "./client";
import { DELIVERY_ROUTES } from "../config/api-routes";

/** Provider d'agent de livraison exposé au picker. `available=false` = affiché « à venir ». */
export interface DeliveryProvider {
  key: string;
  displayName: string;
  logoKey: string;
  available: boolean;
  models: string[];
}

/** Liste les providers délégables du workspace (Claude Code / Copilot / Cursor...). */
export async function getDeliveryProviders(slug: string): Promise<DeliveryProvider[]> {
  const res = await apiClient.get<{ data: DeliveryProvider[] }>(DELIVERY_ROUTES.PROVIDERS(slug));
  return res.data.data;
}
