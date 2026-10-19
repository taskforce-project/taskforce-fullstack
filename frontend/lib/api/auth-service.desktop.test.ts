import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Session dans l'app desktop : la coque n'ouvre la fenêtre qu'une fois le compte connecté et donne le jeton de
 * lancement ; rien ne vient du stockage du navigateur. Module chargé en mode desktop.
 */
vi.stubEnv('NEXT_PUBLIC_DESKTOP', 'true');
const { authService } = await import('./auth-service');

describe('authService in the desktop app', () => {
  afterEach(() => {
    delete (window as Window & { taskforceDesktop?: unknown }).taskforceDesktop;
  });

  it('is signed in when the shell gives a launch token, without a stored profile', () => {
    vi.mocked(localStorage.getItem).mockReturnValue(null);
    (window as Window & { taskforceDesktop?: unknown }).taskforceDesktop = { launchToken: 'tfd_launch' };

    expect(authService.isAuthenticated()).toBe(true);
  });

  it('is signed out outside the shell, whatever the browser stored', () => {
    vi.mocked(localStorage.getItem).mockReturnValue('web-token');

    expect(authService.isAuthenticated()).toBe(false);
  });
});
