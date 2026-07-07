import { create } from "zustand";
import {
  getGitHubStatus,
  connectGitHub,
  disconnectGitHub,
  getGitHubLinks,
  addGitHubLink,
  deleteGitHubLink,
  getSlackStatus,
  connectSlack,
  disconnectSlack,
  getSlackChannels,
  addSlackChannel,
  deleteSlackChannel,
  getWebhooks,
  createWebhook,
  updateWebhook,
  deleteWebhook,
  type IntegrationStatus,
  type GitHubLink,
  type GitHubLinkPayload,
  type SlackChannel,
  type SlackChannelPayload,
  type Webhook,
  type WebhookPayload,
} from "../api/integration-service";

interface IntegrationState {
  githubStatus: IntegrationStatus | null;
  slackStatus:  IntegrationStatus | null;
  webhooks:      Webhook[];
  slackChannels: SlackChannel[];
  /** Liens GitHub indexés par issueId */
  githubLinks:   Record<number, GitHubLink[]>;

  // GitHub
  fetchGitHubStatus:  (slug: string) => Promise<void>;
  connectGitHub:      (slug: string) => Promise<void>;
  disconnectGitHub:   (slug: string) => Promise<void>;
  fetchGitHubLinks:   (slug: string, issueId: number) => Promise<void>;
  addGitHubLink:      (slug: string, issueId: number, payload: GitHubLinkPayload) => Promise<GitHubLink>;
  removeGitHubLink:   (slug: string, issueId: number, linkId: number) => Promise<void>;

  // Slack
  fetchSlackStatus:    (slug: string) => Promise<void>;
  connectSlack:        (slug: string) => Promise<void>;
  disconnectSlack:     (slug: string) => Promise<void>;
  fetchSlackChannels:  (slug: string) => Promise<void>;
  addSlackChannel:     (slug: string, payload: SlackChannelPayload) => Promise<SlackChannel>;
  removeSlackChannel:  (slug: string, channelId: number) => Promise<void>;

  // Webhooks
  fetchWebhooks:   (slug: string) => Promise<void>;
  addWebhook:      (slug: string, payload: WebhookPayload) => Promise<Webhook>;
  editWebhook:     (slug: string, id: number, payload: WebhookPayload) => Promise<Webhook>;
  removeWebhook:   (slug: string, id: number) => Promise<void>;
}

export const useIntegrationStore = create<IntegrationState>((set, get) => ({
  githubStatus:  null,
  slackStatus:   null,
  webhooks:      [],
  slackChannels: [],
  githubLinks:   {},

  // ---------------------------------------------------------------------------
  // GitHub
  // ---------------------------------------------------------------------------

  fetchGitHubStatus: async (slug) => {
    const status = await getGitHubStatus(slug);
    set({ githubStatus: status });
  },

  connectGitHub: async (slug) => {
    await connectGitHub(slug);
  },

  disconnectGitHub: async (slug) => {
    await disconnectGitHub(slug);
    set({ githubStatus: { id: null, provider: "GITHUB", connected: false, meta: null, connectedAt: null } });
  },

  fetchGitHubLinks: async (slug, issueId) => {
    const links = await getGitHubLinks(slug, issueId);
    set((s) => ({ githubLinks: { ...s.githubLinks, [issueId]: links } }));
  },

  addGitHubLink: async (slug, issueId, payload) => {
    const link = await addGitHubLink(slug, issueId, payload);
    set((s) => ({
      githubLinks: {
        ...s.githubLinks,
        [issueId]: [...(s.githubLinks[issueId] ?? []), link],
      },
    }));
    return link;
  },

  removeGitHubLink: async (slug, issueId, linkId) => {
    await deleteGitHubLink(slug, linkId);
    set((s) => ({
      githubLinks: {
        ...s.githubLinks,
        [issueId]: (s.githubLinks[issueId] ?? []).filter((l) => l.id !== linkId),
      },
    }));
  },

  // ---------------------------------------------------------------------------
  // Slack
  // ---------------------------------------------------------------------------

  fetchSlackStatus: async (slug) => {
    const status = await getSlackStatus(slug);
    set({ slackStatus: status });
  },

  connectSlack: async (slug) => {
    await connectSlack(slug);
  },

  disconnectSlack: async (slug) => {
    await disconnectSlack(slug);
    set({ slackStatus: { id: null, provider: "SLACK", connected: false, meta: null, connectedAt: null } });
  },

  fetchSlackChannels: async (slug) => {
    const channels = await getSlackChannels(slug);
    set({ slackChannels: channels });
  },

  addSlackChannel: async (slug, payload) => {
    const channel = await addSlackChannel(slug, payload);
    set((s) => ({ slackChannels: [...s.slackChannels, channel] }));
    return channel;
  },

  removeSlackChannel: async (slug, channelId) => {
    await deleteSlackChannel(slug, channelId);
    set((s) => ({ slackChannels: s.slackChannels.filter((c) => c.id !== channelId) }));
  },

  // ---------------------------------------------------------------------------
  // Webhooks
  // ---------------------------------------------------------------------------

  fetchWebhooks: async (slug) => {
    const webhooks = await getWebhooks(slug);
    set({ webhooks });
  },

  addWebhook: async (slug, payload) => {
    const webhook = await createWebhook(slug, payload);
    set((s) => ({ webhooks: [...s.webhooks, webhook] }));
    return webhook;
  },

  editWebhook: async (slug, id, payload) => {
    const updated = await updateWebhook(slug, id, payload);
    set((s) => ({
      webhooks: s.webhooks.map((w) => (w.id === id ? updated : w)),
    }));
    return updated;
  },

  removeWebhook: async (slug, id) => {
    await deleteWebhook(slug, id);
    set((s) => ({ webhooks: s.webhooks.filter((w) => w.id !== id) }));
  },
}));
