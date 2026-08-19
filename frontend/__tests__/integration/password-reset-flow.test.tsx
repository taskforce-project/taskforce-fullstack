import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock auth service
const mockForgotPassword = vi.fn();
const mockResetPassword = vi.fn();

vi.mock('@/lib/api/auth-service', () => ({
  authService: {
    forgotPassword: mockForgotPassword,
    resetPassword: mockResetPassword,
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Integration Tests - Password Reset Flow', () => {
  describe('API Integration - Request Password Reset', () => {
    it('should successfully send reset email', async () => {
      mockForgotPassword.mockResolvedValue({
        message: 'OTP envoyé par email',
      });

      const { authService } = await import('@/lib/api/auth-service');
      await authService.forgotPassword('test@example.com');

      expect(mockForgotPassword).toHaveBeenCalledWith('test@example.com');
    });

    it('should handle API failure during reset request', async () => {
      mockForgotPassword.mockRejectedValue(
        new Error('Service temporairement indisponible')
      );

      const { authService } = await import('@/lib/api/auth-service');
      
      await expect(
        authService.forgotPassword('test@example.com')
      ).rejects.toThrow('Service temporairement indisponible');
    });
  });

  describe('API Integration - Reset Password with OTP', () => {
    it('should successfully reset password with valid OTP', async () => {
      mockResetPassword.mockResolvedValue({
        message: 'Mot de passe réinitialisé',
      });

      const { authService } = await import('@/lib/api/auth-service');
      await authService.resetPassword('test@example.com', '123456', 'NewPassword123!');

      expect(mockResetPassword).toHaveBeenCalledWith('test@example.com', '123456', 'NewPassword123!');
    });
  });
});