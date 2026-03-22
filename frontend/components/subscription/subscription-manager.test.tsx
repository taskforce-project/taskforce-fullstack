import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SubscriptionManager } from './subscription-manager';
import * as stripeService from '@/lib/api/stripe-service';
import { useAuth } from '@/lib/contexts/auth-context';
import { toast } from 'sonner';

// Mock dependencies
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('@/lib/api/stripe-service', () => ({
  stripeService: {
    getSubscriptionInfo: vi.fn(),
    createCheckoutSession: vi.fn(),
    cancelSubscription: vi.fn(),
  },
}));

vi.mock('@/lib/contexts/auth-context', () => ({
  useAuth: vi.fn(),
}));

describe('SubscriptionManager', () => {
  const mockRefreshUser = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      user: { id: '123', email: 'test@example.com', firstName: 'Test', lastName: 'User', role: 'USER' },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshUser: mockRefreshUser,
    });
    delete (window as any).location;
    (window as any).location = { href: '' };
  });

  describe('Loading State', () => {
    it('should show loading state while fetching subscription', async () => {
      let resolvePromise: any;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      
      vi.mocked(stripeService.stripeService.getSubscriptionInfo).mockReturnValue(promise as any);

      render(<SubscriptionManager />);

      // Check for loading spinner by finding the animated element
      const spinner = document.querySelector('.animate-spin');
      expect(spinner).toBeTruthy();
      
      // Cleanup
      resolvePromise({ planType: 'FREE', status: 'active' });
      await waitFor(() => screen.getByText(/Plan FREE/i));
    });
  });

  describe('Error State', () => {
    it('should show error card when subscription fails to load', async () => {
      vi.mocked(stripeService.stripeService.getSubscriptionInfo).mockRejectedValue(
        new Error('Failed to load')
      );

      render(<SubscriptionManager />);

      await waitFor(() => {
        expect(screen.getByText('Erreur')).toBeInTheDocument();
        expect(screen.getByText(/Impossible de charger les informations d'abonnement/i)).toBeInTheDocument();
      });
    });

    it('should show toast error when subscription fails to load', async () => {
      vi.mocked(stripeService.stripeService.getSubscriptionInfo).mockRejectedValue(
        new Error('Failed to load')
      );

      render(<SubscriptionManager />);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Erreur', {
          description: 'Impossible de charger les informations d\'abonnement',
        });
      });
    });

    it('should allow retry when loading fails', async () => {
      vi.mocked(stripeService.stripeService.getSubscriptionInfo)
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce({
          planType: 'FREE',
          status: 'active',
        });

      render(<SubscriptionManager />);

      await waitFor(() => {
        expect(screen.getByText('Erreur')).toBeInTheDocument();
      });

      const retryButton = screen.getByRole('button', { name: /Réessayer/i });
      fireEvent.click(retryButton);

      await waitFor(() => {
        expect(screen.getByText(/Plan FREE/i)).toBeInTheDocument();
      });
    });
  });

  describe('FREE Plan', () => {
    beforeEach(async () => {
      vi.mocked(stripeService.stripeService.getSubscriptionInfo).mockResolvedValue({
        planType: 'FREE',
        status: 'active',
      });
    });

    it('should display FREE plan information', async () => {
      render(<SubscriptionManager />);

      await waitFor(() => {
        expect(screen.getByText(/Plan FREE/i)).toBeInTheDocument();
        expect(screen.getByText('active')).toBeInTheDocument();
      });
    });

    it('should show upgrade buttons for PRO and ENTERPRISE', async () => {
      render(<SubscriptionManager />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Passer à Pro/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Passer à Enterprise/i })).toBeInTheDocument();
      });
    });

    it('should redirect to Stripe checkout when upgrading to PRO', async () => {
      vi.mocked(stripeService.stripeService.createCheckoutSession).mockResolvedValue({
        checkoutUrl: 'https://checkout.stripe.com/pro',
      });

      render(<SubscriptionManager />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Passer à Pro/i })).toBeInTheDocument();
      });

      const proButton = screen.getByRole('button', { name: /Passer à Pro/i });
      fireEvent.click(proButton);

      await waitFor(() => {
        expect(stripeService.stripeService.createCheckoutSession).toHaveBeenCalledWith('PRO');
        expect(window.location.href).toBe('https://checkout.stripe.com/pro');
      });
    });

    it('should redirect to Stripe checkout when upgrading to ENTERPRISE', async () => {
      vi.mocked(stripeService.stripeService.createCheckoutSession).mockResolvedValue({
        checkoutUrl: 'https://checkout.stripe.com/enterprise',
      });

      render(<SubscriptionManager />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Passer à Enterprise/i })).toBeInTheDocument();
      });

      const enterpriseButton = screen.getByRole('button', { name: /Passer à Enterprise/i });
      fireEvent.click(enterpriseButton);

      await waitFor(() => {
        expect(stripeService.stripeService.createCheckoutSession).toHaveBeenCalledWith('ENTERPRISE');
        expect(window.location.href).toBe('https://checkout.stripe.com/enterprise');
      });
    });

    it('should show error toast when upgrade fails', async () => {
      vi.mocked(stripeService.stripeService.createCheckoutSession).mockRejectedValue(
        new Error('Failed to create session')
      );

      render(<SubscriptionManager />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Passer à Pro/i })).toBeInTheDocument();
      });

      const proButton = screen.getByRole('button', { name: /Passer à Pro/i });
      fireEvent.click(proButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Erreur', {
          description: 'Impossible de créer la session de paiement',
        });
      });
    });
  });

  describe('PRO Plan', () => {
    beforeEach(async () => {
      vi.mocked(stripeService.stripeService.getSubscriptionInfo).mockResolvedValue({
        planType: 'PRO',
        status: 'active',
        amount: 49,
        currency: 'EUR',
        currentPeriodEnd: '2024-04-01T00:00:00Z',
        cancelAtPeriodEnd: false,
      });
    });

    it('should display PRO plan with pricing information', async () => {
      render(<SubscriptionManager />);

      await waitFor(() => {
        expect(screen.getByText(/Plan PRO/i)).toBeInTheDocument();
        expect(screen.getByText(/49/i)).toBeInTheDocument();
        expect(screen.getByText(/EUR/i)).toBeInTheDocument();
        expect(screen.getByText(/mois/i)).toBeInTheDocument();
      });
    });

    it('should display next billing date', async () => {
      render(<SubscriptionManager />);

      await waitFor(() => {
        expect(screen.getByText(/Prochaine facturation/i)).toBeInTheDocument();
        // Date format can vary, just check it exists
        expect(screen.getByText(/2024/i)).toBeInTheDocument();
      });
    });

    it('should show upgrade to ENTERPRISE button', async () => {
      render(<SubscriptionManager />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Passer à Enterprise/i })).toBeInTheDocument();
      });
    });

    it('should show cancel subscription button', async () => {
      render(<SubscriptionManager />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Annuler l'abonnement/i })).toBeInTheDocument();
      });
    });

    it('should open confirmation dialog when clicking cancel', async () => {
      render(<SubscriptionManager />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Annuler l'abonnement/i })).toBeInTheDocument();
      });

      const cancelButton = screen.getByRole('button', { name: /Annuler l'abonnement/i });
      fireEvent.click(cancelButton);

      await waitFor(() => {
        expect(screen.getByText(/Confirmer l'annulation/i)).toBeInTheDocument();
        expect(screen.getByText(/Annuler à la fin de la période/i)).toBeInTheDocument();
      });
    });

    it('should cancel subscription at period end', async () => {
      vi.mocked(stripeService.stripeService.cancelSubscription).mockResolvedValue({
        message: 'Subscription cancelled',
      });

      vi.mocked(stripeService.stripeService.getSubscriptionInfo)
        .mockResolvedValueOnce({
          planType: 'PRO',
          status: 'active',
          amount: 49,
          currency: 'EUR',
          currentPeriodEnd: '2024-04-01T00:00:00Z',
          cancelAtPeriodEnd: false,
        })
        .mockResolvedValueOnce({
          planType: 'PRO',
          status: 'active',
          amount: 49,
          currency: 'EUR',
          currentPeriodEnd: '2024-04-01T00:00:00Z',
          cancelAtPeriodEnd: true,
        });

      render(<SubscriptionManager />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Annuler l'abonnement/i })).toBeInTheDocument();
      });

      const cancelButton = screen.getByRole('button', { name: /Annuler l'abonnement/i });
      fireEvent.click(cancelButton);

      await waitFor(() => {
        expect(screen.getByText(/Annuler à la fin de la période/i)).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole('button', { name: /Annuler à la fin de la période/i });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(stripeService.stripeService.cancelSubscription).toHaveBeenCalledWith(false);
        expect(toast.success).toHaveBeenCalledWith('Abonnement annulé', {
          description: 'Votre abonnement sera annulé à la fin de la période en cours',
        });
        expect(mockRefreshUser).toHaveBeenCalled();
      });
    });

    it('should show warning banner when subscription is set to cancel', async () => {
      vi.mocked(stripeService.stripeService.getSubscriptionInfo).mockResolvedValue({
        planType: 'PRO',
        status: 'active',
        amount: 49,
        currency: 'EUR',
        currentPeriodEnd: '2024-04-01T00:00:00Z',
        cancelAtPeriodEnd: true,
      });

      render(<SubscriptionManager />);

      await waitFor(() => {
        expect(screen.getByText(/Votre abonnement sera annulé à la fin de la période en cours/i)).toBeInTheDocument();
      });
    });

    it('should handle cancellation error', async () => {
      vi.mocked(stripeService.stripeService.cancelSubscription).mockRejectedValue(
        new Error('Cancel failed')
      );

      render(<SubscriptionManager />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Annuler l'abonnement/i })).toBeInTheDocument();
      });

      const cancelButton = screen.getByRole('button', { name: /Annuler l'abonnement/i });
      fireEvent.click(cancelButton);

      await waitFor(() => {
        expect(screen.getByText(/Annuler à la fin de la période/i)).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole('button', { name: /Annuler à la fin de la période/i });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Erreur', {
          description: 'Impossible d\'annuler l\'abonnement',
        });
      });
    });
  });

  describe('ENTERPRISE Plan', () => {
    beforeEach(async () => {
      vi.mocked(stripeService.stripeService.getSubscriptionInfo).mockResolvedValue({
        planType: 'ENTERPRISE',
        status: 'active',
        amount: 199,
        currency: 'EUR',
        currentPeriodEnd: '2024-04-01T00:00:00Z',
        cancelAtPeriodEnd: false,
      });
    });

    it('should display ENTERPRISE plan information', async () => {
      render(<SubscriptionManager />);

      await waitFor(() => {
        expect(screen.getByText(/Plan ENTERPRISE/i)).toBeInTheDocument();
        expect(screen.getByText(/199/i)).toBeInTheDocument();
      });
    });

    it('should show cancel button for ENTERPRISE plan', async () => {
      render(<SubscriptionManager />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Annuler l'abonnement/i })).toBeInTheDocument();
      });
    });

    it('should not show cancel button when already set to cancel', async () => {
      vi.mocked(stripeService.stripeService.getSubscriptionInfo).mockResolvedValue({
        planType: 'ENTERPRISE',
        status: 'active',
        amount: 199,
        currency: 'EUR',
        currentPeriodEnd: '2024-04-01T00:00:00Z',
        cancelAtPeriodEnd: true,
      });

      render(<SubscriptionManager />);

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /Annuler l'abonnement/i })).not.toBeInTheDocument();
        expect(screen.getByText(/Votre abonnement sera annulé à la fin de la période en cours/i)).toBeInTheDocument();
      });
    });
  });
});
