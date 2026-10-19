import { describe, it, expect, beforeEach, vi } from 'vitest';
import { waitFor, renderHook, act } from '@testing-library/react';
import { useRouter } from 'next/navigation';

/**
 * Session dans l'app desktop : la coque connecte le compte avant d'ouvrir la fenêtre et le déconnecte elle-même.
 * Le module est chargé en mode desktop, la coque est simulée par `window.taskforceDesktop`.
 */
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
  usePathname: vi.fn(() => '/dashboard'),
}));

vi.mock('../api/auth-service', () => ({
  authService: {
    login: vi.fn(),
    logout: vi.fn(),
    getCurrentUser: vi.fn(() => null),
    isAuthenticated: vi.fn(),
  },
}));

vi.mock('../store/user-store', () => ({
  useUserStore: () => ({ fetchMe: vi.fn(async () => null), setUser: vi.fn(), clearUser: vi.fn() }),
}));

vi.stubEnv('NEXT_PUBLIC_DESKTOP', 'true');
const { AuthProvider, useAuth, useRequireAuth } = await import('./auth-context');
const { authService } = await import('../api/auth-service');

describe('AuthContext in the desktop app', () => {
  const router = { push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() };
  const signOut = vi.fn(async () => undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useRouter).mockReturnValue(router as unknown as ReturnType<typeof useRouter>);
    (window as Window & { taskforceDesktop?: unknown }).taskforceDesktop = { launchToken: 'tfd_launch', signOut };
  });

  it('signs out through the shell, which forgets the account and shows its sign-in screen', async () => {
    vi.mocked(authService.isAuthenticated).mockReturnValue(true);
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(() => result.current.logout());

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(authService.logout).not.toHaveBeenCalled();
  });

  it('never sends to the web sign-in page', async () => {
    vi.mocked(authService.isAuthenticated).mockReturnValue(false);
    const { result } = renderHook(() => useRequireAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isAuthenticated).toBe(false);
    expect(router.push).not.toHaveBeenCalled();
  });
});
