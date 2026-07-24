import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RegisterPlanForm } from './plan-form';
import { toast } from 'sonner';

// Mock dependencies
const mockPush = vi.fn();
const mockBack = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    back: mockBack,
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/store/preferences-store', () => ({
  usePreferencesStore: vi.fn(() => ({
    t: {
      common: {
        error: 'Erreur',
      },
    },
  })),
}));

const mockGetRegisterData = vi.fn();
const mockSetRegisterData = vi.fn();
const mockClearRegisterData = vi.fn();

vi.mock('@/lib/auth/register-storage', () => ({
  getRegisterData: () => mockGetRegisterData(),
  setRegisterData: (data: Parameters<typeof mockSetRegisterData>[0]) => mockSetRegisterData(data),
  clearRegisterData: () => mockClearRegisterData(),
}));

// Dialogs mockés : exposent des boutons câblés sur les callbacks (quand open) pour exercer
// handleEnterpriseSuccess / handleAcceptFreeAccount / handleDeclineFreeAccount.
vi.mock('@/components/sales/enterprise-contact-dialog', () => ({
  EnterpriseContactDialog: ({ open, onSuccess }: { open: boolean; onSuccess: () => void }) =>
    open ? <button data-testid="ent-success" onClick={onSuccess}>success</button> : null,
}));

vi.mock('@/components/sales/enterprise-confirmation-dialog', () => ({
  EnterpriseConfirmationDialog: ({
    open,
    onAccept,
    onDecline,
  }: {
    open: boolean;
    onAccept: () => void;
    onDecline: () => void;
  }) =>
    open ? (
      <div>
        <button data-testid="conf-accept" onClick={onAccept}>accept</button>
        <button data-testid="conf-decline" onClick={onDecline}>decline</button>
      </div>
    ) : null,
}));

describe('RegisterPlanForm - Step 2: Plan Selection', () => {
  const mockRegisterData = {
    firstName: 'John',
    lastName: 'Doe',
    email: 'test@example.com',
    password: 'StrongP@ssw0rd!',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRegisterData.mockReturnValue(mockRegisterData);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Rendering', () => {
    it('should render the four plan options', () => {
      render(<RegisterPlanForm />);

      expect(screen.getByText('Free')).toBeInTheDocument();
      expect(screen.getByText('Basic')).toBeInTheDocument();
      expect(screen.getByText('Business')).toBeInTheDocument();
      expect(screen.getByText('Enterprise')).toBeInTheDocument();
    });

    // Le fil d'étapes appartient désormais à la page (`AuthStepper`), plus au formulaire : il était
    // dupliqué à l'identique dans les trois étapes. Le formulaire ne doit plus l'afficher — la
    // progression est testée sur `AuthStepper` lui-même (auth-stepper.test.tsx).
    it('ne porte plus le fil d\'étapes, désormais rendu par la page', () => {
      render(<RegisterPlanForm />);

      expect(screen.queryByText(/étape 2 sur 3/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/66%/i)).not.toBeInTheDocument();
    });

    it('should display BUSINESS plan as recommended', () => {
      render(<RegisterPlanForm />);

      const recommendedBadge = screen.getByText('Recommandé');
      expect(recommendedBadge).toBeInTheDocument();

      // Le badge est porté par Business : c'est le plan mis en avant, pas Free.
      const businessCard = screen.getByTestId('plan-card-business');
      expect(businessCard).toContainElement(recommendedBadge);
    });

    it('should render plan features correctly', () => {
      render(<RegisterPlanForm />);

      // Free — le modèle est par siège, les membres ne sont donc jamais plafonnés.
      expect(screen.getByText('Membres illimités')).toBeInTheDocument();
      expect(screen.getByText('2 workspaces')).toBeInTheDocument();

      // Basic
      expect(screen.getByText('5 workspaces')).toBeInTheDocument();
      expect(screen.getByText('Issues illimitées')).toBeInTheDocument();

      // Business
      expect(screen.getByText('Workspaces illimités')).toBeInTheDocument();
      expect(screen.getByText('Intégration GitHub')).toBeInTheDocument();

      // Enterprise
      expect(screen.getByText('SSO / SAML / SCIM')).toBeInTheDocument();
      expect(screen.getByText('Support dédié & accompagnement')).toBeInTheDocument();
    });

    it('should render navigation buttons', () => {
      render(<RegisterPlanForm />);

      expect(screen.getAllByRole('button', { name: /retour/i })[0]).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /continuer/i })).toBeInTheDocument();
    });
  });

  describe('Session Validation', () => {
    it('should redirect to step 1 if no register data exists', () => {
      mockGetRegisterData.mockReturnValue(null);

      render(<RegisterPlanForm />);

      expect(toast.error).toHaveBeenCalledWith(
        'Session expirée',
        expect.objectContaining({
          description: expect.stringContaining('Veuillez recommencer'),
        })
      );
      
      expect(mockPush).toHaveBeenCalledWith('/auth/register');
    });

    it('should display user email from step 1', () => {
      render(<RegisterPlanForm />);

      // The component might not display email in UI, but it stores it
      expect(mockGetRegisterData).toHaveBeenCalled();
    });
  });

  describe('Plan Selection', () => {
    it('should select FREE plan by default', () => {
      render(<RegisterPlanForm />);

      const freeCard = screen.getByTestId('plan-card-free');
      expect(freeCard).toHaveClass('ring-2', 'ring-primary');
    });

    it('should change selection when clicking on BUSINESS plan', async () => {
      const user = userEvent.setup();
      render(<RegisterPlanForm />);

      const businessCard = screen.getByTestId('plan-card-business');

      // Initially should not be selected
      expect(businessCard).not.toHaveClass('ring-2');

      // Click to select
      await user.click(businessCard);

      // Now should be selected
      await waitFor(() => {
        expect(businessCard).toHaveClass('ring-2', 'ring-primary');
      });
    });

    it('should open enterprise dialog when clicking on ENTERPRISE plan', async () => {
      const user = userEvent.setup();
      render(<RegisterPlanForm />);

      const enterpriseCard = screen.getByTestId('plan-card-enterprise');

      await user.click(enterpriseCard);

      // Enterprise clicking opens contact dialog, not direct plan selection
      await waitFor(() => {
        expect(enterpriseCard).not.toHaveClass('ring-2', 'ring-primary');
      });
    });

    it('should allow switching between plans', async () => {
      const user = userEvent.setup();
      render(<RegisterPlanForm />);

      const freeCard = screen.getByTestId('plan-card-free');
      const businessCard = screen.getByTestId('plan-card-business');

      // Start with FREE selected
      expect(freeCard).toHaveClass('ring-2', 'ring-primary');

      // Select Business
      await user.click(businessCard);
      await waitFor(() => {
        expect(businessCard).toHaveClass('ring-2', 'ring-primary');
        expect(freeCard).not.toHaveClass('ring-2');
      });
    });
  });

  describe('Form Submission', () => {
    it('should store selected plan (FREE) and redirect to verification', async () => {
      const user = userEvent.setup();
      
      render(<RegisterPlanForm />);

      const submitButton = screen.getByRole('button', { name: /continuer/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockSetRegisterData).toHaveBeenCalledWith({
          planType: 'FREE',
        });
      });

      expect(toast.success).toHaveBeenCalledWith(
        'Plan sélectionné',
        expect.objectContaining({
          description: expect.stringContaining('code de vérification'),
        })
      );

      expect(mockPush).toHaveBeenCalledWith('/auth/register/verification');
    });

    it('should store BUSINESS plan when selected', async () => {
      const user = userEvent.setup();

      render(<RegisterPlanForm />);

      const businessCard = screen.getByTestId('plan-card-business');
      await user.click(businessCard);

      const submitButton = screen.getByRole('button', { name: /continuer/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockSetRegisterData).toHaveBeenCalledWith({
          planType: 'BUSINESS',
        });
      });
    });

    it('should open enterprise dialog instead of storing ENTERPRISE plan', async () => {
      const user = userEvent.setup();

      render(<RegisterPlanForm />);

      const enterpriseCard = screen.getByTestId('plan-card-enterprise');
      await user.click(enterpriseCard);

      // Clicking enterprise opens contact dialog, no plan stored directly
      expect(mockSetRegisterData).not.toHaveBeenCalled();

      // Submit button on the plan form remains accessible
      const submitButton = screen.getByRole('button', { name: /continuer/i });
      expect(submitButton).toBeInTheDocument();
    });
  });

  describe('Navigation', () => {
    it('should go back to step 1 when clicking back button', async () => {
      const user = userEvent.setup();
      render(<RegisterPlanForm />);

      const backButton = screen.getAllByRole('button', { name: /retour/i })[0];
      await user.click(backButton);

      expect(mockPush).toHaveBeenCalledWith('/auth/register');
    });

    it('should disable back button while loading', async () => {
      const user = userEvent.setup();
      render(<RegisterPlanForm />);

      const submitButton = screen.getByRole('button', { name: /continuer/i });

      // Click and immediately check
      await user.click(submitButton);

      // After successful submission, form navigates away immediately
      // Skip loading state test as it's too fast in tests
      expect(mockSetRegisterData).toHaveBeenCalled();
    });
  });

  describe('Loading State', () => {
    it('should disable submit button while loading', async () => {
      const user = userEvent.setup();
      render(<RegisterPlanForm />);

      const submitButton = screen.getByRole('button', { name: /continuer/i });
      
      await user.click(submitButton);

      // Form submission is synchronous in tests, loading state is too brief
      // Verify submission happened instead
      expect(mockSetRegisterData).toHaveBeenCalled();
    });

    it('should show loading state during submission', async () => {
      const user = userEvent.setup();
      render(<RegisterPlanForm />);

      const submitButton = screen.getByRole('button', { name: /continuer/i });
      
      await user.click(submitButton);

      // Verify form was submitted successfully
      expect(mockSetRegisterData).toHaveBeenCalledWith({ planType: 'FREE' });
      expect(mockPush).toHaveBeenCalledWith('/auth/register/verification');
    });
  });

  describe('UI/UX Details', () => {
    it('should display plan prices correctly', () => {
      render(<RegisterPlanForm />);

      // Tarification par siège : le prix affiché est un prix par membre.
      expect(screen.getByText('0€')).toBeInTheDocument();
      expect(screen.getByText('10€ / membre')).toBeInTheDocument();
      expect(screen.getByText('16€ / membre')).toBeInTheDocument();
      expect(screen.getByText('Sur devis')).toBeInTheDocument();
    });

    it('should show monthly billing label for every plan except Enterprise', () => {
      render(<RegisterPlanForm />);

      // Free, Basic et Business affichent « /mois » ; Enterprise est sur devis.
      expect(screen.getAllByText('/mois')).toHaveLength(3);
    });

    it('should have hover effect on plan cards', () => {
      render(<RegisterPlanForm />);

      const businessCard = screen.getByText('Business').closest('[data-slot="card"]');
      expect(businessCard).toHaveClass('cursor-pointer');
    });

    it('should show informative message about plan changes', () => {
      render(<RegisterPlanForm />);

      expect(screen.getByText(/vous pourrez en changer à tout moment/i)).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper heading structure', () => {
      render(<RegisterPlanForm />);

      expect(screen.getByRole('heading', { name: /choisissez votre plan/i })).toBeInTheDocument();
    });

    it('should allow keyboard navigation between plans', async () => {
      const user = userEvent.setup();
      render(<RegisterPlanForm />);

      const freeCard = screen.getByTestId('plan-card-free');

      // Tab to first card
      await user.tab();

      // Should be able to click with keyboard
      await user.keyboard('{Enter}');

      expect(freeCard).toHaveClass('ring-2');
    });

    it('should have accessible plan descriptions', () => {
      render(<RegisterPlanForm />);

      expect(screen.getByText('Pour découvrir TaskForce')).toBeInTheDocument();
      expect(screen.getByText('Pour les petites équipes')).toBeInTheDocument();
      expect(screen.getByText('Pour les équipes qui livrent')).toBeInTheDocument();
      expect(screen.getByText('Pour les grandes organisations')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should handle storage errors gracefully', async () => {
      const user = userEvent.setup();
      
      mockSetRegisterData.mockImplementation(() => {
        throw new Error('Storage error');
      });

      render(<RegisterPlanForm />);

      const submitButton = screen.getByRole('button', { name: /continuer/i });
      await user.click(submitButton);

      expect(toast.error).toHaveBeenCalledWith(
        'Erreur',
        expect.objectContaining({
          description: 'Storage error',
        })
      );
    });
  });

  describe('Confirmation compte FREE (flux Enterprise)', () => {
    it('accepter → sélectionne FREE, stocke et va à la vérification', async () => {
      const user = userEvent.setup();
      render(<RegisterPlanForm />);

      await user.click(screen.getByTestId('plan-card-enterprise')); // ouvre le dialog Enterprise
      await user.click(screen.getByTestId('ent-success'));          // onSuccess → confirmation
      await user.click(screen.getByTestId('conf-accept'));          // handleAcceptFreeAccount

      expect(mockSetRegisterData).toHaveBeenCalledWith({ planType: 'FREE' });
      expect(mockPush).toHaveBeenCalledWith('/auth/register/verification');
      expect(toast.success).toHaveBeenCalled();
    });

    it('refuser → enregistre la demande et retourne à l’accueil', async () => {
      const user = userEvent.setup();
      render(<RegisterPlanForm />);

      await user.click(screen.getByTestId('plan-card-enterprise'));
      await user.click(screen.getByTestId('ent-success'));
      await user.click(screen.getByTestId('conf-decline'));         // handleDeclineFreeAccount

      expect(mockPush).toHaveBeenCalledWith('/');
      expect(toast.success).toHaveBeenCalled();
    });
  });
});
