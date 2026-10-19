import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from './client';
import { authorizeDesktopApp, listDesktopSessions, revokeDesktopSession } from './desktop-session-service';
import { DESKTOP_SESSION_ROUTES } from '../config/api-routes';

vi.mock('./client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

const envelope = <T>(payload: T) => ({ data: { success: true, message: 'ok', data: payload } });
const SESSION = { id: 1, name: 'Windows', createdAt: '2026-10-19T20:00:00', lastUsedAt: null, expiresAt: '2027-01-17T20:00:00' };

describe('desktop-session-service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('authorizes the desktop app and returns its callback address', async () => {
    vi.mocked(apiClient.post).mockResolvedValue(envelope({ redirectUrl: 'http://127.0.0.1:47812/callback?code=c&state=s' }));
    const request = { codeChallenge: 'c'.repeat(43), redirectUri: 'http://127.0.0.1:47812/callback', state: 'state-1234' };

    expect(await authorizeDesktopApp(request)).toBe('http://127.0.0.1:47812/callback?code=c&state=s');
    expect(apiClient.post).toHaveBeenCalledWith(DESKTOP_SESSION_ROUTES.AUTHORIZE, request);
  });

  it('lists the signed-in computers without a toast (background call)', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(envelope([SESSION]));

    expect(await listDesktopSessions()).toEqual([SESSION]);
    expect(apiClient.get).toHaveBeenCalledWith(DESKTOP_SESSION_ROUTES.SESSIONS, { silentError: true });
  });

  it('lists nothing when the payload is empty', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(envelope(null));

    expect(await listDesktopSessions()).toEqual([]);
  });

  it('signs a computer out', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue(envelope(null));

    await revokeDesktopSession(1);

    expect(apiClient.delete).toHaveBeenCalledWith('/api/users/me/desktop-sessions/1');
  });
});
