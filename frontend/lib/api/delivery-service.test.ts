import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getDeliveryProviders,
  delegateIssue,
  getIssueRun,
  listWorkspaceRuns,
  getRunnerStatus,
  provisionRunner,
  getRunActivity,
  decideApproval,
} from './delivery-service';
import { apiClient } from './client';
import { DELIVERY_ROUTES } from '../config/api-routes';

vi.mock('./client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
  getErrorMessage: vi.fn((e: unknown) => (e instanceof Error ? e.message : 'error')),
}));

const SLUG = 'acme';
const envelope = <T>(payload: T) => ({ data: { success: true, message: 'ok', data: payload } });

describe('delivery-service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET la liste des providers et retourne le payload', async () => {
    const providers = [
      { key: 'claude-code', displayName: 'Claude Code', logoKey: 'claude', available: false, models: ['claude-opus'] },
    ];
    vi.mocked(apiClient.get).mockResolvedValue(envelope(providers));

    const result = await getDeliveryProviders(SLUG);

    expect(apiClient.get).toHaveBeenCalledWith(DELIVERY_ROUTES.PROVIDERS(SLUG));
    expect(result).toEqual(providers);
  });

  it('propage l’erreur du client', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('boom'));
    await expect(getDeliveryProviders(SLUG)).rejects.toThrow('boom');
  });

  it('delegateIssue POST le provider et retourne le run', async () => {
    const run = {
      id: 1, issueId: 5, providerKey: 'claude-code', model: 'claude-sonnet-5', status: 'QUEUED',
      summary: null, resultUrl: null, error: null, startedById: 7, createdAt: null, updatedAt: null,
    };
    vi.mocked(apiClient.post).mockResolvedValue(envelope(run));

    const res = await delegateIssue(SLUG, 5, 'claude-code');

    expect(apiClient.post).toHaveBeenCalledWith(DELIVERY_ROUTES.DELEGATE(SLUG, 5), { providerKey: 'claude-code', model: undefined });
    expect(res).toEqual(run);
  });

  it('getIssueRun GET le dernier run (null si aucun)', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(envelope(null));

    const res = await getIssueRun(SLUG, 5);

    expect(apiClient.get).toHaveBeenCalledWith(DELIVERY_ROUTES.RUN(SLUG, 5));
    expect(res).toBeNull();
  });

  it('listWorkspaceRuns GET les runs du workspace (silentError, [] si vide)', async () => {
    const runs = [
      { id: 1, issueId: 5, providerKey: 'claude-code', model: null, status: 'RUNNING', summary: null, resultUrl: null, error: null, startedById: 7, createdAt: null, updatedAt: null },
    ];
    vi.mocked(apiClient.get).mockResolvedValue(envelope(runs));
    const res = await listWorkspaceRuns(SLUG);
    expect(apiClient.get).toHaveBeenCalledWith(DELIVERY_ROUTES.RUNS(SLUG), { silentError: true });
    expect(res).toEqual(runs);
  });

  it('listWorkspaceRuns retourne [] si data null', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(envelope(null));
    const res = await listWorkspaceRuns(SLUG);
    expect(res).toEqual([]);
  });

  it('getRunnerStatus GET l’état du runner, en appel de fond (silentError)', async () => {
    const status = { exists: false, clientId: 'tf-runner-u29', ownerEmail: 'pierre@example.com' };
    vi.mocked(apiClient.get).mockResolvedValue(envelope(status));

    const res = await getRunnerStatus();

    expect(apiClient.get).toHaveBeenCalledWith(DELIVERY_ROUTES.RUNNER, { silentError: true });
    expect(res).toEqual(status);
  });

  it('provisionRunner POST et retourne les identifiants (le secret n’est rendu qu’ici)', async () => {
    const creds = { clientId: 'tf-runner-u29', clientSecret: 's3cr3t', ownerEmail: 'pierre@example.com' };
    vi.mocked(apiClient.post).mockResolvedValue(envelope(creds));

    const res = await provisionRunner();

    expect(apiClient.post).toHaveBeenCalledWith(DELIVERY_ROUTES.RUNNER);
    expect(res).toEqual(creds);
  });

  it('GET l’activité d’un run après un événement, sans toast (lecture en boucle)', async () => {
    const activity = { events: [{ seq: 3, kind: 'tool', tool: 'Bash', text: 'npm test', at: null }], approvals: [] };
    vi.mocked(apiClient.get).mockResolvedValue(envelope(activity));

    const result = await getRunActivity(SLUG, 100, 2);

    expect(apiClient.get).toHaveBeenCalledWith(DELIVERY_ROUTES.ACTIVITY(SLUG, 100, 2), { silentError: true });
    expect(DELIVERY_ROUTES.ACTIVITY(SLUG, 100, 2)).toBe('/api/workspaces/acme/delivery/runs/100/activity?after=2');
    expect(result).toEqual(activity);
  });

  it.each([[true, 'ALLOW'], [false, 'DENY']])('POST la décision (autorisé=%s -> %s)', async (allow, decision) => {
    vi.mocked(apiClient.post).mockResolvedValue(envelope(null));

    await decideApproval(SLUG, 100, 9, allow);

    expect(apiClient.post).toHaveBeenCalledWith(DELIVERY_ROUTES.DECIDE(SLUG, 100, 9), { decision });
  });
});
