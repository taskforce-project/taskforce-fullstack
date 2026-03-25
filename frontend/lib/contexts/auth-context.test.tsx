import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor, renderHook, act } from '@testing-library/react';
import { AuthProvider, useAuth, useRequireAuth } from './auth-context';
import * as authService from '../api/auth-service';
import { useRouter } from 'next/navigation';

// Mock dependencies
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}));

vi.mock('../api/auth-service', () => ({
  authService: {
    login: vi.fn(),
    logout: vi.fn(),
    getCurrentUser: vi.fn(),
  },
}));

describe('AuthContext', () => {
  const mockRouter = {
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  };

  const mockUser = {
    id: '123',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    role: 'USER' as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useRouter).mockReturnValue(mockRouter as any);
    delete (globalThis as any).location;
    (globalThis as any).location = { pathname: '/dashboard' };
  });

  describe('AuthProvider', () => {
    it('should initialize with user from localStorage', async () => {
      vi.mocked(authService.authService.getCurrentUser).mockReturnValue(mockUser);

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.user).toEqual(mockUser);
      expect(result.current.isAuthenticated).toBe(true);
    });

    it('should initialize with no user when localStorage is empty', async () => {
      vi.mocked(authService.authService.getCurrentUser).mockReturnValue(null);

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
    });

    it('should redirect to dashboard when authenticated on login page', async () => {
      vi.mocked(authService.authService.getCurrentUser).mockReturnValue(mockUser);
      (globalThis as any).location = { pathname: '/auth/login' };

      renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      await waitFor(() => {
        expect(mockRouter.replace).toHaveBeenCalledWith('/dashboard');
      });
    });

    it('should redirect to dashboard when authenticated on home page', async () => {
      vi.mocked(authService.authService.getCurrentUser).mockReturnValue(mockUser);
      (globalThis as any).location = { pathname: '/' };

      renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      await waitFor(() => {
        expect(mockRouter.replace).toHaveBeenCalledWith('/dashboard');
      });
    });

    it('should not redirect when on other pages', async () => {
      vi.mocked(authService.authService.getCurrentUser).mockReturnValue(mockUser);
      (globalThis as any).location = { pathname: '/dashboard' };

      renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      await waitFor(() => {
        expect(mockRouter.replace).not.toHaveBeenCalled();
      });
    });
  });

  describe('login', () => {
    it('should login successfully and update user state', async () => {
      vi.mocked(authService.authService.getCurrentUser).mockReturnValue(null);
      vi.mocked(authService.authService.login).mockResolvedValue({
        user: mockUser,
        accessToken: 'token',
        refreshToken: 'refresh',
        expiresIn: 3600,
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.login({
          email: 'test@example.com',
          password: 'password',
        });
      });

      expect(result.current.user).toEqual(mockUser);
      expect(result.current.isAuthenticated).toBe(true);
    });

    it('should handle login failure', async () => {
      vi.mocked(authService.authService.getCurrentUser).mockReturnValue(null);
      vi.mocked(authService.authService.login).mockRejectedValue(
        new Error('Invalid credentials')
      );

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await expect(async () => {
        await act(async () => {
          await result.current.login({
            email: 'wrong@example.com',
            password: 'wrong',
          });
        });
      }).rejects.toThrow('Invalid credentials');

      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
    });
  });

  describe('logout', () => {
    it('should logout successfully and redirect', async () => {
      vi.mocked(authService.authService.getCurrentUser).mockReturnValue(mockUser);
      vi.mocked(authService.authService.logout).mockResolvedValue();

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.logout();
      });

      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
      expect(mockRouter.push).toHaveBeenCalledWith('/auth/login');
    });

    it('should handle logout errors gracefully', async () => {
      vi.mocked(authService.authService.getCurrentUser).mockReturnValue(mockUser);
      vi.mocked(authService.authService.logout).mockRejectedValue(
        new Error('Logout failed')
      );

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      try {
        await act(async () => {
          await result.current.logout();
        });
      } catch (error) {
        // Expected to throw
      }

      // Should  still redirect even on error
      expect(mockRouter.push).toHaveBeenCalledWith('/auth/login');
    });
  });

  describe('refreshUser', () => {
    it('should refresh user from localStorage', async () => {
      vi.mocked(authService.authService.getCurrentUser)
        .mockReturnValueOnce(null)
        .mockReturnValueOnce(mockUser);

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.user).toBeNull();

      act(() => {
        result.current.refreshUser();
      });

      expect(result.current.user).toEqual(mockUser);
      expect(result.current.isAuthenticated).toBe(true);
    });
  });

  describe('useAuth hook', () => {
    it('should throw error when used outside AuthProvider', () => {
      // Suppress console.error for this test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        renderHook(() => useAuth());
      }).toThrow('useAuth doit être utilisé à l\'intérieur d\'un AuthProvider');

      consoleSpy.mockRestore();
    });

    it('should return auth context when used inside AuthProvider', async () => {
      vi.mocked(authService.authService.getCurrentUser).mockReturnValue(mockUser);

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current).toHaveProperty('user');
      expect(result.current).toHaveProperty('isAuthenticated');
      expect(result.current).toHaveProperty('isLoading');
      expect(result.current).toHaveProperty('login');
      expect(result.current).toHaveProperty('logout');
      expect(result.current).toHaveProperty('refreshUser');
    });
  });

  describe('useRequireAuth hook', () => {
    it('should not redirect when authenticated', async () => {
      vi.mocked(authService.authService.getCurrentUser).mockReturnValue(mockUser);

      const { result } = renderHook(
        () => useRequireAuth(),
        {
          wrapper: AuthProvider,
        }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isAuthenticated).toBe(true);
      expect(mockRouter.push).not.toHaveBeenCalled();
    });

    it('should redirect to login when not authenticated', async () => {
      vi.mocked(authService.authService.getCurrentUser).mockReturnValue(null);

      renderHook(
        () => useRequireAuth(),
        {
          wrapper: AuthProvider,
        }
      );

      await waitFor(() => {
        expect(mockRouter.push).toHaveBeenCalledWith('/auth/login');
      });
    });

    it('should redirect to custom route when not authenticated', async () => {
      vi.mocked(authService.authService.getCurrentUser).mockReturnValue(null);

      renderHook(
        () => useRequireAuth('/custom-login'),
        {
          wrapper: AuthProvider,
        }
      );

      await waitFor(() => {
        expect(mockRouter.push).toHaveBeenCalledWith('/custom-login');
      });
    });

    it('should eventually redirect when not authenticated', async () => {
      vi.mocked(authService.authService.getCurrentUser).mockReturnValue(null);

      const { result } = renderHook(
        () => useRequireAuth(),
        {
          wrapper: AuthProvider,
        }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should redirect after loading completes
      expect(mockRouter.push).toHaveBeenCalledWith('/auth/login');
    });
  });
});
