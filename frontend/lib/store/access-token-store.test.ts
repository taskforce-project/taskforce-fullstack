import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAccessTokenStore } from './access-token-store';
import * as svc from '../api/access-token-service';
import type { AccessToken } from '../api/access-token-service';

vi.mock('../api/access-token-service', () => ({
  listAccessTokens: vi.fn(),
  createAccessToken: vi.fn(),
  revokeAccessToken: vi.fn(),
}));

const token = (id: number, name = 'Laptop'): AccessToken => ({
  id, name, hint: 'tfp_abcdefgh', createdAt: null, lastUsedAt: null, expiresAt: null, expired: false,
});

describe('access-token-store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    act(() => useAccessTokenStore.setState({ tokens: null }));
  });

  it('fetchTokens loads the list', async () => {
    vi.mocked(svc.listAccessTokens).mockResolvedValue([token(1)]);
    await act(async () => { await useAccessTokenStore.getState().fetchTokens(); });
    expect(useAccessTokenStore.getState().tokens).toEqual([token(1)]);
  });

  it('fetchTokens returns null on failure', async () => {
    vi.mocked(svc.listAccessTokens).mockRejectedValue(new Error('x'));
    let res: unknown = 'unset';
    await act(async () => { res = await useAccessTokenStore.getState().fetchTokens(); });
    expect(res).toBeNull();
    expect(useAccessTokenStore.getState().tokens).toBeNull();
  });

  it('createToken returns the value to the caller and keeps only the public token', async () => {
    act(() => useAccessTokenStore.setState({ tokens: [token(1)] }));
    vi.mocked(svc.createAccessToken).mockResolvedValue({ token: token(2, 'CI'), value: 'tfp_secret' });

    let created: Awaited<ReturnType<typeof svc.createAccessToken>> | null = null;
    await act(async () => { created = await useAccessTokenStore.getState().createToken('CI', null); });

    expect(created).toEqual({ token: token(2, 'CI'), value: 'tfp_secret' });
    expect(svc.createAccessToken).toHaveBeenCalledWith('CI', null);
    expect(useAccessTokenStore.getState().tokens?.map((t) => t.id)).toEqual([2, 1]);
    expect(JSON.stringify(useAccessTokenStore.getState())).not.toContain('tfp_secret');
  });

  it('createToken returns null on failure', async () => {
    vi.mocked(svc.createAccessToken).mockRejectedValue(new Error('x'));
    let res: unknown = 'unset';
    await act(async () => { res = await useAccessTokenStore.getState().createToken('CI', 30); });
    expect(res).toBeNull();
  });

  it('revokeToken removes the token from the list', async () => {
    act(() => useAccessTokenStore.setState({ tokens: [token(1), token(2)] }));
    vi.mocked(svc.revokeAccessToken).mockResolvedValue(undefined);
    let ok = false;
    await act(async () => { ok = await useAccessTokenStore.getState().revokeToken(1); });
    expect(ok).toBe(true);
    expect(useAccessTokenStore.getState().tokens?.map((t) => t.id)).toEqual([2]);
  });

  it('revokeToken returns false on failure and keeps the list', async () => {
    act(() => useAccessTokenStore.setState({ tokens: [token(1)] }));
    vi.mocked(svc.revokeAccessToken).mockRejectedValue(new Error('x'));
    let ok = true;
    await act(async () => { ok = await useAccessTokenStore.getState().revokeToken(1); });
    expect(ok).toBe(false);
    expect(useAccessTokenStore.getState().tokens).toHaveLength(1);
  });
});
