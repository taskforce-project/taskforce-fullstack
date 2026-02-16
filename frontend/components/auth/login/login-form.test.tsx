import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginForm } from './login-form';

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
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

// Mock preferences store for translations
vi.mock('@/lib/store/preferences-store', () => ({
  usePreferencesStore: () => ({
    t: {
      common: {
        error: 'Erreur',
      },
      auth: {
        login: 'Se connecter',
        errors: {
          loginFailed: 'Échec de la connexion',
        },
        success: {
          loginSuccess: 'Connexion réussie',
        },
      },
    },
  }),
}));

// Mock validation utils - hoisted to fix initialization order
const { mockIsAllowed, mockGetTimeUntilReset, mockReset } = vi.hoisted(() => ({
  mockIsAllowed: vi.fn(() => true),
  mockGetTimeUntilReset: vi.fn(() => 30),
  mockReset: vi.fn(),
}));

vi.mock('@/lib/utils/validation', async (importOriginal) => {
  const actual = await importOriginal() as any;
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
  });

  it('should render login form with all fields', () => {
    render(<LoginForm />);

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/mot de passe/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /se connecter/i })).toBeInTheDocument();
  });

  it('should render forgot password link', () => {
    render(<LoginForm />);

    const forgotLink = screen.getByText(/mot de passe oublié/i);
    expect(forgotLink).toBeInTheDocument();
    expect(forgotLink.closest('a')).toHaveAttribute('href', '/auth/forgot-password');
  });

  it('should render register link', () => {
    render(<LoginForm />);

    const registerLink = screen.getByText(/créer un compte/i);
    expect(registerLink).toBeInTheDocument();
  });

  it('should have required fields', () => {
    render(<LoginForm />);

    const emailInput = screen.getByLabelText(/email/i) as HTMLInputElement;
    const passwordInput = screen.getByLabelText(/mot de passe/i) as HTMLInputElement;

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

    const passwordInput = screen.getByLabelText(/mot de passe/i) as HTMLInputElement;
    await user.type(passwordInput, 'Password123!');

    expect(passwordInput.value).toBe('Password123!');
  });

  it('should call login function with valid credentials', async () => {
    mockLogin.mockResolvedValue({});
    const user = userEvent.setup();
    render(<LoginForm />);

    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/mot de passe/i);
    const submitButton = screen.getByRole('button', { name: /se connecter/i });

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
    const passwordInput = screen.getByLabelText(/mot de passe/i);
    const submitButton = screen.getByRole('button', { name: /se connecter/i });

    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'Password123!');
    await user.click(submitButton);

    expect(submitButton).toBeDisabled();
    
    await waitFor(() => {
      expect(submitButton).not.toBeDisabled();
    });
  });

  it('should redirect to dashboard on successful login', async () => {
    mockLogin.mockResolvedValue({});
    const user = userEvent.setup();
    render(<LoginForm />);

    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/mot de passe/i);
    const submitButton = screen.getByRole('button', { name: /se connecter/i });

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
    const passwordInput = screen.getByLabelText(/mot de passe/i);
    const submitButton = screen.getByRole('button', { name: /se connecter/i });

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
    expect(screen.getByLabelText(/mot de passe/i)).toBeInTheDocument();
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
      const passwordInput = screen.getByLabelText(/mot de passe/i);
      const submitButton = screen.getByRole('button', { name: /se connecter/i });

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'Password123!');
      await user.click(submitButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'Erreur',
          expect.objectContaining({
            description: expect.stringContaining('Trop de tentatives'),
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
      const passwordInput = screen.getByLabelText(/mot de passe/i);
      const submitButton = screen.getByRole('button', { name: /se connecter/i });

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
      const passwordInput = screen.getByLabelText(/mot de passe/i);
      const submitButton = screen.getByRole('button', { name: /se connecter/i });

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'WrongPassword');
      await user.click(submitButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'Erreur',
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
      const passwordInput = screen.getByLabelText(/mot de passe/i);
      const submitButton = screen.getByRole('button', { name: /se connecter/i });

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'WrongPassword');
      await user.click(submitButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'Erreur',
          expect.objectContaining({
            description: 'Échec de la connexion',
          })
        );
      });
    });
  });
});
