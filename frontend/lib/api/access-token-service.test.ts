import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createAccessToken, listAccessTokens, revokeAccessToken } from './access-token-service';
import { apiClient } from './client';
import { ACCESS_TOKEN_ROUTES } from '../config/api-routes';

vi.mock('./client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

const envelope = <T>(payload: T) => ({ data: { success: true, message: 'ok', data: payload } });
const TOKEN = { id: 3, name: 'Laptop', hint: 'tfp_abcdefgh', createdAt: null, lastUsedAt: null, expiresAt: null, expired: false };

describe('access-token-service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists the tokens without a toast (background call)', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(envelope([TOKEN]));

    expect(await listAccessTokens()).toEqual([TOKEN]);
    expect(apiClient.get).toHaveBeenCalledWith(ACCESS_TOKEN_ROUTES.TOKENS, { silentError: true });
  });

  it('lists nothing when the payload is empty', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(envelope(null));

    expect(await listAccessTokens()).toEqual([]);
  });

  it('creates a token and returns its value once', async () => {
    vi.mocked(apiClient.post).mockResolvedValue(envelope({ token: TOKEN, value: 'tfp_secret' }));

    const created = await createAccessToken('Laptop', 90);

    expect(apiClient.post).toHaveBeenCalledWith('/api/users/me/tokens', { name: 'Laptop', expiresInDays: 90 });
    expect(created.value).toBe('tfp_secret');
  });

  it('revokes a token', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue(envelope(null));

    await revokeAccessToken(3);

    expect(apiClient.delete).toHaveBeenCalledWith('/api/users/me/tokens/3');
  });
});
