/**
 * Service de délégation à un agent de livraison (coding agent) - TF-AGENT-DELIVERY.
 * Slice 2 : liste des providers délégables (pour le picker « déléguer à... »).
 */

import { apiClient } from "./client";
import { saveBlob } from "./project-service";
import { DELIVERY_ROUTES } from "../config/api-routes";

/**
 * Agent de la délégation. `available=false` = coupé sur l'instance ; `ready=false` = pas encore utilisable par la
 * personne connectée (ou sur ce projet), `reason` dit quoi faire.
 */
export interface DeliveryProvider {
  key: string;
  displayName: string;
  logoKey: string;
  available: boolean;
  models: string[];
  ready: boolean;
  reason: string | null;
}

/** Agents de la délégation pour la personne connectée, et pour ce projet si `projectId` est donné. */
export async function getDeliveryProviders(slug: string, projectId?: number): Promise<DeliveryProvider[]> {
  const res = await apiClient.get<{ data: DeliveryProvider[] }>(DELIVERY_ROUTES.PROVIDERS(slug, projectId));
  return res.data.data;
}

export type DeliveryRunStatus = "QUEUED" | "RUNNING" | "DONE" | "FAILED";

/** État d'un run de délégation d'une issue. `summary`/`resultUrl` non nuls quand DONE. */
export interface DeliveryRun {
  id: number;
  issueId: number;
  /** Clé lisible de l'issue (ex. "WEB-12"). Avec le titre et le projet, rend le run lisible hors de sa fiche. */
  issueKey: string | null;
  issueTitle: string | null;
  /** Projet de l'issue : requis par le lien profond `/projects/{projectId}?issue={issueId}`. */
  projectId: number | null;
  projectName: string | null;
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

/** Runs de délégation du workspace (les plus récents), pour la vue « workflow » (agents en parallèle). */
export async function listWorkspaceRuns(slug: string): Promise<DeliveryRun[]> {
  const res = await apiClient.get<{ data: DeliveryRun[] }>(DELIVERY_ROUTES.RUNS(slug), { silentError: true });
  return res.data.data ?? [];
}

/** Un événement de la chronologie d'un run du runner local (lot 5). */
export interface DeliveryRunEvent {
  seq: number;
  /**
   * `exit` : une sortie du runner (push, pull request), faite ou non ; `limit` : le plafond d'événements atteint ;
   * `test` : les tests du projet, lancés par le runner après l'agent (S1).
   */
  kind: "start" | "text" | "tool" | "error" | "denied" | "exit" | "limit" | "test";
  tool: string | null;
  text: string;
  at: string | null;
}

export type DeliveryApprovalStatus = "PENDING" | "ALLOWED" | "DENIED" | "EXPIRED";

/** Demande de validation d'une action de l'agent. `canDecide` : c'est à la personne connectée de répondre. */
export interface DeliveryRunApproval {
  id: number;
  tool: string;
  summary: string;
  status: DeliveryApprovalStatus;
  createdAt: string | null;
  expiresAt: string | null;
  decidedAt: string | null;
  decidedBy: string | null;
  canDecide: boolean;
  /** Qui demande : l'agent, ou TaskForce lui-même avant une sortie, les tests du projet ou un départ (décision J4). */
  askedBy?: "agent" | "runner";
}

export interface DeliveryRunActivity {
  events: DeliveryRunEvent[];
  approvals: DeliveryRunApproval[];
}

/** Chronologie d'un run après l'événement `after`, et ses demandes. Lu en boucle pendant le run : jamais de toast. */
export async function getRunActivity(slug: string, runId: number, after: number): Promise<DeliveryRunActivity> {
  const res = await apiClient.get<{ data: DeliveryRunActivity }>(DELIVERY_ROUTES.ACTIVITY(slug, runId, after), { silentError: true });
  return res.data.data;
}

/** Autorise ou refuse une action demandée par l'agent. */
export async function decideApproval(slug: string, runId: number, approvalId: number, allow: boolean): Promise<void> {
  await apiClient.post(DELIVERY_ROUTES.DECIDE(slug, runId, approvalId), { decision: allow ? "ALLOW" : "DENY" });
}

/**
 * Télécharge le dossier de preuve d'un run : le JSON se vérifie sans TaskForce, le Markdown se lit. Une erreur
 * (run sans dossier) remonte à l'appelant.
 */
export async function downloadEvidence(slug: string, runId: number, format: "json" | "md"): Promise<void> {
  const res = await apiClient.get(DELIVERY_ROUTES.EVIDENCE(slug, runId), { params: { format }, responseType: "blob", silentError: true });
  saveBlob(res.data as Blob, `evidence-run-${runId}.${format}`);
}

/** Runner local de l'utilisateur (ADR-013), tel que le serveur le connaît. Ne contient jamais de secret. */
export interface RunnerStatus {
  /** Une identité de runner est déjà provisionnée pour cet utilisateur. */
  exists: boolean;
  /** Client Keycloak du runner (`TASKFORCE_RUNNER_CLIENT_ID`). */
  clientId: string;
  /** Propriétaire signé : le runner ne réclame que les délégations de cet e-mail. */
  ownerEmail: string;
}

/** Identité fraîchement provisionnée. Le secret n'est renvoyé qu'une fois, à copier dans le `.env` du runner. */
export interface RunnerProvision {
  clientId: string;
  clientSecret: string;
  ownerEmail: string;
}

/** État du runner local de l'utilisateur connecté. Appel de fond (ouverture du panneau) : jamais de toast. */
export async function getRunnerStatus(): Promise<RunnerStatus> {
  const res = await apiClient.get<{ data: RunnerStatus }>(DELIVERY_ROUTES.RUNNER, { silentError: true });
  return res.data.data;
}

/** Provisionne le runner local de l'utilisateur, ou régénère son secret (l'ancien cesse de fonctionner). */
export async function provisionRunner(): Promise<RunnerProvision> {
  const res = await apiClient.post<{ data: RunnerProvision }>(DELIVERY_ROUTES.RUNNER);
  return res.data.data;
}
