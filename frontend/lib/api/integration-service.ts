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

export interface Webhook {
  id: number;
  url: string;
  eventTypes: string[];
  active: boolean;
  lastFiredAt: string | null;
  lastStatus: number | null;
  createdAt: string;
}

export interface WebhookPayload {
  url: string;
  secret?: string;
  eventTypes: string[];
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
 */
export async function connectGitHub(slug: string): Promise<void> {
  const res = await apiClient.get<{ data: { authorizeUrl: string } }>(INTEGRATION_ROUTES.GITHUB_CONNECT(slug));
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

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

export async function getWebhooks(slug: string): Promise<Webhook[]> {
  const res = await apiClient.get<{ data: Webhook[] }>(INTEGRATION_ROUTES.WEBHOOKS(slug));
  return res.data.data;
}

export async function createWebhook(slug: string, payload: WebhookPayload): Promise<Webhook> {
  const res = await apiClient.post<{ data: Webhook }>(INTEGRATION_ROUTES.WEBHOOKS(slug), payload);
  return res.data.data;
}

export async function updateWebhook(slug: string, id: number, payload: WebhookPayload): Promise<Webhook> {
  const res = await apiClient.put<{ data: Webhook }>(INTEGRATION_ROUTES.WEBHOOK(slug, id), payload);
  return res.data.data;
}

export async function deleteWebhook(slug: string, id: number): Promise<void> {
  await apiClient.delete(INTEGRATION_ROUTES.WEBHOOK(slug, id));
}

// ---------------------------------------------------------------------------
// Catalogue générique (le « pool » d'outils)
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
  authType: "OAUTH2" | "API_KEY" | "TOKEN" | "CONFIG" | "NONE";
  status: "AVAILABLE" | "PLANNED";
  connected: boolean;
  fields: ConnectorField[];
  capabilities: string[];
  description: string | null;
  docsUrl: string | null;
  /** Aide (tooltip) : où récupérer la clé quand ce n'est pas du 1-clic OAuth. */
  setupHint: string | null;
  /** Site officiel du service (homepage) - affiché dans la fiche détaillée. */
  websiteUrl: string | null;
  /** URL d'un serveur MCP distant hébergé (officiel), pré-remplie (éditable) dans le dialog Connect
   *  → « MCP-ready » 1-clic. Null si l'outil n'expose pas d'endpoint MCP hébergé. */
  mcpSuggestedUrl: string | null;
}

export interface CategoryGroup {
  category: string;
  label: string;
  tools: ConnectorView[];
}

export interface IntegrationCatalog {
  total: number;
  available: number;
  connected: number;
  categories: CategoryGroup[];
}

export async function getIntegrationCatalog(slug: string): Promise<IntegrationCatalog> {
  const res = await apiClient.get<{ data: IntegrationCatalog }>(INTEGRATION_ROUTES.CATALOG(slug));
  return res.data.data;
}

/** Connecte (ou reconfigure) un connecteur générique du catalogue - identifiants stockés chiffrés. */
export async function connectConnector(slug: string, key: string, config: Record<string, string>): Promise<void> {
  await apiClient.post(INTEGRATION_ROUTES.CONNECTOR(slug, key), { config });
}

/** Déconnecte un connecteur générique. */
export async function disconnectConnector(slug: string, key: string): Promise<void> {
  await apiClient.delete(INTEGRATION_ROUTES.CONNECTOR(slug, key));
}

// ---------------------------------------------------------------------------
// MCP (serveur MCP externe → outils live dans Cortex, écritures validées)
// ---------------------------------------------------------------------------

/** Statut d'un serveur MCP connecté : joignabilité + outils exposés (après allow-list). */
export interface McpServerStatus {
  connectorKey: string;
  url: string;
  reachable: boolean;
  tools: string[];
  error: string | null;
}

export interface McpServerPayload {
  connectorKey: string;
  mcpUrl: string;
  mcpToken?: string;
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

/** Démarre l'OAuth 1-clic d'un serveur MCP : renvoie l'URL d'autorisation (on y redirige le navigateur). */
export async function startMcpOAuth(slug: string, connectorKey: string, mcpUrl: string): Promise<string> {
  const res = await apiClient.post<{ data: { authorizeUrl: string } }>(
    INTEGRATION_ROUTES.MCP_OAUTH_START(slug, connectorKey),
    { mcpUrl },
  );
  return res.data.data.authorizeUrl;
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
