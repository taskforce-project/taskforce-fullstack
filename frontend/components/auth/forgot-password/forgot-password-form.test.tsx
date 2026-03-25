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

vi.mock('@/lib/store/preferences-store', () => ({
  usePreferencesStore: () => ({
    t: {
      common: {
        error: 'Erreur',
      },
      auth: {
        errors: {
          passwordsDoNotMatch: 'Les mots de passe ne correspondent pas',
          passwordTooShort: 'Le mot de passe doit contenir au moins 8 caractères',
        },
      },
    },
  }),
}));

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

      expect(screen.getByRole('heading', { name: /Mot de passe oublié/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Envoyer le code/i })).toBeInTheDocument();
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
      const submitButton = screen.getByRole('button', { name: /Envoyer le code/i });

      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(authService.authService.forgotPassword).toHaveBeenCalledWith('test@example.com');
        expect(toast.success).toHaveBeenCalledWith('Code envoyé', {
          description: 'Vérifiez votre boîte de réception',
        });
      });
    });

    it('should show error when forgot password fails', async () => {
      vi.mocked(authService.authService.forgotPassword).mockRejectedValue(
        new Error('Email not found')
      );

      render(<ForgotPasswordForm />);

      const emailInput = screen.getByLabelText(/Email/i);
      const submitButton = screen.getByRole('button', { name: /Envoyer le code/i });

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
      const submitButton = screen.getByRole('button', { name: /Envoyer le code/i });

      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.click(submitButton);

      expect(submitButton).toBeDisabled();
      expect(submitButton).toHaveTextContent('Envoi...');
    });
  });

  describe('Reset Password Form (After OTP sent)', () => {
    beforeEach(async () => {
      vi.mocked(authService.authService.forgotPassword).mockResolvedValue({
        message: 'Email sent',
      });

      render(<ForgotPasswordForm />);

      const emailInput = screen.getByLabelText(/Email/i);
      const submitButton = screen.getByRole('button', { name: /Envoyer le code/i });

      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/Code envoyé !/i)).toBeInTheDocument();
      });
    });

    it('should render reset password form after sending OTP', () => {
      expect(screen.getByLabelText(/Code de vérification/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Nouveau mot de passe/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Confirmer le mot de passe/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Réinitialiser le mot de passe/i })).toBeInTheDocument();
    });

    it('should require all reset password fields', () => {
      const otpInput = screen.getByLabelText(/Code de vérification/i);
      const passwordInput = screen.getByLabelText(/Nouveau mot de passe/i);
      const confirmInput = screen.getByLabelText(/Confirmer le mot de passe/i);

      expect(otpInput).toHaveAttribute('required');
      expect(passwordInput).toHaveAttribute('required');
      expect(confirmInput).toHaveAttribute('required');
    });

    it('should show error when OTP is invalid format', async () => {
      const otpInput = screen.getByLabelText(/Code de vérification/i);
      const passwordInput = screen.getByLabelText(/Nouveau mot de passe/i);
      const confirmInput = screen.getByLabelText(/Confirmer le mot de passe/i);
      const submitButton = screen.getByRole('button', { name: /Réinitialiser le mot de passe/i });

      fireEvent.change(otpInput, { target: { value: '123' } }); // Too short
      fireEvent.change(passwordInput, { target: { value: 'NewPass@2024!' } });
      fireEvent.change(confirmInput, { target: { value: 'NewPass@2024!' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Erreur', {
          description: 'Le code OTP doit contenir 6 chiffres',
        });
      });
    });

    it('should show error when passwords do not match', async () => {
      const otpInput = screen.getByLabelText(/Code de vérification/i);
      const passwordInput = screen.getByLabelText(/Nouveau mot de passe/i);
      const confirmInput = screen.getByLabelText(/Confirmer le mot de passe/i);
      const submitButton = screen.getByRole('button', { name: /Réinitialiser le mot de passe/i });

      fireEvent.change(otpInput, { target: { value: '123456' } });
      fireEvent.change(passwordInput, { target: { value: 'NewPass@2024!' } });
      fireEvent.change(confirmInput, { target: { value: 'DifferentPass@2024!' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Erreur', {
          description: 'Les mots de passe ne correspondent pas',
        });
      });
    });

    it('should show error when password is too short', async () => {
      const otpInput = screen.getByLabelText(/Code de vérification/i);
      const passwordInput = screen.getByLabelText(/Nouveau mot de passe/i);
      const confirmInput = screen.getByLabelText(/Confirmer le mot de passe/i);
      const submitButton = screen.getByRole('button', { name: /Réinitialiser le mot de passe/i });

      fireEvent.change(otpInput, { target: { value: '123456' } });
      fireEvent.change(passwordInput, { target: { value: 'Short1!' } }); // < 8 chars
      fireEvent.change(confirmInput, { target: { value: 'Short1!' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Erreur', {
          description: 'Le mot de passe doit contenir au moins 8 caractères',
        });
      });
    });

    it('should successfully reset password with valid data', async () => {
      vi.mocked(authService.authService.resetPassword).mockResolvedValue({
        message: 'Password reset successfully',
      });

      const otpInput = screen.getByLabelText(/Code de vérification/i);
      const passwordInput = screen.getByLabelText(/Nouveau mot de passe/i);
      const confirmInput = screen.getByLabelText(/Confirmer le mot de passe/i);
      const submitButton = screen.getByRole('button', { name: /Réinitialiser le mot de passe/i });

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
        expect(toast.success).toHaveBeenCalledWith('Mot de passe réinitialisé', {
          description: 'Vous pouvez maintenant vous connecter avec votre nouveau mot de passe',
        });
        expect(mockRouter.push).toHaveBeenCalledWith('/auth/login');
      });
    });

    it('should handle reset password error', async () => {
      vi.mocked(authService.authService.resetPassword).mockRejectedValue(
        new Error('Invalid OTP code')
      );

      const otpInput = screen.getByLabelText(/Code de vérification/i);
      const passwordInput = screen.getByLabelText(/Nouveau mot de passe/i);
      const confirmInput = screen.getByLabelText(/Confirmer le mot de passe/i);
      const submitButton = screen.getByRole('button', { name: /Réinitialiser le mot de passe/i });

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

      const resendButton = screen.getByRole('button', { name: /Renvoyer/i });
      fireEvent.click(resendButton);

      await waitFor(() => {
        expect(authService.authService.forgotPassword).toHaveBeenCalledWith('test@example.com');
        expect(toast.success).toHaveBeenCalledWith('Code renvoyé', {
          description: 'Un nouveau code a été envoyé à votre adresse email',
        });
      });
    });

    it('should only accept numeric input for OTP', () => {
      const otpInput = screen.getByLabelText(/Code de vérification/i) as HTMLInputElement;

      fireEvent.change(otpInput, { target: { value: 'abc123def' } });
      
      // Should filter out non-numeric characters
      expect(otpInput.value).toBe('123');
    });
  });
});
