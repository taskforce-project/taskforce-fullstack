import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getDeliveryProviders } from './delivery-service';
import { apiClient } from './client';
import { DELIVERY_ROUTES } from '../config/api-routes';

vi.mock('./client', () => ({
  apiClient: { get: vi.fn() },
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
});
