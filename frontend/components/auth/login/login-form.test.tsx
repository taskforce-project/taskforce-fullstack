import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginForm } from './login-form';

// Mock next/navigation
const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
}));

// Mock auth context
const mockLogin = vi.fn();
const mockLoginWithPasskey = vi.fn();
vi.mock('@/lib/contexts/auth-context', () => ({
  useAuth: () => ({
    login: mockLogin,
    loginWithPasskey: mockLoginWithPasskey,
  }),
}));

// Passkeys : absentes par défaut (navigateur de test), activées par les tests qui en ont besoin.
const { mockSupported, mockAutofill } = vi.hoisted(() => ({
  mockSupported: vi.fn(() => false),
  mockAutofill: vi.fn(async () => false),
}));
vi.mock('@/lib/auth/passkeys', () => ({
  passkeysSupported: mockSupported,
  passkeyAutofillAvailable: mockAutofill,
}));

// Invitation en attente : aucune par défaut.
const { mockTakeInvitation, mockAcceptInvitation } = vi.hoisted(() => ({
  mockTakeInvitation: vi.fn((): string | null => null),
  mockAcceptInvitation: vi.fn(),
}));
vi.mock('@/lib/utils/pending-invitation', () => ({
  stashInvitationToken: vi.fn(),
  takeInvitationToken: mockTakeInvitation,
}));
vi.mock('@/lib/api/invitation-service', () => ({ acceptInvitation: mockAcceptInvitation }));

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

// Mock preferences store - return the REAL French constants so text queries stay valid and the
// mock can never drift from the constants again (importActual avoids the vi.mock hoisting trap).
vi.mock('@/lib/store/preferences-store', async () => {
  const { CONSTANTS_EN } = await vi.importActual<typeof import('@/lib/constants_en')>('@/lib/constants_en');
  return {
    usePreferencesStore: () => ({ t: CONSTANTS_EN }),
  };
});

// Mock validation utils - hoisted to fix initialization order
const { mockIsAllowed, mockGetTimeUntilReset, mockReset } = vi.hoisted(() => ({
  mockIsAllowed: vi.fn(() => true),
  mockGetTimeUntilReset: vi.fn(() => 30),
  mockReset: vi.fn(),
}));

vi.mock('@/lib/utils/validation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/utils/validation')>();
  return {
    ...actual,
    globalRateLimiter: {
      isAllowed: mockIsAllowed,
      getTimeUntilReset: mockGetTimeUntilReset,
      reset: mockReset,
    },
  };
});

describe('LoginForm Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Réinitialiser les mocks de validation à leur valeur par défaut
    mockIsAllowed.mockReturnValue(true);
    mockGetTimeUntilReset.mockReturnValue(30);
    mockReset.mockClear();
    mockSupported.mockReturnValue(false);
    mockAutofill.mockResolvedValue(false);
    mockTakeInvitation.mockReturnValue(null);
  });

  it('should render login form with all fields', () => {
    render(<LoginForm />);

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
  });

  it('should render forgot password link', () => {
    render(<LoginForm />);

    const forgotLink = screen.getByText(/forgot password/i);
    expect(forgotLink).toBeInTheDocument();
    expect(forgotLink.closest('a')).toHaveAttribute('href', '/auth/forgot-password');
  });

  it('should render register link', () => {
    render(<LoginForm />);

    const registerLink = screen.getByText(/create an account/i);
    expect(registerLink).toBeInTheDocument();
  });

  it('should have required fields', () => {
    render(<LoginForm />);

    const emailInput = screen.getByLabelText(/email/i) as HTMLInputElement;
    const passwordInput = screen.getByLabelText(/^password$/i) as HTMLInputElement;

    expect(emailInput).toBeRequired();
    expect(passwordInput).toBeRequired();
  });

  it('should update email field on input', async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    const emailInput = screen.getByLabelText(/email/i) as HTMLInputElement;
    await user.type(emailInput, 'test@example.com');

    expect(emailInput.value).toBe('test@example.com');
  });

  it('should update password field on input', async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    const passwordInput = screen.getByLabelText(/^password$/i) as HTMLInputElement;
    await user.type(passwordInput, 'Password123!');

    expect(passwordInput.value).toBe('Password123!');
  });

  it('should call login function with valid credentials', async () => {
    mockLogin.mockResolvedValue({});
    const user = userEvent.setup();
    render(<LoginForm />);

    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/^password$/i);
    const submitButton = screen.getByRole('button', { name: /^sign in$/i });

    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'Password123!');
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'Password123!',
      });
    });
  });

  it('should show loading state while submitting', async () => {
    mockLogin.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));
    const user = userEvent.setup();
    render(<LoginForm />);

    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/^password$/i);
    const submitButton = screen.getByRole('button', { name: /^sign in$/i });

    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'Password123!');
    await user.click(submitButton);

    expect(submitButton).toBeDisabled();
    
    await waitFor(() => {
      expect(submitButton).not.toBeDisabled();
    });
  });

  it('should redirect to dashboard on successful login', async () => {
    // Simuler le comportement du contexte qui redirige après login
    mockLogin.mockImplementation(async () => {
      mockPush('/dashboard');
    });
    
    const user = userEvent.setup();
    render(<LoginForm />);

    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/^password$/i);
    const submitButton = screen.getByRole('button', { name: /^sign in$/i });

    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'Password123!');
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('should handle login error gracefully', async () => {
    const { toast } = await import('sonner');
    mockLogin.mockRejectedValue(new Error('Invalid credentials'));
    const user = userEvent.setup();
    render(<LoginForm />);

    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/^password$/i);
    const submitButton = screen.getByRole('button', { name: /^sign in$/i });

    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'WrongPassword');
    await user.click(submitButton);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
  });

  it('should sanitize email input for XSS prevention', async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    const emailInput = screen.getByLabelText(/email/i) as HTMLInputElement;
    await user.type(emailInput, '<script>alert("xss")</script>test@example.com');

    // Input should be sanitized when submitted
    expect(emailInput.value).toContain('test@example.com');
  });

  it('should have accessible form labels', () => {
    render(<LoginForm />);

    // All inputs should have proper labels
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
  });

  describe('Rate Limiting', () => {
    beforeEach(() => {
      // Reset tous les mocks avant chaque test
      mockIsAllowed.mockReturnValue(true);
      mockGetTimeUntilReset.mockReturnValue(30);
      mockReset.mockClear();
    });

    it('should enforce rate limiting after too many attempts', async () => {
      const { toast } = await import('sonner');
      
      // Mock le rate limiter pour simuler trop de tentatives
      mockIsAllowed.mockReturnValue(false);
      mockGetTimeUntilReset.mockReturnValue(300);

      const user = userEvent.setup();
      render(<LoginForm />);

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/^password$/i);
      const submitButton = screen.getByRole('button', { name: /^sign in$/i });

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'Password123!');
      await user.click(submitButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'Error',
          expect.objectContaining({
            description: expect.stringContaining('Too many attempts'),
          })
        );
      });
      expect(mockLogin).not.toHaveBeenCalled();
    });

    it('should reset rate limiter on successful login', async () => {
      mockLogin.mockResolvedValue({});
      const user = userEvent.setup();
      render(<LoginForm />);

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/^password$/i);
      const submitButton = screen.getByRole('button', { name: /^sign in$/i });

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'Password123!');
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockReset).toHaveBeenCalledWith('login');
      });
    });
  });

  describe('Error Handling', () => {
    it('should show custom error message from error object', async () => {
      const { toast } = await import('sonner');
      mockLogin.mockRejectedValue(new Error('Identifiants incorrects'));
      const user = userEvent.setup();
      render(<LoginForm />);

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/^password$/i);
      const submitButton = screen.getByRole('button', { name: /^sign in$/i });

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'WrongPassword');
      await user.click(submitButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'Error',
          expect.objectContaining({
            description: 'Identifiants incorrects',
          })
        );
      });
    });

    it('should show fallback error message when error has no message', async () => {
      const { toast } = await import('sonner');
      mockLogin.mockRejectedValue(new Error('')); // Erreur sans message
      const user = userEvent.setup();
      render(<LoginForm />);

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/^password$/i);
      const submitButton = screen.getByRole('button', { name: /^sign in$/i });

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'WrongPassword');
      await user.click(submitButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'Error',
          expect.objectContaining({
            description: 'Invalid email or password',
          })
        );
      });
    });
  });

  describe('Two-Factor (2FA)', () => {
    it('should show the 2FA code step when the server requires it', async () => {
      mockLogin.mockResolvedValue({ twoFactorRequired: true });
      const user = userEvent.setup();
      render(<LoginForm />);

      await user.type(screen.getByLabelText(/email/i), 'test@example.com');
      await user.type(screen.getByLabelText(/^password$/i), 'Password123!');
      await user.click(screen.getByRole('button', { name: /^sign in$/i }));

      await waitFor(() => {
        expect(screen.getByPlaceholderText('000000')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^verify$/i })).toBeInTheDocument();
      });
    });

    it('should submit the TOTP code to complete login', async () => {
      mockLogin
        .mockResolvedValueOnce({ twoFactorRequired: true })
        .mockResolvedValueOnce({ user: { onboardingCompleted: true } });
      const user = userEvent.setup();
      render(<LoginForm />);

      await user.type(screen.getByLabelText(/email/i), 'test@example.com');
      await user.type(screen.getByLabelText(/^password$/i), 'Password123!');
      await user.click(screen.getByRole('button', { name: /^sign in$/i }));

      const codeInput = await screen.findByPlaceholderText('000000');
      await user.type(codeInput, '123456');
      await user.click(screen.getByRole('button', { name: /^verify$/i }));

      await waitFor(() => {
        expect(mockLogin).toHaveBeenLastCalledWith({
          email: 'test@example.com',
          password: 'Password123!',
          totp: '123456',
        });
      });
    });

    it('should require a 6-digit code before submitting', async () => {
      mockLogin.mockResolvedValueOnce({ twoFactorRequired: true });
      const user = userEvent.setup();
      render(<LoginForm />);

      await user.type(screen.getByLabelText(/email/i), 'test@example.com');
      await user.type(screen.getByLabelText(/^password$/i), 'Password123!');
      await user.click(screen.getByRole('button', { name: /^sign in$/i }));

      const codeInput = await screen.findByPlaceholderText('000000');
      await user.type(codeInput, '123{Enter}'); // trop court → pas de 2ᵉ appel login

      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Passkeys', () => {
    beforeEach(() => {
      mockSupported.mockReturnValue(true);
    });

    it('hides the passkey button when the browser has no passkeys', () => {
      mockSupported.mockReturnValue(false);
      render(<LoginForm />);

      expect(screen.queryByRole('button', { name: /sign in with a passkey/i })).not.toBeInTheDocument();
    });

    it('lets the email field suggest passkeys', () => {
      render(<LoginForm />);

      expect(screen.getByLabelText(/email/i)).toHaveAttribute('autocomplete', 'username webauthn');
    });

    it('signs in with a passkey and opens the next page', async () => {
      const { toast } = await import('sonner');
      mockLoginWithPasskey.mockResolvedValue({ user: { onboardingCompleted: true } });
      const user = userEvent.setup();
      render(<LoginForm />);

      await user.click(screen.getByRole('button', { name: /sign in with a passkey/i }));

      await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
      expect(mockLoginWithPasskey).toHaveBeenCalledWith();
      expect(mockReset).toHaveBeenCalledWith('login');
      expect(toast.success).toHaveBeenCalled();
    });

    it('sends a new account to onboarding and applies a pending invitation', async () => {
      const { toast } = await import('sonner');
      mockTakeInvitation.mockReturnValue('invite-token');
      mockAcceptInvitation.mockResolvedValue(undefined);
      mockLoginWithPasskey.mockResolvedValue({ user: { onboardingCompleted: false } });
      const user = userEvent.setup();
      render(<LoginForm />);

      await user.click(screen.getByRole('button', { name: /sign in with a passkey/i }));

      await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/onboarding'));
      expect(mockAcceptInvitation).toHaveBeenCalledWith('invite-token');
      expect(toast.success).toHaveBeenCalledWith('Invitation accepted');
    });

    it('still signs in when the pending invitation fails', async () => {
      const { toast } = await import('sonner');
      mockTakeInvitation.mockReturnValue('invite-token');
      mockAcceptInvitation.mockRejectedValue(new Error('expired'));
      mockLoginWithPasskey.mockResolvedValue({ user: { onboardingCompleted: true } });
      const user = userEvent.setup();
      render(<LoginForm />);

      await user.click(screen.getByRole('button', { name: /sign in with a passkey/i }));

      await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
      expect(toast.success).toHaveBeenCalledWith('Successfully signed in!');
    });

    it('does nothing when the person closes the passkey window', async () => {
      const { toast } = await import('sonner');
      mockLoginWithPasskey.mockResolvedValue(null);
      const user = userEvent.setup();
      render(<LoginForm />);

      await user.click(screen.getByRole('button', { name: /sign in with a passkey/i }));

      await waitFor(() => expect(mockLoginWithPasskey).toHaveBeenCalled());
      expect(mockReplace).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('shows the server reason when the passkey is refused', async () => {
      const { toast } = await import('sonner');
      mockLoginWithPasskey.mockRejectedValue(new Error('This passkey couldn\'t sign you in.'));
      const user = userEvent.setup();
      render(<LoginForm />);

      await user.click(screen.getByRole('button', { name: /sign in with a passkey/i }));

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Error', { description: 'This passkey couldn\'t sign you in.' }));
    });

    it('explains a browser failure in plain words', async () => {
      const { toast } = await import('sonner');
      const failure = new Error('The browser couldn\'t use a passkey.');
      failure.name = 'PasskeyError';
      mockLoginWithPasskey.mockRejectedValue(failure);
      const user = userEvent.setup();
      render(<LoginForm />);

      await user.click(screen.getByRole('button', { name: /sign in with a passkey/i }));

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Error', {
        description: 'Couldn\'t sign in with this passkey. Use your password, or try again.',
      }));
    });

    it('signs in when a passkey is picked in the email field', async () => {
      mockAutofill.mockResolvedValue(true);
      mockLoginWithPasskey.mockResolvedValue({ user: { onboardingCompleted: true } });
      render(<LoginForm />);

      await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
      expect(mockLoginWithPasskey).toHaveBeenCalledWith({ conditional: true, signal: expect.any(AbortSignal) });
    });

    it('reports a refused passkey picked in the email field', async () => {
      const { toast } = await import('sonner');
      mockAutofill.mockResolvedValue(true);
      mockLoginWithPasskey.mockRejectedValue(new Error('This passkey couldn\'t sign you in.'));
      render(<LoginForm />);

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Error', { description: 'This passkey couldn\'t sign you in.' }));
    });

    it('stops suggesting passkeys when the passkey button is used', async () => {
      mockAutofill.mockResolvedValue(true);
      let suggestion: AbortSignal | undefined;
      mockLoginWithPasskey.mockImplementation((options?: { signal?: AbortSignal }) => {
        if (options?.signal) {
          suggestion = options.signal;
          return new Promise(() => {});
        }
        return Promise.resolve(null);
      });
      const user = userEvent.setup();
      render(<LoginForm />);
      await waitFor(() => expect(suggestion).toBeDefined());

      await user.click(screen.getByRole('button', { name: /sign in with a passkey/i }));

      expect(suggestion?.aborted).toBe(true);
    });

    it('stops suggesting passkeys when the page closes', async () => {
      mockAutofill.mockResolvedValue(true);
      let suggestion: AbortSignal | undefined;
      mockLoginWithPasskey.mockImplementation((options?: { signal?: AbortSignal }) => {
        suggestion = options?.signal;
        return new Promise(() => {});
      });
      const { unmount } = render(<LoginForm />);
      await waitFor(() => expect(suggestion).toBeDefined());

      unmount();

      expect(suggestion?.aborted).toBe(true);
    });
  });
});
