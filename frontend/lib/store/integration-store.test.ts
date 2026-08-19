import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useIntegrationStore } from './integration-store';
import type {
  IntegrationStatus,
  GitHubLink,
  SlackChannel,
  Webhook,
} from '../api/integration-service';
import * as svc from '../api/integration-service';

vi.mock('../api/integration-service', () => ({
  getGitHubStatus: vi.fn(),
  connectGitHub: vi.fn(),
  disconnectGitHub: vi.fn(),
  getGitHubLinks: vi.fn(),
  addGitHubLink: vi.fn(),
  deleteGitHubLink: vi.fn(),
  getSlackStatus: vi.fn(),
  connectSlack: vi.fn(),
  disconnectSlack: vi.fn(),
  getSlackChannels: vi.fn(),
  addSlackChannel: vi.fn(),
  deleteSlackChannel: vi.fn(),
  getWebhooks: vi.fn(),
  createWebhook: vi.fn(),
  updateWebhook: vi.fn(),
  deleteWebhook: vi.fn(),
}));

function makeStatus(overrides: Partial<IntegrationStatus> = {}): IntegrationStatus {
  return { id: 1, provider: 'GITHUB', connected: true, meta: null, connectedAt: '2026-01-01T00:00:00.000Z', ...overrides };
}

function makeLink(overrides: Partial<GitHubLink> = {}): GitHubLink {
  return {
    id: 1,
    linkType: 'PR',
    repoFullName: 'org/repo',
    prNumber: 42,
    prUrl: 'https://gh/pr/42',
    commitSha: null,
    commitUrl: null,
    title: 'A PR',
    status: 'OPEN',
    linkedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeChannel(overrides: Partial<SlackChannel> = {}): SlackChannel {
  return { id: 1, channelId: 'C1', channelName: 'general', eventTypes: [], active: true, createdAt: '2026-01-01T00:00:00.000Z', ...overrides };
}

function makeWebhook(overrides: Partial<Webhook> = {}): Webhook {
  return { id: 1, url: 'https://hook', eventTypes: [], active: true, lastFiredAt: null, lastStatus: null, createdAt: '2026-01-01T00:00:00.000Z', ...overrides };
}

describe('integration-store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    act(() => {
      useIntegrationStore.setState({
        githubStatus: null,
        slackStatus: null,
        webhooks: [],
        slackChannels: [],
        githubLinks: {},
      });
    });
  });

  // --- GitHub ---

  it('fetchGitHubStatus sets the status', async () => {
    const status = makeStatus();
    vi.mocked(svc.getGitHubStatus).mockResolvedValue(status);

    await act(async () => {
      await useIntegrationStore.getState().fetchGitHubStatus('acme');
    });

    expect(svc.getGitHubStatus).toHaveBeenCalledWith('acme');
    expect(useIntegrationStore.getState().githubStatus).toEqual(status);
  });

  it('connectGitHub delegates to the service', async () => {
    await act(async () => { await useIntegrationStore.getState().connectGitHub('acme'); });
    expect(svc.connectGitHub).toHaveBeenCalledWith('acme');
  });

  it('disconnectGitHub resets the status to disconnected', async () => {
    act(() => useIntegrationStore.setState({ githubStatus: makeStatus() }));
    vi.mocked(svc.disconnectGitHub).mockResolvedValue(undefined);

    await act(async () => {
      await useIntegrationStore.getState().disconnectGitHub('acme');
    });

    expect(svc.disconnectGitHub).toHaveBeenCalledWith('acme');
    expect(useIntegrationStore.getState().githubStatus).toEqual({
      id: null,
      provider: 'GITHUB',
      connected: false,
      meta: null,
      connectedAt: null,
    });
  });

  it('fetchGitHubLinks stores links indexed by issueId', async () => {
    const links = [makeLink()];
    vi.mocked(svc.getGitHubLinks).mockResolvedValue(links);

    await act(async () => {
      await useIntegrationStore.getState().fetchGitHubLinks('acme', 55);
    });

    expect(svc.getGitHubLinks).toHaveBeenCalledWith('acme', 55);
    expect(useIntegrationStore.getState().githubLinks[55]).toEqual(links);
  });

  it('addGitHubLink appends the link under the issueId', async () => {
    act(() => useIntegrationStore.setState({ githubLinks: { 55: [makeLink({ id: 1 })] } }));
    const created = makeLink({ id: 2 });
    vi.mocked(svc.addGitHubLink).mockResolvedValue(created);

    let result: GitHubLink | undefined;
    await act(async () => {
      result = await useIntegrationStore.getState().addGitHubLink('acme', 55, {
        linkType: 'PR',
        repoFullName: 'org/repo',
      });
    });

    expect(svc.addGitHubLink).toHaveBeenCalledWith('acme', 55, { linkType: 'PR', repoFullName: 'org/repo' });
    expect(useIntegrationStore.getState().githubLinks[55].map((l) => l.id)).toEqual([1, 2]);
    expect(result).toEqual(created);
  });

  it('addGitHubLink initialises the array when the issue had no links', async () => {
    const created = makeLink({ id: 9 });
    vi.mocked(svc.addGitHubLink).mockResolvedValue(created);

    await act(async () => {
      await useIntegrationStore.getState().addGitHubLink('acme', 77, {
        linkType: 'PR',
        repoFullName: 'org/repo',
      });
    });

    expect(useIntegrationStore.getState().githubLinks[77]).toEqual([created]);
  });

  it('removeGitHubLink filters the link out of the issue bucket', async () => {
    act(() => useIntegrationStore.setState({ githubLinks: { 55: [makeLink({ id: 1 }), makeLink({ id: 2 })] } }));
    vi.mocked(svc.deleteGitHubLink).mockResolvedValue(undefined);

    await act(async () => {
      await useIntegrationStore.getState().removeGitHubLink('acme', 55, 1);
    });

    expect(svc.deleteGitHubLink).toHaveBeenCalledWith('acme', 1);
    expect(useIntegrationStore.getState().githubLinks[55].map((l) => l.id)).toEqual([2]);
  });

  // --- Slack ---

  it('fetchSlackStatus sets the status', async () => {
    const status = makeStatus({ provider: 'SLACK' });
    vi.mocked(svc.getSlackStatus).mockResolvedValue(status);

    await act(async () => {
      await useIntegrationStore.getState().fetchSlackStatus('acme');
    });

    expect(svc.getSlackStatus).toHaveBeenCalledWith('acme');
    expect(useIntegrationStore.getState().slackStatus).toEqual(status);
  });

  it('connectSlack delegates to the service', async () => {
    await act(async () => { await useIntegrationStore.getState().connectSlack('acme'); });
    expect(svc.connectSlack).toHaveBeenCalledWith('acme');
  });

  it('disconnectSlack resets the status to disconnected', async () => {
    act(() => useIntegrationStore.setState({ slackStatus: makeStatus({ provider: 'SLACK' }) }));
    vi.mocked(svc.disconnectSlack).mockResolvedValue(undefined);

    await act(async () => {
      await useIntegrationStore.getState().disconnectSlack('acme');
    });

    expect(svc.disconnectSlack).toHaveBeenCalledWith('acme');
    expect(useIntegrationStore.getState().slackStatus).toEqual({
      id: null,
      provider: 'SLACK',
      connected: false,
      meta: null,
      connectedAt: null,
    });
  });

  it('fetchSlackChannels sets the channels', async () => {
    const channels = [makeChannel()];
    vi.mocked(svc.getSlackChannels).mockResolvedValue(channels);

    await act(async () => {
      await useIntegrationStore.getState().fetchSlackChannels('acme');
    });

    expect(svc.getSlackChannels).toHaveBeenCalledWith('acme');
    expect(useIntegrationStore.getState().slackChannels).toEqual(channels);
  });

  it('addSlackChannel appends the channel', async () => {
    act(() => useIntegrationStore.setState({ slackChannels: [makeChannel({ id: 1 })] }));
    const created = makeChannel({ id: 2 });
    vi.mocked(svc.addSlackChannel).mockResolvedValue(created);

    await act(async () => {
      await useIntegrationStore.getState().addSlackChannel('acme', {
        channelId: 'C2',
        channelName: 'random',
        eventTypes: [],
      });
    });

    expect(svc.addSlackChannel).toHaveBeenCalledWith('acme', { channelId: 'C2', channelName: 'random', eventTypes: [] });
    expect(useIntegrationStore.getState().slackChannels.map((c) => c.id)).toEqual([1, 2]);
  });

  it('removeSlackChannel filters out the channel', async () => {
    act(() => useIntegrationStore.setState({ slackChannels: [makeChannel({ id: 1 }), makeChannel({ id: 2 })] }));
    vi.mocked(svc.deleteSlackChannel).mockResolvedValue(undefined);

    await act(async () => {
      await useIntegrationStore.getState().removeSlackChannel('acme', 1);
    });

    expect(svc.deleteSlackChannel).toHaveBeenCalledWith('acme', 1);
    expect(useIntegrationStore.getState().slackChannels.map((c) => c.id)).toEqual([2]);
  });

  // --- Webhooks ---

  it('fetchWebhooks sets the webhooks', async () => {
    const webhooks = [makeWebhook()];
    vi.mocked(svc.getWebhooks).mockResolvedValue(webhooks);

    await act(async () => {
      await useIntegrationStore.getState().fetchWebhooks('acme');
    });

    expect(svc.getWebhooks).toHaveBeenCalledWith('acme');
    expect(useIntegrationStore.getState().webhooks).toEqual(webhooks);
  });

  it('addWebhook appends the webhook', async () => {
    act(() => useIntegrationStore.setState({ webhooks: [makeWebhook({ id: 1 })] }));
    const created = makeWebhook({ id: 2 });
    vi.mocked(svc.createWebhook).mockResolvedValue(created);

    await act(async () => {
      await useIntegrationStore.getState().addWebhook('acme', { url: 'https://hook', eventTypes: [] });
    });

    expect(svc.createWebhook).toHaveBeenCalledWith('acme', { url: 'https://hook', eventTypes: [] });
    expect(useIntegrationStore.getState().webhooks.map((w) => w.id)).toEqual([1, 2]);
  });

  it('editWebhook replaces the webhook by id', async () => {
    act(() => useIntegrationStore.setState({ webhooks: [makeWebhook({ id: 1, url: 'old' })] }));
    const updated = makeWebhook({ id: 1, url: 'new' });
    vi.mocked(svc.updateWebhook).mockResolvedValue(updated);

    await act(async () => {
      await useIntegrationStore.getState().editWebhook('acme', 1, { url: 'new', eventTypes: [] });
    });

    expect(svc.updateWebhook).toHaveBeenCalledWith('acme', 1, { url: 'new', eventTypes: [] });
    expect(useIntegrationStore.getState().webhooks).toEqual([updated]);
  });

  it('removeWebhook filters out the webhook', async () => {
    act(() => useIntegrationStore.setState({ webhooks: [makeWebhook({ id: 1 }), makeWebhook({ id: 2 })] }));
    vi.mocked(svc.deleteWebhook).mockResolvedValue(undefined);

    await act(async () => {
      await useIntegrationStore.getState().removeWebhook('acme', 1);
    });

    expect(svc.deleteWebhook).toHaveBeenCalledWith('acme', 1);
    expect(useIntegrationStore.getState().webhooks.map((w) => w.id)).toEqual([2]);
  });
});
