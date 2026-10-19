import { create } from "zustand";
import {
  getGitHubStatus,
  connectGitHub,
  disconnectGitHub,
  getGitHubRepos,
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
  regenerateWebhookSecret,
  testWebhook,
  getWebhookDeliveries,
  type IntegrationStatus,
  type GitHubRepo,
  type GitHubLink,
  type GitHubLinkPayload,
  type SlackChannel,
  type SlackChannelPayload,
  type Webhook,
  type WebhookPayload,
  type CreatedWebhook,
  type WebhookDelivery,
} from "../api/integration-service";

interface IntegrationState {
  githubStatus: IntegrationStatus | null;
  slackStatus:  IntegrationStatus | null;
  webhooks:      Webhook[];
  /** Derniers envois, par webhook (chargés à la demande). */
  webhookDeliveries: Record<number, WebhookDelivery[]>;
  slackChannels: SlackChannel[];
  /** Liens GitHub indexés par issueId */
  githubLinks:   Record<number, GitHubLink[]>;
  /** Dépôts visibles par la connexion GitHub du workspace (liaison d'un projet). */
  githubRepos:   GitHubRepo[];
  /** Incrémenté à chaque déconnexion : le catalogue, qui garde son propre état, se relit. */
  changes:       number;

  // GitHub
  fetchGitHubStatus:  (slug: string) => Promise<void>;
  /** `returnTo` : chemin de l'app où revenir après le consentement (sinon Settings). */
  connectGitHub:      (slug: string, returnTo?: string) => Promise<void>;
  fetchGitHubRepos:   (slug: string) => Promise<void>;
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
  /** Renvoie le webhook et son secret, montré une seule fois. */
  addWebhook:      (slug: string, payload: WebhookPayload) => Promise<CreatedWebhook>;
  editWebhook:     (slug: string, id: number, payload: WebhookPayload) => Promise<Webhook>;
  removeWebhook:   (slug: string, id: number) => Promise<void>;
  /** Nouveau secret, montré une seule fois. */
  rotateWebhookSecret: (slug: string, id: number) => Promise<string>;
  /** Envoie le test, puis relit le webhook (dernier envoi) et son historique. */
  sendWebhookTest:     (slug: string, id: number) => Promise<WebhookDelivery>;
  fetchWebhookDeliveries: (slug: string, id: number) => Promise<void>;
}

export const useIntegrationStore = create<IntegrationState>((set) => ({
  githubStatus:  null,
  slackStatus:   null,
  webhooks:      [],
  webhookDeliveries: {},
  slackChannels: [],
  githubLinks:   {},
  githubRepos:   [],
  changes:       0,

  // ---------------------------------------------------------------------------
  // GitHub
  // ---------------------------------------------------------------------------

  fetchGitHubStatus: async (slug) => {
    const status = await getGitHubStatus(slug);
    set({ githubStatus: status });
  },

  connectGitHub: async (slug, returnTo) => {
    await connectGitHub(slug, returnTo);
  },

  disconnectGitHub: async (slug) => {
    await disconnectGitHub(slug);
    set((s) => ({
      githubStatus: { id: null, provider: "GITHUB", connected: false, meta: null, connectedAt: null },
      githubLinks: {},
      githubRepos: [],
      changes: s.changes + 1,
    }));
  },

  fetchGitHubRepos: async (slug) => {
    const repos = await getGitHubRepos(slug);
    set({ githubRepos: repos });
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
    // Les canaux partent avec la connexion (ils appartiennent à l'équipe Slack connectée).
    set((s) => ({
      slackStatus: { id: null, provider: "SLACK", connected: false, meta: null, connectedAt: null },
      slackChannels: [],
      changes: s.changes + 1,
    }));
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
    const created = await createWebhook(slug, payload);
    // Le plus récent en tête, comme la liste renvoyée par l'API.
    set((s) => ({ webhooks: [created.webhook, ...s.webhooks] }));
    return created;
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
    set((s) => {
      const deliveries = { ...s.webhookDeliveries };
      delete deliveries[id];
      return { webhooks: s.webhooks.filter((w) => w.id !== id), webhookDeliveries: deliveries };
    });
  },

  rotateWebhookSecret: async (slug, id) => regenerateWebhookSecret(slug, id),

  sendWebhookTest: async (slug, id) => {
    const delivery = await testWebhook(slug, id);
    const [webhooks, deliveries] = await Promise.all([getWebhooks(slug), getWebhookDeliveries(slug, id)]);
    set((s) => ({ webhooks, webhookDeliveries: { ...s.webhookDeliveries, [id]: deliveries } }));
    return delivery;
  },

  fetchWebhookDeliveries: async (slug, id) => {
    const deliveries = await getWebhookDeliveries(slug, id);
    set((s) => ({ webhookDeliveries: { ...s.webhookDeliveries, [id]: deliveries } }));
  },
}));
