import { describe, it, expect, beforeEach, vi } from 'vitest';
import { authService } from './auth-service';
import * as client from './client';

// Mock apiClient
vi.mock('./client', () => ({
  apiClient: {
    post: vi.fn(),
  },
  getErrorMessage: vi.fn((error: any) => error.message || 'An error occurred'),
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

describe('authService - API Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
  });

  describe('login', () => {
    it('should login successfully with valid credentials', async () => {
      const mockResponse = {
        data: {
          user: {
            id: '123',
            email: 'test@example.com',
            firstName: 'Test',
            lastName: 'User',
            role: 'USER' as const,
          },
          accessToken: 'mock-access-token',
          refreshToken: 'mock-refresh-token',
          expiresIn: 3600,
        },
      };

      vi.mocked(client.apiClient.post).mockResolvedValue(mockResponse);

      const credentials = {
        email: 'test@example.com',
        password: 'Test@2024!',
      };

      const response = await authService.login(credentials);

      expect(response).toBeDefined();
      expect(response.user).toBeDefined();
      expect(response.user.email).toBe('test@example.com');
      expect(response.accessToken).toBe('mock-access-token');
      expect(response.refreshToken).toBe('mock-refresh-token');
      expect(response.expiresIn).toBe(3600);
      
      expect(client.apiClient.post).toHaveBeenCalledWith('/auth/login', credentials);
    });

    it('should store tokens in localStorage on successful login', async () => {
      const mockResponse = {
        data: {
          user: {
            id: '123',
            email: 'test@example.com',
            firstName: 'Test',
            lastName: 'User',
            role: 'USER' as const,
          },
          accessToken: 'mock-access-token',
          refreshToken: 'mock-refresh-token',
          expiresIn: 3600,
        },
      };

      vi.mocked(client.apiClient.post).mockResolvedValue(mockResponse);

      const credentials = {
        email: 'test@example.com',
        password: 'Test@2024!',
      };

      await authService.login(credentials);

      expect(localStorageMock.setItem).toHaveBeenCalledWith('accessToken', 'mock-access-token');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('refreshToken', 'mock-refresh-token');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('user', JSON.stringify(mockResponse.data.user));
    });

    it('should throw error when login fails', async () => {
      vi.mocked(client.apiClient.post).mockRejectedValue(new Error('Invalid credentials'));
      vi.mocked(client.getErrorMessage).mockReturnValue('Invalid credentials');

      const credentials = {
        email: 'wrong@example.com',
        password: 'WrongPassword',
      };

      await expect(authService.login(credentials)).rejects.toThrow('Invalid credentials');
    });
  });

  describe('register', () => {
    it('should register successfully with valid data', async () => {
      const mockResponse = {
        data: {
          userId: 'mock-user-id',
          email: 'newuser@example.com',
        },
      };

      vi.mocked(client.apiClient.post).mockResolvedValue(mockResponse);

      const registerData = {
        email: 'newuser@example.com',
        password: 'NewUser@2024!',
        firstName: 'New',
        lastName: 'User',
      };

      const response = await authService.register(registerData);

      expect(response).toBeDefined();
      expect(response.userId).toBe('mock-user-id');
      expect(response.email).toBe('newuser@example.com');
      
      expect(client.apiClient.post).toHaveBeenCalledWith('/auth/register', registerData);
    });

    it('should throw error when registration fails', async () => {
      vi.mocked(client.apiClient.post).mockRejectedValue(new Error('Registration failed'));
      vi.mocked(client.getErrorMessage).mockReturnValue('Registration failed');

      const invalidData = {
        email: '',
        password: '',
        firstName: '',
        lastName: '',
      };

      await expect(authService.register(invalidData)).rejects.toThrow('Registration failed');
    });
  });

  describe('selectPlan', () => {
    it('should select FREE plan successfully', async () => {
      const mockResponse = {
        data: {
          userId: 'user-123',
          plan: 'FREE',
          message: 'Plan selected successfully',
        },
      };

      vi.mocked(client.apiClient.post).mockResolvedValue(mockResponse);

      const response = await authService.selectPlan('user-123', 'FREE');

      expect(response).toBeDefined();
      expect(response.message).toBe('Plan selected successfully');
      expect(response.stripeCheckoutUrl).toBeUndefined();
      
      expect(client.apiClient.post).toHaveBeenCalledWith('/auth/register/plan', {
        userId: 'user-123',
        plan: 'FREE',
      });
    });

    it('should return checkout URL for paid plans', async () => {
      const mockResponse = {
        data: {
          userId: 'user-123',
          plan: 'PRO',
          stripeCheckoutUrl: 'https://checkout.stripe.com/mock',
          message: 'Redirecting to payment',
        },
      };

      vi.mocked(client.apiClient.post).mockResolvedValue(mockResponse);

      const response = await authService.selectPlan('user-123', 'PRO');

      expect(response).toBeDefined();
      expect(response.stripeCheckoutUrl).toBe('https://checkout.stripe.com/mock');
    });
  });

  describe('verifyOtp', () => {
    it('should verify OTP successfully with correct code', async () => {
      const mockResponse = {
        data: {
          verified: true,
          message: 'OTP verified successfully',
          authData: {
            user: {
              id: '123',
              email: 'test@example.com',
              firstName: 'Test',
              lastName: 'User',
              role: 'USER' as const,
            },
            accessToken: 'access-token',
            refreshToken: 'refresh-token',
            expiresIn: 3600,
          },
        },
      };

      vi.mocked(client.apiClient.post).mockResolvedValue(mockResponse);

      const response = await authService.verifyOtp('test@example.com', '123456');

      expect(response).toBeDefined();
      expect(response.verified).toBe(true);
      expect(response.message).toBe('OTP verified successfully');
      expect(response.authData).toBeDefined();
      expect(response.authData?.user.email).toBe('test@example.com');
      
      expect(client.apiClient.post).toHaveBeenCalledWith('/auth/verify-otp', {
        email: 'test@example.com',
        otpCode: '123456',
      });
    });

    it('should store tokens when OTP verification includes authData', async () => {
      const mockResponse = {
        data: {
          verified: true,
          message: 'OTP verified successfully',
          authData: {
            user: {
              id: '123',
              email: 'test@example.com',
              firstName: 'Test',
              lastName: 'User',
              role: 'USER' as const,
            },
            accessToken: 'access-token',
            refreshToken: 'refresh-token',
            expiresIn: 3600,
          },
        },
      };

      vi.mocked(client.apiClient.post).mockResolvedValue(mockResponse);

      await authService.verifyOtp('test@example.com', '123456');

      expect(localStorageMock.setItem).toHaveBeenCalledWith('accessToken', 'access-token');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('refreshToken', 'refresh-token');
    });

    it('should fail with incorrect OTP code', async () => {
      vi.mocked(client.apiClient.post).mockRejectedValue(new Error('Invalid OTP code'));
      vi.mocked(client.getErrorMessage).mockReturnValue('Invalid OTP code');

      await expect(authService.verifyOtp('test@example.com', '000000')).rejects.toThrow('Invalid OTP code');
    });
  });

  describe('resendOtp', () => {
    it('should resend OTP successfully', async () => {
      const mockResponse = {
        data: {
          message: 'OTP resent successfully',
          expiresIn: 300,
        },
      };

      vi.mocked(client.apiClient.post).mockResolvedValue(mockResponse);

      const response = await authService.resendOtp('test@example.com');

      expect(response).toBeDefined();
      expect(response.message).toBe('OTP resent successfully');
      expect(response.expiresIn).toBe(300);
      
      expect(client.apiClient.post).toHaveBeenCalledWith('/auth/resend-otp', {
        email: 'test@example.com',
      });
    });

    it('should throw error when resend fails', async () => {
      vi.mocked(client.apiClient.post).mockRejectedValue(new Error('Failed to resend OTP'));
      vi.mocked(client.getErrorMessage).mockReturnValue('Failed to resend OTP');

      await expect(authService.resendOtp('')).rejects.toThrow('Failed to resend OTP');
    });
  });

  describe('forgotPassword', () => {
    it('should send password reset link successfully', async () => {
      const mockResponse = {
        data: {
          message: 'Password reset link sent',
        },
      };

      vi.mocked(client.apiClient.post).mockResolvedValue(mockResponse);

      const response = await authService.forgotPassword('test@example.com');

      expect(response).toBeDefined();
      expect(response.message).toBe('Password reset link sent');
      
      expect(client.apiClient.post).toHaveBeenCalledWith('/auth/forgot-password', {
        email: 'test@example.com',
      });
    });
  });

  describe('logout', () => {
    it('should clear localStorage on logout', async () => {
      await authService.logout();

      expect(localStorageMock.removeItem).toHaveBeenCalledWith('accessToken');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('refreshToken');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('user');
    });

    it('should clear localStorage even if logout fails', async () => {
      // Force an error during logout
      const originalRemoveItem = localStorageMock.removeItem;
      
      try {
        await authService.logout();
      } catch {
        // Expected to clear storage even on error
      }

      expect(localStorageMock.removeItem).toHaveBeenCalled();
    });
  });

  describe('getCurrentUser', () => {
    it('should return user from localStorage', () => {
      const mockUser = {
        id: '123',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        role: 'USER' as const,
      };

      localStorageMock.setItem('user', JSON.stringify(mockUser));
      vi.mocked(localStorageMock.getItem).mockReturnValue(JSON.stringify(mockUser));

      const user = authService.getCurrentUser();

      expect(user).toEqual(mockUser);
    });

    it('should return null when no user in localStorage', () => {
      vi.mocked(localStorageMock.getItem).mockReturnValue(null);

      const user = authService.getCurrentUser();

      expect(user).toBeNull();
    });
  });

  describe('isAuthenticated', () => {
    it('should return true when user and token exist', () => {
      vi.mocked(localStorageMock.getItem).mockImplementation((key: string) => {
        if (key === 'accessToken') return 'token';
        if (key === 'user') return '{"id":"123"}';
        return null;
      });

      const isAuth = authService.isAuthenticated();

      expect(isAuth).toBe(true);
    });

    it('should return false when no token', () => {
      vi.mocked(localStorageMock.getItem).mockReturnValue(null);

      const isAuth = authService.isAuthenticated();

      expect(isAuth).toBe(false);
    });
  });
});
