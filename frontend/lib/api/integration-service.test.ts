import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getGitHubStatus,
  connectGitHub,
  disconnectGitHub,
  getGitHubRepos,
  getGitHubRepoIssues,
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
} from './integration-service';
import { apiClient } from './client';
import { INTEGRATION_ROUTES } from '../config/api-routes';

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  getErrorMessage: vi.fn((e: any) => e?.message || 'error'),
}));

const SLUG = 'acme';
const envelope = <T>(payload: T) => ({ data: { success: true, message: 'ok', data: payload } });

describe('integration-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- GitHub ---
  describe('getGitHubStatus', () => {
    it('GET le statut GitHub', async () => {
      const status = { id: null, provider: 'github', connected: false, meta: null, connectedAt: null };
      vi.mocked(apiClient.get).mockResolvedValue(envelope(status));

      const result = await getGitHubStatus(SLUG);

      expect(apiClient.get).toHaveBeenCalledWith(INTEGRATION_ROUTES.GITHUB_STATUS(SLUG));
      expect(result).toEqual(status);
    });

    it('propage l’erreur', async () => {
      vi.mocked(apiClient.get).mockRejectedValue(new Error('boom'));
      await expect(getGitHubStatus(SLUG)).rejects.toThrow('boom');
    });
  });

  describe('connectGitHub', () => {
    it('redirige window.location.href vers la route de connexion', () => {
      window.location.href = '';

      connectGitHub(SLUG);

      expect(window.location.href).toBe(INTEGRATION_ROUTES.GITHUB_CONNECT(SLUG));
    });
  });

  describe('disconnectGitHub', () => {
    it('DELETE la connexion GitHub', async () => {
      vi.mocked(apiClient.delete).mockResolvedValue(envelope(null));

      await disconnectGitHub(SLUG);

      expect(apiClient.delete).toHaveBeenCalledWith(INTEGRATION_ROUTES.GITHUB_DISCONNECT(SLUG));
    });
  });

  describe('getGitHubRepos', () => {
    it('GET les dépôts', async () => {
      const repos = [{ fullName: 'a/b', name: 'b', isPrivate: false, htmlUrl: 'u', openIssues: 1 }];
      vi.mocked(apiClient.get).mockResolvedValue(envelope(repos));

      const result = await getGitHubRepos(SLUG);

      expect(apiClient.get).toHaveBeenCalledWith(INTEGRATION_ROUTES.GITHUB_REPOS(SLUG));
      expect(result).toEqual(repos);
    });
  });

  describe('getGitHubRepoIssues', () => {
    it('GET les issues d’un repo (route avec query repo)', async () => {
      const issues = [{ number: 1, title: 't', state: 'open' }] as any;
      vi.mocked(apiClient.get).mockResolvedValue(envelope(issues));

      const result = await getGitHubRepoIssues(SLUG, 'octo/repo');

      expect(apiClient.get).toHaveBeenCalledWith(INTEGRATION_ROUTES.GITHUB_ISSUES(SLUG, 'octo/repo'));
      expect(result).toEqual(issues);
    });
  });

  describe('getGitHubLinks', () => {
    it('GET les liens d’une issue', async () => {
      const links = [{ id: 1, linkType: 'PR' }] as any;
      vi.mocked(apiClient.get).mockResolvedValue(envelope(links));

      const result = await getGitHubLinks(SLUG, 55);

      expect(apiClient.get).toHaveBeenCalledWith(INTEGRATION_ROUTES.GITHUB_LINKS(SLUG, 55));
      expect(result).toEqual(links);
    });
  });

  describe('addGitHubLink', () => {
    it('POST le payload de lien', async () => {
      const payload = { linkType: 'PR' as const, repoFullName: 'a/b', prNumber: 3 };
      const link = { id: 1, ...payload } as any;
      vi.mocked(apiClient.post).mockResolvedValue(envelope(link));

      const result = await addGitHubLink(SLUG, 55, payload);

      expect(apiClient.post).toHaveBeenCalledWith(INTEGRATION_ROUTES.GITHUB_LINKS(SLUG, 55), payload);
      expect(result).toEqual(link);
    });
  });

  describe('deleteGitHubLink', () => {
    it('DELETE un lien', async () => {
      vi.mocked(apiClient.delete).mockResolvedValue(envelope(null));

      await deleteGitHubLink(SLUG, 9);

      expect(apiClient.delete).toHaveBeenCalledWith(INTEGRATION_ROUTES.GITHUB_LINK(SLUG, 9));
    });
  });

  // --- Slack ---
  describe('getSlackStatus', () => {
    it('GET le statut Slack', async () => {
      const status = { id: null, provider: 'slack', connected: true, meta: null, connectedAt: null };
      vi.mocked(apiClient.get).mockResolvedValue(envelope(status));

      const result = await getSlackStatus(SLUG);

      expect(apiClient.get).toHaveBeenCalledWith(INTEGRATION_ROUTES.SLACK_STATUS(SLUG));
      expect(result).toEqual(status);
    });
  });

  describe('connectSlack', () => {
    it('redirige window.location.href vers la route de connexion', () => {
      window.location.href = '';

      connectSlack(SLUG);

      expect(window.location.href).toBe(INTEGRATION_ROUTES.SLACK_CONNECT(SLUG));
    });
  });

  describe('disconnectSlack', () => {
    it('DELETE la connexion Slack', async () => {
      vi.mocked(apiClient.delete).mockResolvedValue(envelope(null));

      await disconnectSlack(SLUG);

      expect(apiClient.delete).toHaveBeenCalledWith(INTEGRATION_ROUTES.SLACK_DISCONNECT(SLUG));
    });
  });

  describe('getSlackChannels', () => {
    it('GET les canaux', async () => {
      const channels = [{ id: 1, channelId: 'C1', channelName: 'general' }] as any;
      vi.mocked(apiClient.get).mockResolvedValue(envelope(channels));

      const result = await getSlackChannels(SLUG);

      expect(apiClient.get).toHaveBeenCalledWith(INTEGRATION_ROUTES.SLACK_CHANNELS(SLUG));
      expect(result).toEqual(channels);
    });
  });

  describe('addSlackChannel', () => {
    it('POST le payload de canal', async () => {
      const payload = { channelId: 'C1', channelName: 'general', eventTypes: ['issue.created'] };
      const channel = { id: 1, ...payload, active: true } as any;
      vi.mocked(apiClient.post).mockResolvedValue(envelope(channel));

      const result = await addSlackChannel(SLUG, payload);

      expect(apiClient.post).toHaveBeenCalledWith(INTEGRATION_ROUTES.SLACK_CHANNELS(SLUG), payload);
      expect(result).toEqual(channel);
    });
  });

  describe('deleteSlackChannel', () => {
    it('DELETE un canal', async () => {
      vi.mocked(apiClient.delete).mockResolvedValue(envelope(null));

      await deleteSlackChannel(SLUG, 3);

      expect(apiClient.delete).toHaveBeenCalledWith(INTEGRATION_ROUTES.SLACK_CHANNEL(SLUG, 3));
    });
  });

  // --- Webhooks ---
  describe('getWebhooks', () => {
    it('GET les webhooks', async () => {
      const hooks = [{ id: 1, url: 'https://x' }] as any;
      vi.mocked(apiClient.get).mockResolvedValue(envelope(hooks));

      const result = await getWebhooks(SLUG);

      expect(apiClient.get).toHaveBeenCalledWith(INTEGRATION_ROUTES.WEBHOOKS(SLUG));
      expect(result).toEqual(hooks);
    });
  });

  describe('createWebhook', () => {
    it('POST le payload de webhook', async () => {
      const payload = { url: 'https://x', eventTypes: ['issue.created'] };
      const hook = { id: 1, ...payload, active: true } as any;
      vi.mocked(apiClient.post).mockResolvedValue(envelope(hook));

      const result = await createWebhook(SLUG, payload);

      expect(apiClient.post).toHaveBeenCalledWith(INTEGRATION_ROUTES.WEBHOOKS(SLUG), payload);
      expect(result).toEqual(hook);
    });
  });

  describe('updateWebhook', () => {
    it('PUT le payload de webhook', async () => {
      const payload = { url: 'https://y', eventTypes: ['issue.updated'] };
      const hook = { id: 1, ...payload, active: true } as any;
      vi.mocked(apiClient.put).mockResolvedValue(envelope(hook));

      const result = await updateWebhook(SLUG, 1, payload);

      expect(apiClient.put).toHaveBeenCalledWith(INTEGRATION_ROUTES.WEBHOOK(SLUG, 1), payload);
      expect(result).toEqual(hook);
    });
  });

  describe('deleteWebhook', () => {
    it('DELETE un webhook', async () => {
      vi.mocked(apiClient.delete).mockResolvedValue(envelope(null));

      await deleteWebhook(SLUG, 1);

      expect(apiClient.delete).toHaveBeenCalledWith(INTEGRATION_ROUTES.WEBHOOK(SLUG, 1));
    });
  });
});
