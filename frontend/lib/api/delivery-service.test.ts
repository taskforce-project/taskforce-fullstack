import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getDeliveryProviders, delegateIssue, getIssueRun } from './delivery-service';
import { apiClient } from './client';
import { DELIVERY_ROUTES } from '../config/api-routes';

vi.mock('./client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
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
      id: 1, issueId: 5, providerKey: 'stub', model: 'stub', status: 'QUEUED',
      summary: null, resultUrl: null, error: null, startedById: 7, createdAt: null, updatedAt: null,
    };
    vi.mocked(apiClient.post).mockResolvedValue(envelope(run));

    const res = await delegateIssue(SLUG, 5, 'stub');

    expect(apiClient.post).toHaveBeenCalledWith(DELIVERY_ROUTES.DELEGATE(SLUG, 5), { providerKey: 'stub', model: undefined });
    expect(res).toEqual(run);
  });

  it('getIssueRun GET le dernier run (null si aucun)', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(envelope(null));

    const res = await getIssueRun(SLUG, 5);

    expect(apiClient.get).toHaveBeenCalledWith(DELIVERY_ROUTES.RUN(SLUG, 5));
    expect(res).toBeNull();
  });
});
