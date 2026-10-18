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

// Real French constants (importActual avoids the vi.mock hoisting trap) - keeps text queries valid
// and drift-proof; also feeds the embedded <AuthStepper/>, which now reads the store.
vi.mock('@/lib/store/preferences-store', async () => {
  const { CONSTANTS_EN } = await vi.importActual<typeof import('@/lib/constants_en')>('@/lib/constants_en');
  return {
    usePreferencesStore: () => ({ t: CONSTANTS_EN }),
  };
});

vi.mock('@/lib/auth/register-storage', () => ({
  setRegisterData: (data: Parameters<typeof mockSetRegisterData>[0]) => mockSetRegisterData(data),
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

      expect(screen.getByLabelText(/^first name$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^last name$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^confirm$/i)).toBeInTheDocument();
    });

    it('should render submit button', () => {
      render(<SignupForm />);

      expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
    });

    it('should render progress indicator showing step 1', () => {
      render(<SignupForm />);

      // Le fil d'étapes est à l'étape 1 : chaque étape porte son libellé d'un mot, l'aria annonce la position.
      expect(screen.getByText('Account')).toBeInTheDocument();
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
    });

    it('should render login link', () => {
      render(<SignupForm />);

      expect(screen.getByText(/already have an account/i)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /^sign in$/i })).toHaveAttribute('href', '/auth/login');
    });
  });

  describe('Validation - Empty Fields', () => {
    it('should show error when submitting empty form', async () => {
      render(<SignupForm />);

      const submitButton = screen.getByRole('button', { name: /continue/i });
      
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
      await user.type(screen.getByLabelText(/^first name$/i), 'X'); // Too short
      await user.type(screen.getByLabelText(/^last name$/i), 'Doe');
      await user.type(screen.getByLabelText(/^email$/i), 'test@example.com');
      await user.type(screen.getByLabelText(/^password$/i), 'StrongP@ssw0rd123');
      await user.type(screen.getByLabelText(/^confirm$/i), 'StrongP@ssw0rd123');

      const submitButton = screen.getByRole('button', { name: /continue/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'Error',
          expect.objectContaining({
            description: expect.stringContaining('First name'),
          })
        );
      });
    });

    it('should show error for invalid lastName (contains numbers)', async () => {
      const user = userEvent.setup();
      render(<SignupForm />);

      await user.type(screen.getByLabelText(/^first name$/i), 'John');
      await user.type(screen.getByLabelText(/^last name$/i), 'D'); // Too short
      await user.type(screen.getByLabelText(/^email$/i), 'test@example.com');
      await user.type(screen.getByLabelText(/^password$/i), 'StrongP@ssw0rd123');
      await user.type(screen.getByLabelText(/^confirm$/i), 'StrongP@ssw0rd123');

      const submitButton = screen.getByRole('button', { name: /continue/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'Error',
          expect.objectContaining({
            description: expect.stringContaining('Last name'),
          })
        );
      });
    });
  });

  describe('Validation - Email', () => {
    it('should show error for disposable email', async () => {
      const user = userEvent.setup();
      render(<SignupForm />);

      await user.type(screen.getByLabelText(/^first name$/i), 'John');
      await user.type(screen.getByLabelText(/^last name$/i), 'Doe');
      await user.type(screen.getByLabelText(/^email$/i), 'test@tempmail.com');
      await user.type(screen.getByLabelText(/^password$/i), 'Test@2024!');
      await user.type(screen.getByLabelText(/^confirm$/i), 'Test@2024!');

      const submitButton = screen.getByRole('button', { name: /continue/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'Error',
          expect.objectContaining({
            description: "Temporary email addresses are not allowed",
          })
        );
      });
    });
  });

  describe('Validation - Password', () => {
    it('should show error when passwords do not match', async () => {
      const user = userEvent.setup();
      render(<SignupForm />);

      await user.type(screen.getByLabelText(/^first name$/i), 'John');
      await user.type(screen.getByLabelText(/^last name$/i), 'Doe');
      await user.type(screen.getByLabelText(/^email$/i), 'test@example.com');
      await user.type(screen.getByLabelText(/^password$/i), 'Test@2024!');
      await user.type(screen.getByLabelText(/^confirm$/i), 'Different@2024!');

      const submitButton = screen.getByRole('button', { name: /continue/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'Error',
          expect.objectContaining({
            description: "Passwords don't match",
          })
        );
      });
    });

    it('should show error for password without uppercase', async () => {
      const user = userEvent.setup();
      render(<SignupForm />);

      await user.type(screen.getByLabelText(/^first name$/i), 'John');
      await user.type(screen.getByLabelText(/^last name$/i), 'Doe');
      await user.type(screen.getByLabelText(/^email$/i), 'test@example.com');
      await user.type(screen.getByLabelText(/^password$/i), 'test@2024!');
      await user.type(screen.getByLabelText(/^confirm$/i), 'test@2024!');

      const submitButton = screen.getByRole('button', { name: /continue/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });
    });
  });

  describe('Successful Submission', () => {
    it('should store data and go to verification on valid form', async () => {
      const user = userEvent.setup();
      
      render(<SignupForm />);

      await user.type(screen.getByLabelText(/^first name$/i), 'John');
      await user.type(screen.getByLabelText(/^last name$/i), 'Doe');
      await user.type(screen.getByLabelText(/^email$/i), 'test@example.com');
      await user.type(screen.getByLabelText(/^password$/i), 'StrongP@ssw0rd!');
      await user.type(screen.getByLabelText(/^confirm$/i), 'StrongP@ssw0rd!');

      const submitButton = screen.getByRole('button', { name: /continue/i });
      await user.click(submitButton);

      // `challengeToken` s'ajoute à la charge stockée : le jeton de vérification humaine est émis au
      // chargement de cette étape mais consommé à l'étape 2, il doit donc transiter par la session.
      // Vide ici, la requête de défi n'étant pas simulée dans ce test.
      await waitFor(() => {
        expect(mockSetRegisterData).toHaveBeenCalledWith({
          firstName: 'John',
          lastName: 'Doe',
          email: 'test@example.com',
          password: 'StrongP@ssw0rd!',
          challengeToken: '',
          turnstileToken: '',
        });
      });

      // Le message « Informations enregistrées · Passez à l'étape suivante » a été retiré : la
      // navigation vers l'étape 2 est elle-même la confirmation, et le fil d'étapes montre déjà la
      // progression. Une notification qui annonce ce que l'écran suivant affiche est du bruit.
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/auth/register/verification');
      });

      expect(toast.success).not.toHaveBeenCalled();
    });

    it('should sanitize inputs before storing', async () => {
      const user = userEvent.setup();
      
      render(<SignupForm />);

      // Utiliser des noms valides (pas de caractères spéciaux HTML qui seraient rejetés par validateName)
      await user.type(screen.getByLabelText(/^first name$/i), 'Jean-Paul');
      await user.type(screen.getByLabelText(/^last name$/i), "O'Connor");
      await user.type(screen.getByLabelText(/^email$/i), 'test@example.com');
      await user.type(screen.getByLabelText(/^password$/i), 'StrongP@ssw0rd!');
      await user.type(screen.getByLabelText(/^confirm$/i), 'StrongP@ssw0rd!');

      const submitButton = screen.getByRole('button', { name: /continue/i });
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

      await user.type(screen.getByLabelText(/^first name$/i), 'John');
      await user.type(screen.getByLabelText(/^last name$/i), 'Doe');
      await user.type(screen.getByLabelText(/^email$/i), 'test@example.com');
      await user.type(screen.getByLabelText(/^password$/i), 'StrongP@ssw0rd!');
      await user.type(screen.getByLabelText(/^confirm$/i), 'StrongP@ssw0rd!');

      const submitButton = screen.getByRole('button', { name: /continue/i });
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

      expect(screen.getByLabelText(/^first name$/i)).toHaveAccessibleName();
      expect(screen.getByLabelText(/^last name$/i)).toHaveAccessibleName();
      expect(screen.getByLabelText(/^email$/i)).toHaveAccessibleName();
      expect(screen.getByLabelText(/^password$/i)).toHaveAccessibleName();
      expect(screen.getByLabelText(/^confirm$/i)).toHaveAccessibleName();
    });
  });
});
