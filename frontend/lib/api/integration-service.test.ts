import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getGitHubStatus,
  connectGitHub,
  disconnectGitHub,
  getGitHubRepos,
  getGitHubRepoIssues,
  syncGitHub,
  getGitHubLinks,
  addGitHubLink,
  deleteGitHubLink,
  getSlackStatus,
  connectSlack,
  disconnectSlack,
  getSlackChannels,
  addSlackChannel,
  deleteSlackChannel,
  syncSlack,
  getWebhooks,
  createWebhook,
  updateWebhook,
  deleteWebhook,
  regenerateWebhookSecret,
  testWebhook,
  getWebhookDeliveries,
  importMcpProject,
  getIntegrationCatalog,
  getMcpServers,
  connectMcpServer,
  disconnectMcpServer,
  startMcpOAuth,
  completeMcpOAuth,
  finishMcpReturn,
  NEW_CUSTOM_MCP_KEY,
  connectTool,
  approveMcpTools,
  getCompanyApps,
  saveCompanyApp,
  removeCompanyApp,
  executeMcpAction,
  getMcpServerTools,
} from './integration-service';
import { apiClient } from './client';
import { INTEGRATION_ROUTES } from '../config/api-routes';

/** Les gestes d'un panneau de connexion : leur échec se dit dans le panneau, sans toast global. */
const SILENT = { silentError: true };

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
    it('GET la route de connexion puis navigue vers authorizeUrl', async () => {
      const url = 'https://github.com/login/oauth/authorize?client_id=x&state=abc';
      vi.mocked(apiClient.get).mockResolvedValue({ data: { data: { authorizeUrl: url } } });
      window.location.href = '';

      await connectGitHub(SLUG);

      expect(apiClient.get).toHaveBeenCalledWith(INTEGRATION_ROUTES.GITHUB_CONNECT(SLUG));
      expect(window.location.href).toBe(url);
    });

    it('avec returnTo : le chemin de retour part en paramètre (le dialogue de création se rouvrira)', async () => {
      const url = 'https://github.com/login/oauth/authorize?client_id=x&state=def';
      vi.mocked(apiClient.get).mockResolvedValue({ data: { data: { authorizeUrl: url } } });
      window.location.href = '';

      await connectGitHub(SLUG, `/${SLUG}?newProject=repo`);

      expect(apiClient.get).toHaveBeenCalledWith(
        INTEGRATION_ROUTES.GITHUB_CONNECT(SLUG),
        { params: { returnTo: `/${SLUG}?newProject=repo` } },
      );
      expect(window.location.href).toBe(url);
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

  describe('syncGitHub', () => {
    it('POST la synchro du dépôt vers le Brain OS', async () => {
      const result = { created: 2, updated: 1, total: 3 };
      vi.mocked(apiClient.post).mockResolvedValue(envelope(result));

      const res = await syncGitHub(SLUG, 'octo/repo');

      expect(apiClient.post).toHaveBeenCalledWith(INTEGRATION_ROUTES.GITHUB_SYNC(SLUG, 'octo/repo'));
      expect(res).toEqual(result);
    });
  });

  describe('syncSlack', () => {
    it('POST la synchro du canal vers le Brain OS', async () => {
      const result = { created: 5, updated: 0, total: 5 };
      vi.mocked(apiClient.post).mockResolvedValue(envelope(result));

      const res = await syncSlack(SLUG, 'C123');

      expect(apiClient.post).toHaveBeenCalledWith(INTEGRATION_ROUTES.SLACK_SYNC(SLUG, 'C123'));
      expect(res).toEqual(result);
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
    it('GET la route de connexion puis navigue vers authorizeUrl', async () => {
      const url = 'https://slack.com/oauth/v2/authorize?client_id=x&state=abc';
      vi.mocked(apiClient.get).mockResolvedValue({ data: { data: { authorizeUrl: url } } });
      window.location.href = '';

      await connectSlack(SLUG);

      expect(apiClient.get).toHaveBeenCalledWith(INTEGRATION_ROUTES.SLACK_CONNECT(SLUG));
      expect(window.location.href).toBe(url);
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
    it('POST le payload de webhook et renvoie le webhook avec son secret', async () => {
      const payload = { url: 'https://x', eventTypes: ['issue.created'] };
      const created = { webhook: { id: 1, ...payload, active: true }, secret: 'whsec_x' } as any;
      vi.mocked(apiClient.post).mockResolvedValue(envelope(created));

      const result = await createWebhook(SLUG, payload);

      expect(apiClient.post).toHaveBeenCalledWith(INTEGRATION_ROUTES.WEBHOOKS(SLUG), payload);
      expect(result.secret).toBe('whsec_x');
    });
  });

  describe('secret, test et historique d\'un webhook', () => {
    it('POST secret renvoie le nouveau secret', async () => {
      vi.mocked(apiClient.post).mockResolvedValue(envelope({ secret: 'whsec_new' }));

      expect(await regenerateWebhookSecret(SLUG, 1)).toBe('whsec_new');
      expect(apiClient.post).toHaveBeenCalledWith(INTEGRATION_ROUTES.WEBHOOK_SECRET(SLUG, 1));
    });

    it('POST test renvoie le résultat de l\'envoi', async () => {
      const delivery = { deliveryId: 'd1', status: 'DELIVERED', lastStatus: 204 } as any;
      vi.mocked(apiClient.post).mockResolvedValue(envelope(delivery));

      expect(await testWebhook(SLUG, 1)).toEqual(delivery);
      expect(apiClient.post).toHaveBeenCalledWith(INTEGRATION_ROUTES.WEBHOOK_TEST(SLUG, 1));
    });

    it('GET deliveries renvoie l\'historique', async () => {
      vi.mocked(apiClient.get).mockResolvedValue(envelope([]));

      expect(await getWebhookDeliveries(SLUG, 1)).toEqual([]);
      expect(apiClient.get).toHaveBeenCalledWith(INTEGRATION_ROUTES.WEBHOOK_DELIVERIES(SLUG, 1));
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

  // --- Catalogue et serveurs MCP (ADR-020) ---
  describe('getIntegrationCatalog', () => {
    it('GET le catalogue du workspace', async () => {
      const catalog = { total: 28, connected: 0, categories: [] };
      vi.mocked(apiClient.get).mockResolvedValue(envelope(catalog));

      expect(await getIntegrationCatalog(SLUG)).toEqual(catalog);
      expect(apiClient.get).toHaveBeenCalledWith(INTEGRATION_ROUTES.CATALOG(SLUG));
    });
  });

  describe('serveurs MCP', () => {
    const status = {
      connectorKey: 'custom-docs', name: 'Docs', host: 'docs.example.com', scope: 'PERSONAL', state: 'CONNECTED',
      accountLabel: null, reachable: true, tools: ['search'], changedTools: [], error: null,
    };

    it('GET les statuts', async () => {
      vi.mocked(apiClient.get).mockResolvedValue(envelope([status]));

      expect(await getMcpServers(SLUG)).toEqual([status]);
      expect(apiClient.get).toHaveBeenCalledWith(INTEGRATION_ROUTES.MCP_SERVERS(SLUG));
    });

    it('POST un nouveau serveur ajouté à la main : clé « custom », nom et en-tête choisi', async () => {
      vi.mocked(apiClient.post).mockResolvedValue(envelope([status]));
      const payload = { connectorKey: NEW_CUSTOM_MCP_KEY, name: 'Docs', mcpUrl: 'https://docs.example.com/mcp', mcpToken: 'k-1', headerName: 'X-Api-Key' };

      expect(await connectMcpServer(SLUG, payload)).toEqual([status]);
      expect(NEW_CUSTOM_MCP_KEY).toBe('custom');
      expect(apiClient.post).toHaveBeenCalledWith(INTEGRATION_ROUTES.MCP_SERVERS(SLUG), payload, SILENT);
    });

    it('DELETE sa connexion par la clé, et dit si l\'éditeur a révoqué l\'accès', async () => {
      const result = { revoked: true, revocable: true, servers: [] };
      vi.mocked(apiClient.delete).mockResolvedValue(envelope(result));

      expect(await disconnectMcpServer(SLUG, 'custom-docs')).toEqual(result);
      expect(apiClient.delete).toHaveBeenCalledWith(`${INTEGRATION_ROUTES.MCP_SERVER(SLUG, 'custom-docs')}?shared=false`, SILENT);
    });

    it('DELETE la connexion de l\'espace avec shared=true', async () => {
      vi.mocked(apiClient.delete).mockResolvedValue(envelope({ revoked: false, revocable: false, servers: [] }));

      await disconnectMcpServer(SLUG, 'notion', true);
      expect(apiClient.delete).toHaveBeenCalledWith(`${INTEGRATION_ROUTES.MCP_SERVER(SLUG, 'notion')}?shared=true`, SILENT);
    });

    // Un échec réseau se dit une fois, dans le panneau : les gestes du panneau ne lèvent pas le toast global (R161).
    it('POST le geste « Connect » sans toast global et rend la suite choisie par le serveur', async () => {
      const outcome = { next: 'browser', authorizeUrl: 'https://vendor.example/authorize', message: null };
      vi.mocked(apiClient.post).mockResolvedValue(envelope(outcome));

      expect(await connectTool(SLUG, 'notion', { allowWrites: false, shared: false })).toEqual(outcome);
      expect(apiClient.post).toHaveBeenCalledWith(INTEGRATION_ROUTES.MCP_CONNECT(SLUG, 'notion'),
        { allowWrites: false, shared: false }, SILENT);
    });

    it('POST l\'accord redonné aux outils changés', async () => {
      vi.mocked(apiClient.post).mockResolvedValue(envelope([status]));

      expect(await approveMcpTools(SLUG, 'notion')).toEqual([status]);
      expect(apiClient.post).toHaveBeenCalledWith(`${INTEGRATION_ROUTES.MCP_TOOLS_APPROVE(SLUG, 'notion')}?shared=false`, undefined, SILENT);
    });

    it('lit, enregistre et retire l\'application de l\'entreprise, jamais son secret en retour', async () => {
      const app = { connectorKey: 'slack-mcp', clientId: 'c-1', hasSecret: true };
      vi.mocked(apiClient.get).mockResolvedValue(envelope([app]));
      vi.mocked(apiClient.put).mockResolvedValue(envelope(app));
      vi.mocked(apiClient.delete).mockResolvedValue(envelope(null));

      expect(await getCompanyApps(SLUG)).toEqual([app]);
      expect(await saveCompanyApp(SLUG, 'slack-mcp', 'c-1', 's-1')).toEqual(app);
      expect(apiClient.put).toHaveBeenCalledWith(INTEGRATION_ROUTES.MCP_APP(SLUG, 'slack-mcp'), { clientId: 'c-1', clientSecret: 's-1' }, SILENT);
      await removeCompanyApp(SLUG, 'slack-mcp');
      expect(apiClient.delete).toHaveBeenCalledWith(INTEGRATION_ROUTES.MCP_APP(SLUG, 'slack-mcp'));
    });

    it('POST une action de la console, avec la confirmation de la personne', async () => {
      const result = { toolRef: 'notion__notion-search', status: 'success', output: '[]', reason: null };
      vi.mocked(apiClient.post).mockResolvedValue(envelope(result));

      expect(await executeMcpAction(SLUG, 'notion__notion-search', { q: 'x' }, true)).toEqual(result);
      expect(apiClient.post).toHaveBeenCalledWith(INTEGRATION_ROUTES.MCP_ACTION_EXECUTE(SLUG),
        { toolRef: 'notion__notion-search', arguments: { q: 'x' }, confirmed: true });
    });

    it('GET les outils d\'une connexion pour la console', async () => {
      vi.mocked(apiClient.get).mockResolvedValue(envelope([{ name: 'search', description: '', inputSchema: null, readOnly: true }]));

      expect(await getMcpServerTools(SLUG, 'notion')).toHaveLength(1);
      expect(apiClient.get).toHaveBeenCalledWith(INTEGRATION_ROUTES.MCP_SERVER_TOOLS(SLUG, 'notion'));
    });

    it("démarre l'OAuth avec le nom d'un serveur ajouté à la main et renvoie l'URL d'autorisation", async () => {
      vi.mocked(apiClient.post).mockResolvedValue(envelope({ authorizeUrl: 'https://as.example.com/authorize' }));

      const url = await startMcpOAuth(SLUG, 'custom', 'https://docs.example.com/mcp', undefined, 'Docs');

      expect(url).toBe('https://as.example.com/authorize');
      expect(apiClient.post).toHaveBeenCalledWith(
        INTEGRATION_ROUTES.MCP_OAUTH_START(SLUG, 'custom'),
        { mcpUrl: 'https://docs.example.com/mcp', returnTo: undefined, name: 'Docs' },
      );
    });
  });

  // --- Le retour d'une connexion : l'app, connectée, la finit ---
  describe('finishMcpReturn', () => {
    it("finit la connexion avec le state et le jeton du retour, une seule fois par retour", async () => {
      vi.mocked(apiClient.post).mockResolvedValue(envelope({ outcome: 'connected', connectorKey: 'linear' }));
      const params = new URLSearchParams('section=integrations&mcp=finish&connector=linear&state=st-1&finish=fin-1');

      const first = await finishMcpReturn(params);
      const again = await finishMcpReturn(new URLSearchParams(params.toString()));

      expect(first).toEqual({ outcome: 'connected', connectorKey: 'linear' });
      expect(again).toEqual(first);
      expect(apiClient.post).toHaveBeenCalledTimes(1);
      expect(apiClient.post).toHaveBeenCalledWith(INTEGRATION_ROUTES.MCP_OAUTH_COMPLETE, { state: 'st-1', finish: 'fin-1' });
    });

    it("rien à finir sans retour ; un retour incomplet ou refusé se dit error, sans lever", async () => {
      vi.mocked(apiClient.post).mockRejectedValue(new Error('403'));

      expect(finishMcpReturn(new URLSearchParams('mcp=connected'))).toBeNull();
      await expect(finishMcpReturn(new URLSearchParams('mcp=finish&connector=linear')))
        .resolves.toEqual({ outcome: 'error', connectorKey: 'linear' });
      await expect(finishMcpReturn(new URLSearchParams('mcp=finish&connector=notion&state=st-2&finish=fin-2')))
        .resolves.toEqual({ outcome: 'error', connectorKey: 'notion' });
      expect(apiClient.post).toHaveBeenCalledTimes(1);
    });

    it("completeMcpOAuth : POST du state et du jeton, rend l'issue", async () => {
      vi.mocked(apiClient.post).mockResolvedValue(envelope({ outcome: 'admin', connectorKey: 'slack-mcp' }));

      await expect(completeMcpOAuth('st-3', 'fin-3')).resolves.toEqual({ outcome: 'admin', connectorKey: 'slack-mcp' });
      expect(apiClient.post).toHaveBeenCalledWith(INTEGRATION_ROUTES.MCP_OAUTH_COMPLETE, { state: 'st-3', finish: 'fin-3' });
    });
  });

  // --- Import MCP (TF-MCP-04) ---
  describe('importMcpProject', () => {
    it('POST le connecteur + le nom cible et renvoie le résumé d\'import', async () => {
      const result = { projectId: 99, projectIdentifier: 'IMP', projectName: 'Import Linear', imported: 5, found: 5 };
      vi.mocked(apiClient.post).mockResolvedValue(envelope(result));

      const out = await importMcpProject(SLUG, 'linear', 'Import Linear');

      expect(apiClient.post).toHaveBeenCalledWith(
        INTEGRATION_ROUTES.MCP_IMPORT(SLUG),
        { connectorKey: 'linear', targetName: 'Import Linear' },
      );
      expect(out).toEqual(result);
    });
  });
});
