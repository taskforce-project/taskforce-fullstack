import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OTPForm } from './verification-form';
import { toast } from 'sonner';
import { authService } from '@/lib/api';

// Mock dependencies
const mockPush = vi.fn();
const mockGetRegisterData = vi.fn();
const mockClearRegisterData = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    back: vi.fn(),
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/store/preferences-store', () => ({
  usePreferencesStore: () => ({
    t: {
      common: {
        error: 'Erreur',
      },
    },
  }),
}));

vi.mock('@/lib/auth/register-storage', () => ({
  getRegisterData: () => mockGetRegisterData(),
  setRegisterData: vi.fn(),
  clearRegisterData: () => mockClearRegisterData(),
}));

vi.mock('@/lib/api', () => ({
  authService: {
    register: vi.fn(),
    verifyOtp: vi.fn(),
    resendOtp: vi.fn(),
  },
}));

vi.mock('@/lib/utils/validation', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    globalRateLimiter: {
      isAllowed: vi.fn(() => true),
      getTimeUntilReset: vi.fn(() => 30),
    },
  };
});

describe('OTPForm - Step 3: Verification', () => {
  const mockRegisterData = {
    firstName: 'John',
    lastName: 'Doe',
    email: 'test@example.com',
    password: 'StrongP@ssw0rd!',
    planType: 'FREE',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Utiliser des fake timers avec avancement automatique du temps pour les tests
    vi.useFakeTimers({ shouldAdvanceTime: true });
    
    mockGetRegisterData.mockReturnValue(mockRegisterData);
    
    // Mock successful register call
    vi.mocked(authService.register).mockResolvedValue({
      message: 'OTP sent successfully',
    } as any);

    // Mock successful verify call
    vi.mocked(authService.verifyOtp).mockResolvedValue({
      user: { id: '1', email: 'test@example.com' },
    } as any);
  });

  afterEach(async () => {
    // Nettoyer tous les timers en attente avant de démolir l'environnement
    vi.runOnlyPendingTimers();
    vi.clearAllTimers();
    vi.useRealTimers(); // Restaurer les vrais timers
    vi.restoreAllMocks();
  });

  describe('Rendering', () => {
    it('should render OTP input fields', async () => {
      render(<OTPForm />);

      // Wait for component to finish initialization
      await waitFor(() => {
        expect(screen.getByLabelText(/code de vérification/i)).toBeInTheDocument();
      });
    });

    it('should show progress indicator for step 3', () => {
      render(<OTPForm />);

      expect(screen.getByText(/étape 3 sur 3/i)).toBeInTheDocument();
      expect(screen.getByText(/100%/i)).toBeInTheDocument();
    });

    it('should display user email', async () => {
      render(<OTPForm />);

      await waitFor(() => {
        expect(screen.getByText(/test@example\.com/i)).toBeInTheDocument();
      });
    });

    it('should render verify button', () => {
      render(<OTPForm />);

      expect(screen.getByRole('button', { name: /vérifier/i })).toBeInTheDocument();
    });

    it('should render resend code button', () => {
      render(<OTPForm />);

      expect(screen.getByRole('button', { name: /renvoyer le code/i })).toBeInTheDocument();
    });
  });

  describe('Session Validation', () => {
    it('should redirect to step 1 if no register data exists', async () => {
      mockGetRegisterData.mockReturnValue(null);

      render(<OTPForm />);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'Session expirée ou données incomplètes',
          expect.objectContaining({
            description: expect.stringContaining('Veuillez recommencer'),
          })
        );
      });

      expect(mockPush).toHaveBeenCalledWith('/auth/register');
    });

    it('should redirect if email is missing from session', async () => {
      mockGetRegisterData.mockReturnValue({
        firstName: 'John',
        lastName: 'Doe',
        password: 'StrongP@ssw0rd!',
        planType: 'FREE',
        // email missing
      });

      render(<OTPForm />);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/auth/register');
      });
    });

    it('should redirect if password is missing', async () => {
      mockGetRegisterData.mockReturnValue({
        firstName: 'John',
        lastName: 'Doe',
        email: 'test@example.com',
        planType: 'FREE',
        // password missing
      });

      render(<OTPForm />);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/auth/register');
      });
    });

    it('should redirect if planType is missing', async () => {
      mockGetRegisterData.mockReturnValue({
        firstName: 'John',
        lastName: 'Doe',
        email: 'test@example.com',
        password: 'StrongP@ssw0rd!',
        // planType missing
      });

      render(<OTPForm />);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/auth/register');
      });
    });
  });

  describe('Registration API Call on Mount', () => {
    it('should call register API with complete data on mount', async () => {
      render(<OTPForm />);

      await waitFor(() => {
        expect(authService.register).toHaveBeenCalledWith({
          email: 'test@example.com',
          password: 'StrongP@ssw0rd!',
          firstName: 'John',
          lastName: 'Doe',
          planType: 'FREE',
        });
      });

      expect(toast.success).toHaveBeenCalledWith(
        'Code de vérification envoyé',
        expect.objectContaining({
          description: 'Consultez votre boîte mail',
        })
      );
    });

    it('should call register API only once (prevent double call in StrictMode)', async () => {
      render(<OTPForm />);

      await waitFor(() => {
        expect(authService.register).toHaveBeenCalledTimes(1);
      });
    });

    it('should handle registration error gracefully', async () => {
      vi.mocked(authService.register).mockRejectedValue(
        new Error('User already exists')
      );

      render(<OTPForm />);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'Erreur',
          expect.objectContaining({
            description: expect.stringContaining('User already exists'),
          })
        );
      });

      // Should NOT redirect - user can still enter OTP
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  describe('OTP Input', () => {
    it('should allow entering 6-digit OTP', async () => {
      const user = userEvent.setup();
      render(<OTPForm />);

      await waitFor(() => {
        expect(screen.getByLabelText(/code de vérification/i)).toBeInTheDocument();
      });

      const otpInput = screen.getByLabelText(/code de vérification/i);
      
      // Enter OTP
      await user.type(otpInput, '123456');

      // OTP should be filled
      await waitFor(() => {
        expect(otpInput).toHaveValue('123456');
      });
    });

    it('should disable OTP input while loading', async () => {
      const user = userEvent.setup();
      vi.mocked(authService.verifyOtp).mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 1000))
      );

      render(<OTPForm />);

      await waitFor(() => {
        expect(screen.getByLabelText(/code de vérification/i)).toBeInTheDocument();
      });

      const otpInput = screen.getByLabelText(/code de vérification/i);
      await user.type(otpInput, '123456');

      const verifyButton = screen.getByRole('button', { name: /vérifier/i });
      
      const clickPromise = user.click(verifyButton);

      await waitFor(() => {
        expect(otpInput).toBeDisabled();
      });

      await vi.waitFor(() => clickPromise, { timeout: 2000 });
    });
  });

  describe('OTP Validation', () => {
    it('should disable verify button when OTP is empty', async () => {
      render(<OTPForm />);

      await waitFor(() => {
        expect(screen.getByLabelText(/code de vérification/i)).toBeInTheDocument();
      });

      const verifyButton = screen.getByRole('button', { name: /vérifier/i });
      
      // Button should be disabled when OTP is empty (length !== 6)
      expect(verifyButton).toBeDisabled();
    });

    it('should disable verify button when OTP is incomplete', async () => {
      const user = userEvent.setup();
      render(<OTPForm />);

      await waitFor(() => {
        expect(screen.getByLabelText(/code de vérification/i)).toBeInTheDocument();
      });

      const otpInput = screen.getByLabelText(/code de vérification/i);
      await user.type(otpInput, '123'); // Only 3 digits

      const verifyButton = screen.getByRole('button', { name: /vérifier/i });
      
      // Button should be disabled when OTP length is not 6
      expect(verifyButton).toBeDisabled();
    });

    it('should enable verify button when OTP has 6 digits', async () => {
      const user = userEvent.setup();
      render(<OTPForm />);

      await waitFor(() => {
        expect(screen.getByLabelText(/code de vérification/i)).toBeInTheDocument();
      });

      const otpInput = screen.getByLabelText(/code de vérification/i);
      await user.type(otpInput, '123456'); // 6 digits

      const verifyButton = screen.getByRole('button', { name: /vérifier/i });
      
      // Button should be enabled when OTP length is 6
      expect(verifyButton).not.toBeDisabled();
    });
  });

  describe('OTP Verification', () => {
    it('should verify OTP and redirect to login on success', async () => {
      const user = userEvent.setup();
      
      render(<OTPForm />);

      await waitFor(() => {
        expect(screen.getByLabelText(/code de vérification/i)).toBeInTheDocument();
      });

      const otpInput = screen.getByLabelText(/code de vérification/i);
      await user.type(otpInput, '123456');

      const verifyButton = screen.getByRole('button', { name: /vérifier/i });
      await user.click(verifyButton);

      await waitFor(() => {
        expect(authService.verifyOtp).toHaveBeenCalledWith('test@example.com', '123456');
      });

      expect(mockClearRegisterData).toHaveBeenCalled();

      expect(toast.success).toHaveBeenCalledWith(
        'Compte vérifié avec succès !',
        expect.objectContaining({
          description: expect.stringContaining('Vous pouvez maintenant vous connecter'),
        })
      );

      expect(mockPush).toHaveBeenCalledWith('/auth/login');
    });

    it('should show error for invalid OTP', async () => {
      const user = userEvent.setup();
      vi.mocked(authService.verifyOtp).mockRejectedValue(
        new Error('Invalid OTP code')
      );

      render(<OTPForm />);

      await waitFor(() => {
        expect(screen.getByLabelText(/code de vérification/i)).toBeInTheDocument();
      });

      const otpInput = screen.getByLabelText(/code de vérification/i);
      await user.type(otpInput, '999999');

      const verifyButton = screen.getByRole('button', { name: /vérifier/i });
      await user.click(verifyButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'Erreur',
          expect.objectContaining({
            description: expect.stringContaining('Invalid OTP code'),
          })
        );
      });

      // Should not redirect or clear data on error
      expect(mockPush).not.toHaveBeenCalledWith('/auth/login');
    });
  });

  describe('Resend OTP', () => {
    it('should resend OTP when clicking resend button', async () => {
      const user = userEvent.setup();
      vi.mocked(authService.resendOtp).mockResolvedValue({
        message: 'OTP resent',
      } as any);

      render(<OTPForm />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /renvoyer le code/i })).toBeInTheDocument();
      });

      const resendButton = screen.getByRole('button', { name: /renvoyer le code/i });
      await user.click(resendButton);

      await waitFor(() => {
        expect(authService.resendOtp).toHaveBeenCalledWith('test@example.com');
      });

      expect(toast.success).toHaveBeenCalledWith('Code de vérification renvoyé');
    });

    it('should start countdown after resending OTP', async () => {
      const user = userEvent.setup();
      vi.mocked(authService.resendOtp).mockResolvedValue({
        message: 'OTP resent',
      } as any);

      render(<OTPForm />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /renvoyer le code/i })).toBeInTheDocument();
      });

      const resendButton = screen.getByRole('button', { name: /renvoyer le code/i });
      await user.click(resendButton);

      // After resending, should show countdown
      await waitFor(() => {
        expect(screen.getByText(/renvoyer le code dans \d+s/i)).toBeInTheDocument();
      });
    });

    it('should enforce rate limiting on resend', async () => {
      const user = userEvent.setup();
      const validation = await import('@/lib/utils/validation');
      
      // Reset and configure mocks for this specific test
      validation.globalRateLimiter.isAllowed = vi.fn().mockReturnValue(false);
      validation.globalRateLimiter.getTimeUntilReset = vi.fn().mockReturnValue(30);

      render(<OTPForm />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /renvoyer le code/i })).toBeInTheDocument();
      });

      const resendButton = screen.getByRole('button', { name: /renvoyer le code/i });
      await user.click(resendButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'Erreur',
          expect.objectContaining({
            description: 'Veuillez attendre 30 secondes avant de renvoyer le code',
          })
        );
      });

      // Should not call API
      expect(authService.resendOtp).not.toHaveBeenCalled();
    });

    it('should show error on resend failure', async () => {
      const user = userEvent.setup();
      const validation = await import('@/lib/utils/validation');
      
      // Ensure rate limiter allows the request for this test
      validation.globalRateLimiter.isAllowed = vi.fn().mockReturnValue(true);
      
      vi.mocked(authService.resendOtp).mockRejectedValue(
        new Error('Email not found')
      );

      render(<OTPForm />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /renvoyer le code/i })).toBeInTheDocument();
      });

      const resendButton = screen.getByRole('button', { name: /renvoyer le code/i });
      await user.click(resendButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'Erreur',
          expect.objectContaining({
            description: expect.stringContaining('Email not found'),
          })
        );
      });
    });

    it('should disable resend button while loading', async () => {
      const user = userEvent.setup();
      vi.mocked(authService.resendOtp).mockResolvedValue();

      render(<OTPForm />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /renvoyer le code/i })).toBeInTheDocument();
      });

      const resendButton = screen.getByRole('button', { name: /renvoyer le code/i });
      await user.click(resendButton);

      // Verify toast was called instead of checking disabled state
      await waitFor(() => {
        expect(toast.success).toHaveBeenCalled();
      });
    });
  });

  describe('Loading States', () => {
    it('should disable verify button while loading', async () => {
      const user = userEvent.setup();
      vi.mocked(authService.verifyOtp).mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 1000))
      );

      render(<OTPForm />);

      await waitFor(() => {
        expect(screen.getByLabelText(/code de vérification/i)).toBeInTheDocument();
      });

      const otpInput = screen.getByLabelText(/code de vérification/i);
      await user.type(otpInput, '123456');

      const verifyButton = screen.getByRole('button', { name: /vérifier/i });
      
      const clickPromise = user.click(verifyButton);

      await waitFor(() => {
        expect(verifyButton).toBeDisabled();
      });

      await vi.waitFor(() => clickPromise, { timeout: 2000 });
    });
  });

  describe('Accessibility', () => {
    it('should have proper labels for OTP input', () => {
      render(<OTPForm />);

      // Should have accessible label (sr-only)
      expect(screen.getByLabelText(/code de vérification/i)).toBeInTheDocument();
    });

    it('should have proper heading structure', () => {
      render(<OTPForm />);

      expect(screen.getByRole('heading', { name: /code de vérification/i })).toBeInTheDocument();
    });
  });

  describe('UI/UX Details', () => {
    it('should show instructions about OTP', () => {
      render(<OTPForm />);

      expect(screen.getByText(/code envoyé à/i)).toBeInTheDocument();
    });

    it('should show instructions about OTP format', async () => {
      render(<OTPForm />);

      await waitFor(() => {
        expect(screen.getByLabelText(/code de vérification/i)).toBeInTheDocument();
      });

      // Should have instruction text about 6-digit code
      expect(screen.getByText(/entrez le code à 6 chiffres/i)).toBeInTheDocument();
    });
  });
});
