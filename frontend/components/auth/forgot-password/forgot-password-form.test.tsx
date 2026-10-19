import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ForgotPasswordForm } from './forgot-password-form';
import * as authService from '@/lib/api/auth-service';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

// Mock dependencies
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('@/lib/api/auth-service', () => ({
  authService: {
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
  },
}));

// Real French constants (importActual avoids the vi.mock hoisting trap) - every French toast/label
// asserted here is byte-identical to the constants, so the suite stays green and drift-proof.
vi.mock('@/lib/store/preferences-store', async () => {
  const { CONSTANTS_EN } = await vi.importActual<typeof import('@/lib/constants_en')>('@/lib/constants_en');
  return {
    usePreferencesStore: () => ({ t: CONSTANTS_EN }),
  };
});

describe('ForgotPasswordForm', () => {
  const mockRouter = {
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useRouter).mockReturnValue(mockRouter as unknown as ReturnType<typeof useRouter>);
  });

  describe('Request Reset Form', () => {
    it('should render email input initially', () => {
      render(<ForgotPasswordForm />);

      expect(screen.getByRole('heading', { name: /Forgot password/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Send the code/i })).toBeInTheDocument();
    });

    it('should require email input', () => {
      render(<ForgotPasswordForm />);

      const emailInput = screen.getByLabelText(/Email/i);
      expect(emailInput).toHaveAttribute('required');
    });

    it('should send reset request with valid email', async () => {
      vi.mocked(authService.authService.forgotPassword).mockResolvedValue({
        message: 'Email sent',
      });

      render(<ForgotPasswordForm />);

      const emailInput = screen.getByLabelText(/Email/i);
      const submitButton = screen.getByRole('button', { name: /Send the code/i });

      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(authService.authService.forgotPassword).toHaveBeenCalledWith('test@example.com');
        expect(toast.success).toHaveBeenCalledWith('Code sent', {
          description: 'Check your inbox',
        });
      });
    });

    it('should show error when forgot password fails', async () => {
      vi.mocked(authService.authService.forgotPassword).mockRejectedValue(
        new Error('Email not found')
      );

      render(<ForgotPasswordForm />);

      const emailInput = screen.getByLabelText(/Email/i);
      const submitButton = screen.getByRole('button', { name: /Send the code/i });

      fireEvent.change(emailInput, { target: { value: 'unknown@example.com' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });
    });

    it('should disable button while loading', async () => {
      vi.mocked(authService.authService.forgotPassword).mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );

      render(<ForgotPasswordForm />);

      const emailInput = screen.getByLabelText(/Email/i);
      const submitButton = screen.getByRole('button', { name: /Send the code/i });

      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.click(submitButton);

      expect(submitButton).toBeDisabled();
      expect(submitButton).toHaveTextContent('Sending…');
    });
  });

  describe('Reset Password Form (After OTP sent)', () => {
    beforeEach(async () => {
      vi.mocked(authService.authService.forgotPassword).mockResolvedValue({
        message: 'Email sent',
      });

      render(<ForgotPasswordForm />);

      const emailInput = screen.getByLabelText(/Email/i);
      const submitButton = screen.getByRole('button', { name: /Send the code/i });

      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/Code sent!/i)).toBeInTheDocument();
      });
    });

    it('should render reset password form after sending OTP', () => {
      expect(screen.getByLabelText(/Verification code/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/New password/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Confirm password/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Reset password/i })).toBeInTheDocument();
    });

    it('should require all reset password fields', () => {
      const otpInput = screen.getByLabelText(/Verification code/i);
      const passwordInput = screen.getByLabelText(/New password/i);
      const confirmInput = screen.getByLabelText(/Confirm password/i);

      expect(otpInput).toHaveAttribute('required');
      expect(passwordInput).toHaveAttribute('required');
      expect(confirmInput).toHaveAttribute('required');
    });

    it('should show error when OTP is invalid format', async () => {
      const otpInput = screen.getByLabelText(/Verification code/i);
      const passwordInput = screen.getByLabelText(/New password/i);
      const confirmInput = screen.getByLabelText(/Confirm password/i);
      const submitButton = screen.getByRole('button', { name: /Reset password/i });

      fireEvent.change(otpInput, { target: { value: '123' } }); // Too short
      fireEvent.change(passwordInput, { target: { value: 'NewPass@2024!' } });
      fireEvent.change(confirmInput, { target: { value: 'NewPass@2024!' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Error', {
          description: 'The OTP code must be 6 digits',
        });
      });
    });

    it('should show error when passwords do not match', async () => {
      const otpInput = screen.getByLabelText(/Verification code/i);
      const passwordInput = screen.getByLabelText(/New password/i);
      const confirmInput = screen.getByLabelText(/Confirm password/i);
      const submitButton = screen.getByRole('button', { name: /Reset password/i });

      fireEvent.change(otpInput, { target: { value: '123456' } });
      fireEvent.change(passwordInput, { target: { value: 'NewPass@2024!' } });
      fireEvent.change(confirmInput, { target: { value: 'DifferentPass@2024!' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Error', {
          description: "Passwords do not match",
        });
      });
    });

    it('should show error when password is too short', async () => {
      const otpInput = screen.getByLabelText(/Verification code/i);
      const passwordInput = screen.getByLabelText(/New password/i);
      const confirmInput = screen.getByLabelText(/Confirm password/i);
      const submitButton = screen.getByRole('button', { name: /Reset password/i });

      fireEvent.change(otpInput, { target: { value: '123456' } });
      fireEvent.change(passwordInput, { target: { value: 'Short1!' } }); // < 8 chars
      fireEvent.change(confirmInput, { target: { value: 'Short1!' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Error', {
          description: 'Password must be at least 8 characters',
        });
      });
    });

    it('should successfully reset password with valid data', async () => {
      vi.mocked(authService.authService.resetPassword).mockResolvedValue({
        message: 'Password reset successfully',
      });

      const otpInput = screen.getByLabelText(/Verification code/i);
      const passwordInput = screen.getByLabelText(/New password/i);
      const confirmInput = screen.getByLabelText(/Confirm password/i);
      const submitButton = screen.getByRole('button', { name: /Reset password/i });

      fireEvent.change(otpInput, { target: { value: '123456' } });
      fireEvent.change(passwordInput, { target: { value: 'NewPass@2024!' } });
      fireEvent.change(confirmInput, { target: { value: 'NewPass@2024!' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(authService.authService.resetPassword).toHaveBeenCalledWith(
          'test@example.com',
          '123456',
          'NewPass@2024!'
        );
        expect(toast.success).toHaveBeenCalledWith('Password reset', {
          description: 'You can now sign in',
        });
        expect(mockRouter.push).toHaveBeenCalledWith('/auth/login');
      });
    });

    it('should handle reset password error', async () => {
      vi.mocked(authService.authService.resetPassword).mockRejectedValue(
        new Error('Invalid OTP code')
      );

      const otpInput = screen.getByLabelText(/Verification code/i);
      const passwordInput = screen.getByLabelText(/New password/i);
      const confirmInput = screen.getByLabelText(/Confirm password/i);
      const submitButton = screen.getByRole('button', { name: /Reset password/i });

      fireEvent.change(otpInput, { target: { value: '000000' } });
      fireEvent.change(passwordInput, { target: { value: 'NewPass@2024!' } });
      fireEvent.change(confirmInput, { target: { value: 'NewPass@2024!' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });
    });

    it('should resend OTP code when requested', async () => {
      vi.mocked(authService.authService.forgotPassword).mockResolvedValue({
        message: 'OTP resent',
      });

      const resendButton = screen.getByRole('button', { name: /Resend/i });
      fireEvent.click(resendButton);

      await waitFor(() => {
        expect(authService.authService.forgotPassword).toHaveBeenCalledWith('test@example.com');
        expect(toast.success).toHaveBeenCalledWith('Code resent', {
          description: 'A new code has been sent to your email address',
        });
      });
    });

    it('should only accept numeric input for OTP', () => {
      const otpInput = screen.getByLabelText(/Verification code/i) as HTMLInputElement;

      fireEvent.change(otpInput, { target: { value: 'abc123def' } });
      
      // Should filter out non-numeric characters
      expect(otpInput.value).toBe('123');
    });
  });
});
