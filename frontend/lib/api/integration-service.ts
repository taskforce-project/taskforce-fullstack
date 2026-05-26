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

/** Redirige le navigateur vers GitHub pour le flux OAuth */
export function connectGitHub(slug: string): void {
  window.location.href = INTEGRATION_ROUTES.GITHUB_CONNECT(slug);
}

export async function disconnectGitHub(slug: string): Promise<void> {
  await apiClient.delete(INTEGRATION_ROUTES.GITHUB_DISCONNECT(slug));
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

/** Redirige le navigateur vers Slack pour le flux OAuth */
export function connectSlack(slug: string): void {
  window.location.href = INTEGRATION_ROUTES.SLACK_CONNECT(slug);
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
