/**
 * Service pour les intégrations tierces (GitHub, Slack, Webhooks).
 * Routes: /api/workspaces/{slug}/integrations & /api/workspaces/{slug}/webhooks
 */

import { apiClient } from "./client";
import { INTEGRATION_ROUTES } from "../config/api-routes";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IntegrationStatus {
  id: number | null;
  provider: string;
  connected: boolean;
  meta: Record<string, string> | null;
  connectedAt: string | null;
}

export interface GitHubLink {
  id: number;
  linkType: "PR" | "COMMIT";
  repoFullName: string;
  prNumber: number | null;
  prUrl: string | null;
  commitSha: string | null;
  commitUrl: string | null;
  title: string | null;
  status: "OPEN" | "MERGED" | "CLOSED";
  linkedAt: string;
}

export interface GitHubLinkPayload {
  linkType: "PR" | "COMMIT";
  repoFullName: string;
  prNumber?: number;
  prUrl?: string;
  commitSha?: string;
  commitUrl?: string;
  title?: string;
}

export interface SlackChannel {
  id: number;
  channelId: string;
  channelName: string;
  eventTypes: string[];
  active: boolean;
  createdAt: string;
}

export interface SlackChannelPayload {
  channelId: string;
  channelName: string;
  eventTypes: string[];
}

/** Événements auxquels un webhook peut s'abonner (miroir de WebhookEventType côté backend). */
export const WEBHOOK_EVENTS = ["issue.created", "issue.updated", "issue.deleted", "comment.created", "cycle.completed"] as const;

export interface Webhook {
  id: number;
  url: string;
  /** Vide = tous les événements. */
  eventTypes: string[];
  /** Faux = en pause : rien n'est envoyé. */
  active: boolean;
  lastFiredAt: string | null;
  /** Code HTTP du dernier envoi ; null si le serveur n'a pas répondu (ou rien d'envoyé, `lastFiredAt` null). */
  lastStatus: number | null;
  createdAt: string;
}

export interface WebhookPayload {
  url: string;
  eventTypes: string[];
  active?: boolean;
}

/** Webhook créé et son secret de signature, montré cette seule fois. */
export interface CreatedWebhook {
  webhook: Webhook;
  secret: string;
}

/** Un envoi : en attente (nouvelle tentative le `nextAttemptAt`), livré ou abandonné. */
export interface WebhookDelivery {
  deliveryId: string;
  eventType: string;
  status: "PENDING" | "DELIVERED" | "FAILED";
  attempts: number;
  lastStatus: number | null;
  lastError: string | null;
  createdAt: string;
  deliveredAt: string | null;
  nextAttemptAt: string | null;
}

// ---------------------------------------------------------------------------
// GitHub
// ---------------------------------------------------------------------------

export async function getGitHubStatus(slug: string): Promise<IntegrationStatus> {
  const res = await apiClient.get<{ data: IntegrationStatus }>(INTEGRATION_ROUTES.GITHUB_STATUS(slug));
  return res.data.data;
}

/**
 * Démarre le flux OAuth GitHub : appel XHR authentifié qui renvoie l'URL d'autorisation,
 * puis navigation du navigateur vers celle-ci. (Une navigation directe vers l'endpoint
 * protégé n'enverrait pas le Bearer du localStorage → 401.)
 *
 * `returnTo` : chemin applicatif où revenir après le consentement (ex. le dialogue de création de projet,
 * qui se rouvre) ; validé côté serveur, sinon le retour se fait sur Settings → Integrations.
 */
export async function connectGitHub(slug: string, returnTo?: string): Promise<void> {
  const url = INTEGRATION_ROUTES.GITHUB_CONNECT(slug);
  const res = returnTo
    ? await apiClient.get<{ data: { authorizeUrl: string } }>(url, { params: { returnTo } })
    : await apiClient.get<{ data: { authorizeUrl: string } }>(url);
  window.location.href = res.data.data.authorizeUrl;
}

export async function disconnectGitHub(slug: string): Promise<void> {
  await apiClient.delete(INTEGRATION_ROUTES.GITHUB_DISCONNECT(slug));
}

export interface GitHubRepo {
  fullName: string;
  name: string;
  isPrivate: boolean;
  htmlUrl: string;
  openIssues: number;
}

export interface GitHubRepoIssue {
  number: number;
  title: string;
  state: string;
  htmlUrl: string;
  pullRequest: boolean;
  author: string | null;
  updatedAt: string;
}

/** Dépôts accessibles via le token connecté (PROD-5.1 sync read). */
export async function getGitHubRepos(slug: string): Promise<GitHubRepo[]> {
  const res = await apiClient.get<{ data: GitHubRepo[] }>(INTEGRATION_ROUTES.GITHUB_REPOS(slug));
  return res.data.data;
}

/** Issues + PR d'un dépôt GitHub. */
export async function getGitHubRepoIssues(slug: string, repo: string): Promise<GitHubRepoIssue[]> {
  const res = await apiClient.get<{ data: GitHubRepoIssue[] }>(INTEGRATION_ROUTES.GITHUB_ISSUES(slug, repo));
  return res.data.data;
}

/** Résultat d'une ingestion vers le Brain OS (GitHub/Slack) : items créés / mis à jour / total lus. */
export interface BrainSyncResult {
  created: number;
  updated: number;
  total: number;
}

/** Ingère les issues + PR d'un dépôt GitHub dans le Brain OS (dédupe, embedde). */
export async function syncGitHub(slug: string, repo: string): Promise<BrainSyncResult> {
  const res = await apiClient.post<{ data: BrainSyncResult }>(INTEGRATION_ROUTES.GITHUB_SYNC(slug, repo));
  return res.data.data;
}

export async function getGitHubLinks(slug: string, issueId: number): Promise<GitHubLink[]> {
  const res = await apiClient.get<{ data: GitHubLink[] }>(INTEGRATION_ROUTES.GITHUB_LINKS(slug, issueId));
  return res.data.data;
}

export async function addGitHubLink(
  slug: string,
  issueId: number,
  payload: GitHubLinkPayload
): Promise<GitHubLink> {
  const res = await apiClient.post<{ data: GitHubLink }>(
    INTEGRATION_ROUTES.GITHUB_LINKS(slug, issueId),
    payload
  );
  return res.data.data;
}

export async function deleteGitHubLink(slug: string, linkId: number): Promise<void> {
  await apiClient.delete(INTEGRATION_ROUTES.GITHUB_LINK(slug, linkId));
}

// ---------------------------------------------------------------------------
// Slack
// ---------------------------------------------------------------------------

export async function getSlackStatus(slug: string): Promise<IntegrationStatus> {
  const res = await apiClient.get<{ data: IntegrationStatus }>(INTEGRATION_ROUTES.SLACK_STATUS(slug));
  return res.data.data;
}

/** Démarre le flux OAuth Slack (cf. {@link connectGitHub}). */
export async function connectSlack(slug: string): Promise<void> {
  const res = await apiClient.get<{ data: { authorizeUrl: string } }>(INTEGRATION_ROUTES.SLACK_CONNECT(slug));
  window.location.href = res.data.data.authorizeUrl;
}

export async function disconnectSlack(slug: string): Promise<void> {
  await apiClient.delete(INTEGRATION_ROUTES.SLACK_DISCONNECT(slug));
}

export async function getSlackChannels(slug: string): Promise<SlackChannel[]> {
  const res = await apiClient.get<{ data: SlackChannel[] }>(INTEGRATION_ROUTES.SLACK_CHANNELS(slug));
  return res.data.data;
}

export async function addSlackChannel(slug: string, payload: SlackChannelPayload): Promise<SlackChannel> {
  const res = await apiClient.post<{ data: SlackChannel }>(
    INTEGRATION_ROUTES.SLACK_CHANNELS(slug),
    payload
  );
  return res.data.data;
}

export async function deleteSlackChannel(slug: string, channelId: number): Promise<void> {
  await apiClient.delete(INTEGRATION_ROUTES.SLACK_CHANNEL(slug, channelId));
}

/** Ingère l'historique d'un canal Slack dans le Brain OS (dédupe, embedde). */
export async function syncSlack(slug: string, channel: string): Promise<BrainSyncResult> {
  const res = await apiClient.post<{ data: BrainSyncResult }>(INTEGRATION_ROUTES.SLACK_SYNC(slug, channel));
  return res.data.data;
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

export async function getWebhooks(slug: string): Promise<Webhook[]> {
  const res = await apiClient.get<{ data: Webhook[] }>(INTEGRATION_ROUTES.WEBHOOKS(slug));
  return res.data.data;
}

/** Crée un webhook ; la réponse porte son secret de signature, montré cette seule fois. */
export async function createWebhook(slug: string, payload: WebhookPayload): Promise<CreatedWebhook> {
  const res = await apiClient.post<{ data: CreatedWebhook }>(INTEGRATION_ROUTES.WEBHOOKS(slug), payload);
  return res.data.data;
}

export async function updateWebhook(slug: string, id: number, payload: WebhookPayload): Promise<Webhook> {
  const res = await apiClient.put<{ data: Webhook }>(INTEGRATION_ROUTES.WEBHOOK(slug, id), payload);
  return res.data.data;
}

export async function deleteWebhook(slug: string, id: number): Promise<void> {
  await apiClient.delete(INTEGRATION_ROUTES.WEBHOOK(slug, id));
}

/** Nouveau secret de signature (montré une fois) ; l'ancien ne signe plus rien. */
export async function regenerateWebhookSecret(slug: string, id: number): Promise<string> {
  const res = await apiClient.post<{ data: { secret: string } }>(INTEGRATION_ROUTES.WEBHOOK_SECRET(slug, id));
  return res.data.data.secret;
}

/** Envoie tout de suite l'événement de test « ping » et renvoie le résultat de l'envoi. */
export async function testWebhook(slug: string, id: number): Promise<WebhookDelivery> {
  const res = await apiClient.post<{ data: WebhookDelivery }>(INTEGRATION_ROUTES.WEBHOOK_TEST(slug, id));
  return res.data.data;
}

/** Les 20 derniers envois d'un webhook, du plus récent au plus ancien. */
export async function getWebhookDeliveries(slug: string, id: number): Promise<WebhookDelivery[]> {
  const res = await apiClient.get<{ data: WebhookDelivery[] }>(INTEGRATION_ROUTES.WEBHOOK_DELIVERIES(slug, id));
  return res.data.data;
}

// ---------------------------------------------------------------------------
// Catalogue : 3 intégrations natives, préréglages MCP, serveurs MCP ajoutés par le workspace (ADR-020)
// ---------------------------------------------------------------------------

export interface ConnectorField {
  key: string;
  label: string;
  secret: boolean;
  required: boolean;
}

export interface ConnectorView {
  key: string;
  name: string;
  category: string;
  /** OAUTH2 et API_KEY : intégrations natives ; MCP : préréglage ou serveur ajouté par le workspace. */
  authType: "OAUTH2" | "API_KEY" | "MCP";
  connected: boolean;
  fields: ConnectorField[];
  capabilities: string[];
  description: string | null;
  docsUrl: string | null;
  /** Aide (tooltip) : où récupérer la clé quand ce n'est pas du 1-clic OAuth. */
  setupHint: string | null;
  /** Site officiel du service (homepage) - affiché dans la fiche détaillée. */
  websiteUrl: string | null;
  /** URL du serveur MCP officiel d'un préréglage, préremplie (modifiable) dans le dialogue de connexion. */
  mcpSuggestedUrl: string | null;
}

export interface CategoryGroup {
  category: string;
  label: string;
  tools: ConnectorView[];
}

/** Catégorie des serveurs MCP ajoutés à la main (clé `custom-…`). */
export const CUSTOM_MCP_CATEGORY = "CUSTOM_MCP";

export interface IntegrationCatalog {
  total: number;
  connected: number;
  categories: CategoryGroup[];
}

export async function getIntegrationCatalog(slug: string): Promise<IntegrationCatalog> {
  const res = await apiClient.get<{ data: IntegrationCatalog }>(INTEGRATION_ROUTES.CATALOG(slug));
  return res.data.data;
}

// ---------------------------------------------------------------------------
// MCP (serveur MCP externe → outils live dans Cortex, écritures validées)
// ---------------------------------------------------------------------------

/** Statut d'un serveur MCP connecté : joignabilité + outils exposés (après allow-list). */
export interface McpServerStatus {
  connectorKey: string;
  /** Nom d'un serveur ajouté à la main ; null pour un préréglage. */
  name: string | null;
  url: string;
  reachable: boolean;
  tools: string[];
  error: string | null;
}

/** Clé à envoyer pour un nouveau serveur ajouté à la main : le backend en dérive `custom-<slug>` du nom. */
export const NEW_CUSTOM_MCP_KEY = "custom";

export interface McpServerPayload {
  /** Clé d'un préréglage, `custom` (nouveau serveur) ou `custom-…` (serveur existant). */
  connectorKey: string;
  /** Obligatoire pour un serveur ajouté à la main. */
  name?: string;
  mcpUrl: string;
  /** Jeton envoyé en `Authorization: Bearer`, ou tel quel dans `headerName`. */
  mcpToken?: string;
  headerName?: string;
  mcpAllow?: string;
}

/** Statut des serveurs MCP connectés sur le workspace. */
export async function getMcpServers(slug: string): Promise<McpServerStatus[]> {
  const res = await apiClient.get<{ data: McpServerStatus[] }>(INTEGRATION_ROUTES.MCP_SERVERS(slug));
  return res.data.data;
}

/** Connecte (ou reconfigure) un serveur MCP externe ; renvoie le statut frais (joignable + outils). */
export async function connectMcpServer(slug: string, payload: McpServerPayload): Promise<McpServerStatus[]> {
  const res = await apiClient.post<{ data: McpServerStatus[] }>(INTEGRATION_ROUTES.MCP_SERVERS(slug), payload);
  return res.data.data;
}

/** Déconnecte un serveur MCP externe ; renvoie le statut frais. */
export async function disconnectMcpServer(slug: string, connectorKey: string): Promise<McpServerStatus[]> {
  const res = await apiClient.delete<{ data: McpServerStatus[] }>(INTEGRATION_ROUTES.MCP_SERVER(slug, connectorKey));
  return res.data.data;
}

// --- Console d'actions (TF-MCP-06) : lister les outils d'un serveur + en exécuter un directement ---

/** Sous-ensemble de JSON Schema qu'on sait rendre en formulaire (objet à propriétés surtout plates). */
export interface JsonSchemaProperty {
  type?: string | string[];
  description?: string;
  enum?: (string | number)[];
  default?: unknown;
  title?: string;
}
export interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
}

/** Outil MCP riche : nom, description, schéma d'arguments et lecture seule (écriture = confirmation). */
export interface McpToolInfo {
  name: string;
  description: string;
  inputSchema: JsonSchema | null;
  readOnly: boolean;
}

/** Outils (schéma d'arguments inclus) d'un serveur MCP connecté — alimente la console d'actions. */
export async function getMcpServerTools(slug: string, connectorKey: string): Promise<McpToolInfo[]> {
  const res = await apiClient.get<{ data: McpToolInfo[] }>(INTEGRATION_ROUTES.MCP_SERVER_TOOLS(slug, connectorKey));
  return res.data.data;
}

/** Exécute un outil MCP externe directement (hors Cortex). `toolRef` = `<connectorKey>__<tool>`. */
export async function executeMcpAction(
  slug: string,
  toolRef: string,
  args: Record<string, unknown>,
): Promise<string> {
  const res = await apiClient.post<{ data: { toolRef: string; output: string } }>(
    INTEGRATION_ROUTES.MCP_ACTION_EXECUTE(slug),
    { toolRef, arguments: args },
  );
  return res.data.data.output;
}

/**
 * Démarre l'OAuth 1-clic d'un serveur MCP : renvoie l'URL d'autorisation (on y redirige le navigateur).
 * `returnTo` (chemin applicatif relatif optionnel) permet un retour fluide ailleurs que sur Settings
 * (ex. rouvrir le wizard de création de projet). `name` : obligatoire pour un serveur ajouté à la main.
 */
export async function startMcpOAuth(
  slug: string,
  connectorKey: string,
  mcpUrl: string,
  returnTo?: string,
  name?: string,
): Promise<string> {
  const res = await apiClient.post<{ data: { authorizeUrl: string } }>(
    INTEGRATION_ROUTES.MCP_OAUTH_START(slug, connectorKey),
    { mcpUrl, returnTo, name },
  );
  return res.data.data.authorizeUrl;
}

/** Résultat d'un import de projet externe : le projet natif créé + le nombre d'issues importées. */
export interface McpImportResult {
  projectId: number;
  projectIdentifier: string;
  projectName: string;
  imported: number;
  found: number;
}

/** Importe un projet externe (issues d'un connecteur MCP connecté) dans un nouveau projet natif TaskForce. */
export async function importMcpProject(
  slug: string,
  connectorKey: string,
  targetName: string,
): Promise<McpImportResult> {
  const res = await apiClient.post<{ data: McpImportResult }>(
    INTEGRATION_ROUTES.MCP_IMPORT(slug),
    { connectorKey, targetName },
  );
  return res.data.data;
}

// ---------------------------------------------------------------------------
// Plane (connecteur clé API → ingestion Brain OS)
// ---------------------------------------------------------------------------

export interface PlaneStatus {
  connected: boolean;
  planeWorkspace: string | null;
  ingestedNodes: number;
}

export interface PlaneProject {
  id: string;
  name: string;
}

export interface PlaneSyncResult {
  created: number;
  updated: number;
  total: number;
}

export async function getPlaneStatus(slug: string): Promise<PlaneStatus> {
  const res = await apiClient.get<{ data: PlaneStatus }>(INTEGRATION_ROUTES.PLANE_STATUS(slug));
  return res.data.data;
}

export async function connectPlane(
  slug: string,
  payload: { apiKey: string; planeWorkspace: string }
): Promise<PlaneStatus> {
  const res = await apiClient.post<{ data: PlaneStatus }>(INTEGRATION_ROUTES.PLANE_CONNECT(slug), payload);
  return res.data.data;
}

export async function listPlaneProjects(slug: string): Promise<PlaneProject[]> {
  const res = await apiClient.get<{ data: PlaneProject[] }>(INTEGRATION_ROUTES.PLANE_PROJECTS(slug));
  return res.data.data;
}

export async function syncPlane(slug: string, projectId: string): Promise<PlaneSyncResult> {
  const res = await apiClient.post<{ data: PlaneSyncResult }>(INTEGRATION_ROUTES.PLANE_SYNC(slug, projectId));
  return res.data.data;
}

export async function disconnectPlane(slug: string): Promise<void> {
  await apiClient.delete(INTEGRATION_ROUTES.PLANE_DISCONNECT(slug));
}
