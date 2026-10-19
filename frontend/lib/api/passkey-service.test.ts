import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from './client';
import { listPasskeys, passkeyRegistrationOptions, registerPasskey, removePasskey } from './passkey-service';
import { PASSKEY_ROUTES } from '../config/api-routes';

vi.mock('./client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

const envelope = <T>(payload: T) => ({ data: { success: true, message: 'ok', data: payload } });
const PASSKEY = { id: 'pk-1', label: 'Passkey on Windows', createdAt: '2026-10-19T20:00:00', lastUsedAt: null };

describe('passkey-service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('asks for the options of a new passkey', async () => {
    vi.mocked(apiClient.post).mockResolvedValue(envelope({ challenge: 'c' }));

    expect(await passkeyRegistrationOptions()).toEqual({ challenge: 'c' });
    expect(apiClient.post).toHaveBeenCalledWith(PASSKEY_ROUTES.OPTIONS);
  });

  it('saves the passkey the browser created', async () => {
    vi.mocked(apiClient.post).mockResolvedValue(envelope(PASSKEY));

    expect(await registerPasskey('Passkey on Windows', { id: 'abc' })).toEqual(PASSKEY);
    expect(apiClient.post).toHaveBeenCalledWith(PASSKEY_ROUTES.PASSKEYS, { label: 'Passkey on Windows', credential: { id: 'abc' } });
  });

  it('lists the passkeys without a toast (background call)', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(envelope([PASSKEY]));

    expect(await listPasskeys()).toEqual([PASSKEY]);
    expect(apiClient.get).toHaveBeenCalledWith(PASSKEY_ROUTES.PASSKEYS, { silentError: true });
  });

  it('lists nothing when the payload is empty', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(envelope(null));

    expect(await listPasskeys()).toEqual([]);
  });

  it('removes a passkey', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue(envelope(null));

    await removePasskey('a-b_c');

    expect(apiClient.delete).toHaveBeenCalledWith('/api/users/me/passkeys/a-b_c');
  });
});
