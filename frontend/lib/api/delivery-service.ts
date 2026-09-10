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

export type DeliveryRunStatus = "QUEUED" | "RUNNING" | "DONE" | "FAILED";

/** État d'un run de délégation d'une issue. `summary`/`resultUrl` non nuls quand DONE. */
export interface DeliveryRun {
  id: number;
  issueId: number;
  providerKey: string;
  model: string | null;
  status: DeliveryRunStatus;
  summary: string | null;
  resultUrl: string | null;
  error: string | null;
  startedById: number | null;
  createdAt: string | null;
  updatedAt: string | null;
}

/** Délègue une issue à un agent (crée un run, exécuté en arrière-plan côté serveur). */
export async function delegateIssue(
  slug: string,
  issueId: number,
  providerKey: string,
  model?: string,
): Promise<DeliveryRun> {
  const res = await apiClient.post<{ data: DeliveryRun }>(
    DELIVERY_ROUTES.DELEGATE(slug, issueId),
    { providerKey, model },
  );
  return res.data.data;
}

/** Dernier run de délégation d'une issue, ou null si aucune délégation. */
export async function getIssueRun(slug: string, issueId: number): Promise<DeliveryRun | null> {
  const res = await apiClient.get<{ data: DeliveryRun | null }>(DELIVERY_ROUTES.RUN(slug, issueId));
  return res.data.data;
}

/** État de la connexion de la clé API Anthropic du workspace (délégation Claude via l'API, B1). */
export interface AnthropicStatus {
  /** Une clé est connectée (délégation à « Claude (API) » possible). */
  connected: boolean;
  /** Indice non sensible pour reconnaître la clé (4 derniers caractères, ex. "...AB12"), ou null. */
  keyHint: string | null;
}

/** Lit l'état de la clé Anthropic du workspace (la clé n'est jamais renvoyée en clair). */
export async function getAnthropicStatus(slug: string): Promise<AnthropicStatus> {
  const res = await apiClient.get<{ data: AnthropicStatus }>(DELIVERY_ROUTES.ANTHROPIC(slug));
  return res.data.data;
}

/** Connecte (ou remplace) la clé API Anthropic du workspace (OWNER/ADMIN). */
export async function connectAnthropicKey(slug: string, apiKey: string): Promise<AnthropicStatus> {
  const res = await apiClient.post<{ data: AnthropicStatus }>(DELIVERY_ROUTES.ANTHROPIC(slug), { apiKey });
  return res.data.data;
}

/** Déconnecte la clé API Anthropic du workspace (OWNER/ADMIN). */
export async function disconnectAnthropicKey(slug: string): Promise<void> {
  await apiClient.delete(DELIVERY_ROUTES.ANTHROPIC(slug));
}
