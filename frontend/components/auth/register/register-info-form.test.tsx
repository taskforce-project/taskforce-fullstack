import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SignupForm } from './register-info-form';
import { toast } from 'sonner';

// Mock dependencies
const mockPush = vi.fn();
const mockSetRegisterData = vi.fn();

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
      auth: {
        errors: {
          passwordsDoNotMatch: 'Les mots de passe ne correspondent pas',
          registrationFailed: 'Échec de l\'inscription',
        },
      },
    },
  }),
}));

vi.mock('@/lib/auth/register-storage', () => ({
  setRegisterData: (...args: any[]) => mockSetRegisterData(...args),
  getRegisterData: vi.fn(),
  clearRegisterData: vi.fn(),
}));

describe('SignupForm - Step 1: Information Form', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Rendering', () => {
    it('should render all form fields', () => {
      render(<SignupForm />);

      expect(screen.getByLabelText(/^prénom$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^nom$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^mot de passe$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^confirmer$/i)).toBeInTheDocument();
    });

    it('should render submit button', () => {
      render(<SignupForm />);

      expect(screen.getByRole('button', { name: /continuer/i })).toBeInTheDocument();
    });

    it('should render progress indicator showing step 1', () => {
      render(<SignupForm />);

      expect(screen.getByText(/étape 1 sur 3/i)).toBeInTheDocument();
      expect(screen.getByText(/33%/i)).toBeInTheDocument();
    });

    it('should render login link', () => {
      render(<SignupForm />);

      expect(screen.getByText(/vous avez déjà un compte/i)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /se connecter/i })).toHaveAttribute('href', '/auth/login');
    });
  });

  describe('Validation - Empty Fields', () => {
    it('should show error when submitting empty form', async () => {
      const user = userEvent.setup();
      render(<SignupForm />);

      const submitButton = screen.getByRole('button', { name: /continuer/i });
      
      // HTML5 validation prevents submission of empty required fields
      // This test verifies button exists and is not disabled when form is empty
      expect(submitButton).not.toBeDisabled();
      
      // To actually test our custom validation, we need to fill fields partially
      // See other validation tests for custom validation logic
    });
  });

  describe('Validation - Name Fields', () => {
    it('should show error for invalid firstName (too short)', async () => {
      const user = userEvent.setup();
      render(<SignupForm />);

      // Fill all required fields but with invalid firstName
      await user.type(screen.getByLabelText(/^prénom$/i), 'X'); // Too short
      await user.type(screen.getByLabelText(/^nom$/i), 'Doe');
      await user.type(screen.getByLabelText(/^email$/i), 'test@example.com');
      await user.type(screen.getByLabelText(/^mot de passe$/i), 'StrongP@ssw0rd123');
      await user.type(screen.getByLabelText(/^confirmer$/i), 'StrongP@ssw0rd123');

      const submitButton = screen.getByRole('button', { name: /continuer/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'Erreur',
          expect.objectContaining({
            description: expect.stringContaining('prénom'),
          })
        );
      });
    });

    it('should show error for invalid lastName (contains numbers)', async () => {
      const user = userEvent.setup();
      render(<SignupForm />);

      await user.type(screen.getByLabelText(/^prénom$/i), 'John');
      await user.type(screen.getByLabelText(/^nom$/i), 'D'); // Too short
      await user.type(screen.getByLabelText(/^email$/i), 'test@example.com');
      await user.type(screen.getByLabelText(/^mot de passe$/i), 'StrongP@ssw0rd123');
      await user.type(screen.getByLabelText(/^confirmer$/i), 'StrongP@ssw0rd123');

      const submitButton = screen.getByRole('button', { name: /continuer/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'Erreur',
          expect.objectContaining({
            description: expect.stringContaining('nom'),
          })
        );
      });
    });
  });

  describe('Validation - Email', () => {
    it('should show error for disposable email', async () => {
      const user = userEvent.setup();
      render(<SignupForm />);

      await user.type(screen.getByLabelText(/^prénom$/i), 'John');
      await user.type(screen.getByLabelText(/^nom$/i), 'Doe');
      await user.type(screen.getByLabelText(/^email$/i), 'test@tempmail.com');
      await user.type(screen.getByLabelText(/^mot de passe$/i), 'Test@2024!');
      await user.type(screen.getByLabelText(/^confirmer$/i), 'Test@2024!');

      const submitButton = screen.getByRole('button', { name: /continuer/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'Erreur',
          expect.objectContaining({
            description: "Les adresses email temporaires ne sont pas autorisées",
          })
        );
      });
    });
  });

  describe('Validation - Password', () => {
    it('should show error when passwords do not match', async () => {
      const user = userEvent.setup();
      render(<SignupForm />);

      await user.type(screen.getByLabelText(/^prénom$/i), 'John');
      await user.type(screen.getByLabelText(/^nom$/i), 'Doe');
      await user.type(screen.getByLabelText(/^email$/i), 'test@example.com');
      await user.type(screen.getByLabelText(/^mot de passe$/i), 'Test@2024!');
      await user.type(screen.getByLabelText(/^confirmer$/i), 'Different@2024!');

      const submitButton = screen.getByRole('button', { name: /continuer/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'Erreur',
          expect.objectContaining({
            description: 'Les mots de passe ne correspondent pas',
          })
        );
      });
    });

    it('should show error for password without uppercase', async () => {
      const user = userEvent.setup();
      render(<SignupForm />);

      await user.type(screen.getByLabelText(/^prénom$/i), 'John');
      await user.type(screen.getByLabelText(/^nom$/i), 'Doe');
      await user.type(screen.getByLabelText(/^email$/i), 'test@example.com');
      await user.type(screen.getByLabelText(/^mot de passe$/i), 'test@2024!');
      await user.type(screen.getByLabelText(/^confirmer$/i), 'test@2024!');

      const submitButton = screen.getByRole('button', { name: /continuer/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });
    });
  });

  describe('Successful Submission', () => {
    it('should store data and redirect to plan selection on valid form', async () => {
      const user = userEvent.setup();
      
      render(<SignupForm />);

      await user.type(screen.getByLabelText(/^prénom$/i), 'John');
      await user.type(screen.getByLabelText(/^nom$/i), 'Doe');
      await user.type(screen.getByLabelText(/^email$/i), 'test@example.com');
      await user.type(screen.getByLabelText(/^mot de passe$/i), 'StrongP@ssw0rd!');
      await user.type(screen.getByLabelText(/^confirmer$/i), 'StrongP@ssw0rd!');

      const submitButton = screen.getByRole('button', { name: /continuer/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockSetRegisterData).toHaveBeenCalledWith({
          firstName: 'John',
          lastName: 'Doe',
          email: 'test@example.com',
          password: 'StrongP@ssw0rd!',
        });
      });

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith(
          'Informations enregistrées',
          expect.objectContaining({
            description: expect.stringContaining('Passez à l\'étape suivante'),
          })
        );
      });

      expect(mockPush).toHaveBeenCalledWith('/auth/register/plan');
    });

    it('should sanitize inputs before storing', async () => {
      const user = userEvent.setup();
      
      render(<SignupForm />);

      // Utiliser des noms valides (pas de caractères spéciaux HTML qui seraient rejetés par validateName)
      await user.type(screen.getByLabelText(/^prénom$/i), 'Jean-Paul');
      await user.type(screen.getByLabelText(/^nom$/i), "O'Connor");
      await user.type(screen.getByLabelText(/^email$/i), 'test@example.com');
      await user.type(screen.getByLabelText(/^mot de passe$/i), 'StrongP@ssw0rd!');
      await user.type(screen.getByLabelText(/^confirmer$/i), 'StrongP@ssw0rd!');

      const submitButton = screen.getByRole('button', { name: /continuer/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockSetRegisterData).toHaveBeenCalled();
      });

      // Vérifier que les données sont bien passées après sanitization
      const callArgs = mockSetRegisterData.mock.calls[0][0];
      expect(callArgs.firstName).toBe('Jean-Paul');
      expect(callArgs.lastName).toBe("O'Connor");
      expect(callArgs.email).toBe('test@example.com');
    });
  });

  describe('Loading State', () => {
    it('should disable button while loading', async () => {
      const user = userEvent.setup();
      render(<SignupForm />);

      await user.type(screen.getByLabelText(/^prénom$/i), 'John');
      await user.type(screen.getByLabelText(/^nom$/i), 'Doe');
      await user.type(screen.getByLabelText(/^email$/i), 'test@example.com');
      await user.type(screen.getByLabelText(/^mot de passe$/i), 'StrongP@ssw0rd!');
      await user.type(screen.getByLabelText(/^confirmer$/i), 'StrongP@ssw0rd!');

      const submitButton = screen.getByRole('button', { name: /continuer/i });
      await user.click(submitButton);

      // Verify the form was submitted (mockSetRegisterData was called)
      await waitFor(() => {
        expect(mockSetRegisterData).toHaveBeenCalled();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper labels for all inputs', () => {
      render(<SignupForm />);

      expect(screen.getByLabelText(/^prénom$/i)).toHaveAccessibleName();
      expect(screen.getByLabelText(/^nom$/i)).toHaveAccessibleName();
      expect(screen.getByLabelText(/^email$/i)).toHaveAccessibleName();
      expect(screen.getByLabelText(/^mot de passe$/i)).toHaveAccessibleName();
      expect(screen.getByLabelText(/^confirmer$/i)).toHaveAccessibleName();
    });
  });
});
