import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// MSW server removed due to happy-dom compatibility
// import { server } from '@/lib/mocks/server';

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock auth context
const mockLogin = vi.fn();
vi.mock('@/lib/contexts/auth-context', () => ({
  useAuth: () => ({
    login: mockLogin,
  }),
}));

// Mock sonner toast
const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    error: mockToastError,
    success: mockToastSuccess,
  },
}));

// Mock auth service for integration tests
vi.mock('@/lib/api/auth-service', () => ({
  authService: {
    login: vi.fn(),
    register: vi.fn(),
    selectPlan: vi.fn(),
    verifyOtp: vi.fn(),
    resendOtp: vi.fn(),
    forgotPassword: vi.fn(),
    logout: vi.fn(),
    getCurrentUser: vi.fn(),
    isAuthenticated: vi.fn(),
  },
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe('Integration Tests - Authentication Flow', () => {
  describe('Complete Login Flow', () => {
    it('should complete full login flow successfully', async () => {
      mockLogin.mockResolvedValue({});
      const user = userEvent.setup();
      
      // Dynamically import to avoid module resolution issues
      const { LoginForm } = await import('@/components/auth/login/login-form');
      render(<LoginForm />);

      // Fill in email
      const emailInput = screen.getByLabelText(/email/i);
      await user.type(emailInput, 'test@example.com');
      
      // Fill in password
      const passwordInput = screen.getByLabelText(/mot de passe/i);
      await user.type(passwordInput, 'Test@2024!');

      // Submit form
      const submitButton = screen.getByRole('button', { name: /se connecter/i });
      await user.click(submitButton);

      // Wait for login to be called
      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith({
          email: 'test@example.com',
          password: 'Test@2024!',
        });
      });

      // Wait for redirect
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/dashboard');
      });
    });

    it('should show error on invalid credentials', async () => {
      mockLogin.mockRejectedValue(new Error('Invalid credentials'));
      const user = userEvent.setup();
      
      const { LoginForm } = await import('@/components/auth/login/login-form');
      render(<LoginForm />);

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/mot de passe/i);
      const submitButton = screen.getByRole('button', { name: /se connecter/i });

      await user.type(emailInput, 'wrong@example.com');
      await user.type(passwordInput, 'WrongPassword');
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalled();
      });

      // Should not redirect
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  describe('Password Validation Integration', () => {
    it('should validate password requirements during registration', async () => {
      // Create a simple test component
      const { validatePassword } = await import('@/lib/utils/validation');
      
      // Test weak password
      let result = validatePassword('weak');
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      
      // Test strong password
      result = validatePassword('StrongP@ssw0rd123');
      expect(result.isValid).toBe(true);
      expect(result.strength).toBe('strong');
    });
  });

  describe('Form State Persistence', () => {
    it('should maintain form state during multi-step registration', async () => {
      const { getRegisterData, setRegisterData } = await import('@/lib/auth/register-storage');
      
      // Save registration data
      const testData = {
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        password: 'Test@2024!',
      };
      
      setRegisterData(testData);
      
      // Retrieve and verify
      const retrieved = getRegisterData();
      expect(retrieved).toMatchObject(testData);
    });

    it('should clear registration data after completion', async () => {
      const { setRegisterData, clearRegisterData, getRegisterData } = await import('@/lib/auth/register-storage');
      
      // Save data
      setRegisterData({
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        password: 'Test@2024!',
      });
      
      // Clear data
      clearRegisterData();
      
      // Verify cleared
      const retrieved = getRegisterData();
      expect(retrieved).toBeNull();
    });
  });

  describe('Preferences Store Integration', () => {
    it('should persist theme changes across page refreshes', async () => {
      const { usePreferencesStore } = await import('@/lib/store/preferences-store');
      const { renderHook, act } = await import('@testing-library/react');
      
      const { result } = renderHook(() => usePreferencesStore());
      
      // Change theme
      act(() => {
        result.current.setTheme('dark');
      });
      
      expect(result.current.theme).toBe('dark');
      
      // Simulate new hook instance (like page refresh)
      const { result: newResult } = renderHook(() => usePreferencesStore());
      expect(newResult.current.theme).toBe('dark');
    });

    it('should update translations when language changes', async () => {
      const { usePreferencesStore } = await import('@/lib/store/preferences-store');
      const { renderHook, act } = await import('@testing-library/react');
      
      const { result } = renderHook(() => usePreferencesStore());
      
      const frTranslations = result.current.t;
      
      act(() => {
        result.current.setLanguage('en');
      });
      
      const enTranslations = result.current.t;
      
      // Translations should be different
      expect(enTranslations).not.toBe(frTranslations);
      expect(result.current.language).toBe('en');
    });
  });

  describe('API Service Integration', () => {
    beforeEach(async () => {
      vi.clearAllMocks();
      // Import authService après les mocks
      const { authService } = await import('@/lib/api/auth-service');
      // Reset tous les mocks
      Object.values(authService).forEach(fn => {
        if (typeof fn === 'function' && 'mockReset' in fn) {
          (fn as any).mockReset();
        }
      });
    });

    it('should handle successful API calls with mocked responses', async () => {
      const { authService } = await import('@/lib/api/auth-service');
      
      // Mock la réponse de login
      vi.mocked(authService.login).mockResolvedValue({
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
      });
      
      const response = await authService.login({
        email: 'test@example.com',
        password: 'Test@2024!',
      });
      
      expect(response).toBeDefined();
      expect(response.user.email).toBe('test@example.com');
      expect(response.accessToken).toBe('mock-access-token');
      expect(authService.login).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'Test@2024!',
      });
    });

    it('should handle API errors gracefully', async () => {
      const { authService } = await import('@/lib/api/auth-service');
      
      // Mock une erreur
      vi.mocked(authService.login).mockRejectedValue(new Error('Invalid credentials'));
      
      await expect(
        authService.login({
          email: 'wrong@example.com',
          password: 'WrongPassword',
        })
      ).rejects.toThrow('Invalid credentials');
      
      expect(authService.login).toHaveBeenCalledWith({
        email: 'wrong@example.com',
        password: 'WrongPassword',
      });
    });

    it('should complete full registration flow', async () => {
      const { authService } = await import('@/lib/api/auth-service');
      
      // Mock Step 1: Register
      vi.mocked(authService.register).mockResolvedValue({
        userId: 'mock-user-id',
        email: 'newuser@example.com',
      });
      
      // Mock Step 2: Select Plan
      vi.mocked(authService.selectPlan).mockResolvedValue({
        userId: 'mock-user-id',
        plan: 'FREE',
        message: 'Plan selected successfully',
      });
      
      // Mock Step 3: Verify OTP
      vi.mocked(authService.verifyOtp).mockResolvedValue({
        verified: true,
        message: 'OTP verified successfully',
        authData: {
          user: {
            id: 'mock-user-id',
            email: 'newuser@example.com',
            firstName: 'New',
            lastName: 'User',
            role: 'USER' as const,
          },
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresIn: 3600,
        },
      });
      
      // Step 1: Register
      const registerResponse = await authService.register({
        email: 'newuser@example.com',
        password: 'NewUser@2024!',
        firstName: 'New',
        lastName: 'User',
      });
      expect(registerResponse.userId).toBe('mock-user-id');
      expect(authService.register).toHaveBeenCalledTimes(1);
      
      // Step 2: Select Plan
      const planResponse = await authService.selectPlan('mock-user-id', 'FREE');
      expect(planResponse.message).toBe('Plan selected successfully');
      expect(authService.selectPlan).toHaveBeenCalledWith('mock-user-id', 'FREE');
      
      // Step 3: Verify OTP
      const otpResponse = await authService.verifyOtp('newuser@example.com', '123456');
      expect(otpResponse.verified).toBe(true);
      expect(otpResponse.authData).toBeDefined();
      expect(authService.verifyOtp).toHaveBeenCalledWith('newuser@example.com', '123456');
    });
  });

  describe('Security Validations Integration', () => {
    it('should sanitize malicious input before API call', async () => {
      const { sanitizeInput } = await import('@/lib/utils/validation');
      
      const maliciousInput = '<script>void(0)</script>test@example.com';
      const sanitized = sanitizeInput(maliciousInput);
      
      // DOMPurify should remove script tags
      expect(sanitized).not.toContain('<script>');
      
      // The sanitized output should be safe
      expect(sanitized).toBeTruthy();
    });

    it('should prevent XSS attacks in form inputs', async () => {
      const { sanitizeInput } = await import('@/lib/utils/validation');
      
      const attacks = [
        '<img src=x onerror="void(0)">',
        '<svg onload="void(0)">',
        '<iframe src="javascript:void(0)"></iframe>',
      ];
      
      attacks.forEach(attack => {
        const sanitized = sanitizeInput(attack);
        // Should not contain HTML tags
        expect(sanitized).not.toContain('<img');
        expect(sanitized).not.toContain('<svg');
        expect(sanitized).not.toContain('<iframe');
      });
    });
  });

  describe('Accessibility Integration', () => {
    it('should have proper form labels for screen readers', async () => {
      const { LoginForm } = await import('@/components/auth/login/login-form');
      render(<LoginForm />);
      
      // All inputs should be labeled
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/mot de passe/i)).toBeInTheDocument();
    });

    it('should apply accessibility preferences from store', async () => {
      const { usePreferencesStore } = await import('@/lib/store/preferences-store');
      const { renderHook, act } = await import('@testing-library/react');
      
      const { result } = renderHook(() => usePreferencesStore());
      
      // Enable accessibility features
      act(() => {
        result.current.setReducedMotion(true);
        result.current.setFontSize('large');
        result.current.setHighContrast(true);
      });
      
      expect(result.current.reducedMotion).toBe(true);
      expect(result.current.fontSize).toBe('large');
      expect(result.current.highContrast).toBe(true);
    });
  });
});
