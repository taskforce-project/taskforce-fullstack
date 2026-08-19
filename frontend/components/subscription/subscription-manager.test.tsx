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
    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
      configurable: true,
    });
  });

  describe('Loading State', () => {
    it('should show loading state while fetching subscription', async () => {
      let resolvePromise!: (value: unknown) => void;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      
      vi.mocked(stripeService.stripeService.getSubscriptionInfo).mockReturnValue(promise as ReturnType<typeof stripeService.stripeService.getSubscriptionInfo>);

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
        expect(screen.getByText('Error')).toBeInTheDocument();
        expect(screen.getByText(/Unable to load subscription information/i)).toBeInTheDocument();
      });
    });

    it('should show toast error when subscription fails to load', async () => {
      vi.mocked(stripeService.stripeService.getSubscriptionInfo).mockRejectedValue(
        new Error('Failed to load')
      );

      render(<SubscriptionManager />);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Error', {
          description: 'Unable to load subscription information',
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
        expect(screen.getByText('Error')).toBeInTheDocument();
      });

      const retryButton = screen.getByRole('button', { name: /Retry/i });
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

    // Enterprise se souscrit sur devis, pas en ligne : depuis Free, seuls Basic et Business sont
    // proposés au paiement immédiat.
    it('should show upgrade buttons for BASIC and BUSINESS', async () => {
      render(<SubscriptionManager />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Upgrade to Basic/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Upgrade to Business/i })).toBeInTheDocument();
      });
      expect(screen.queryByRole('button', { name: /Upgrade to Enterprise/i })).not.toBeInTheDocument();
    });

    it('should redirect to Stripe checkout when upgrading to BUSINESS', async () => {
      vi.mocked(stripeService.stripeService.createCheckoutSession).mockResolvedValue({
        checkoutUrl: 'https://checkout.stripe.com/business',
      });

      render(<SubscriptionManager />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Upgrade to Business/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Upgrade to Business/i }));

      await waitFor(() => {
        expect(stripeService.stripeService.createCheckoutSession).toHaveBeenCalledWith('BUSINESS');
        expect(window.location.href).toBe('https://checkout.stripe.com/business');
      });
    });

    it('should redirect to Stripe checkout when upgrading to BASIC', async () => {
      vi.mocked(stripeService.stripeService.createCheckoutSession).mockResolvedValue({
        checkoutUrl: 'https://checkout.stripe.com/basic',
      });

      render(<SubscriptionManager />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Upgrade to Basic/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Upgrade to Basic/i }));

      await waitFor(() => {
        expect(stripeService.stripeService.createCheckoutSession).toHaveBeenCalledWith('BASIC');
        expect(window.location.href).toBe('https://checkout.stripe.com/basic');
      });
    });

    it('should show error toast when upgrade fails', async () => {
      vi.mocked(stripeService.stripeService.createCheckoutSession).mockRejectedValue(
        new Error('Failed to create session')
      );

      render(<SubscriptionManager />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Upgrade to Business/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Upgrade to Business/i }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Error', {
          description: 'Unable to create payment session',
        });
      });
    });
  });

  describe('BUSINESS Plan', () => {
    beforeEach(async () => {
      vi.mocked(stripeService.stripeService.getSubscriptionInfo).mockResolvedValue({
        planType: 'BUSINESS',
        status: 'active',
        amount: 49,
        currency: 'EUR',
        currentPeriodEnd: '2024-04-01T00:00:00Z',
        cancelAtPeriodEnd: false,
      });
    });

    it('should display BUSINESS plan with pricing information', async () => {
      render(<SubscriptionManager />);

      await waitFor(() => {
        expect(screen.getByText(/Plan BUSINESS/i)).toBeInTheDocument();
        expect(screen.getByText(/49/i)).toBeInTheDocument();
        expect(screen.getByText(/EUR/i)).toBeInTheDocument();
        expect(screen.getByText(/month/i)).toBeInTheDocument();
      });
    });

    it('should display next billing date', async () => {
      render(<SubscriptionManager />);

      await waitFor(() => {
        expect(screen.getByText(/Next billing/i)).toBeInTheDocument();
        // Date format can vary, just check it exists
        expect(screen.getByText(/2024/i)).toBeInTheDocument();
      });
    });

    // Business est le plan le plus élevé souscriptible en ligne : au-delà, c'est Enterprise, sur
    // devis. Aucun bouton de montée en gamme ne doit donc être proposé ici.
    it('should not offer any further upgrade from BUSINESS', async () => {
      render(<SubscriptionManager />);

      await waitFor(() => {
        expect(screen.getByText(/Plan BUSINESS/i)).toBeInTheDocument();
      });
      expect(screen.queryByRole('button', { name: /Upgrade to/i })).not.toBeInTheDocument();
    });

    it('should show cancel subscription button', async () => {
      render(<SubscriptionManager />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Cancel subscription/i })).toBeInTheDocument();
      });
    });

    it('should open confirmation dialog when clicking cancel', async () => {
      render(<SubscriptionManager />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Cancel subscription/i })).toBeInTheDocument();
      });

      const cancelButton = screen.getByRole('button', { name: /Cancel subscription/i });
      fireEvent.click(cancelButton);

      await waitFor(() => {
        expect(screen.getByText(/Confirm cancellation/i)).toBeInTheDocument();
        expect(screen.getByText(/Cancel at end of period/i)).toBeInTheDocument();
      });
    });

    it('should cancel subscription at period end', async () => {
      vi.mocked(stripeService.stripeService.cancelSubscription).mockResolvedValue({
        message: 'Subscription cancelled',
      });

      vi.mocked(stripeService.stripeService.getSubscriptionInfo)
        .mockResolvedValueOnce({
          planType: 'BUSINESS',
          status: 'active',
          amount: 49,
          currency: 'EUR',
          currentPeriodEnd: '2024-04-01T00:00:00Z',
          cancelAtPeriodEnd: false,
        })
        .mockResolvedValueOnce({
          planType: 'BUSINESS',
          status: 'active',
          amount: 49,
          currency: 'EUR',
          currentPeriodEnd: '2024-04-01T00:00:00Z',
          cancelAtPeriodEnd: true,
        });

      render(<SubscriptionManager />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Cancel subscription/i })).toBeInTheDocument();
      });

      const cancelButton = screen.getByRole('button', { name: /Cancel subscription/i });
      fireEvent.click(cancelButton);

      await waitFor(() => {
        expect(screen.getByText(/Cancel at end of period/i)).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole('button', { name: /Cancel at end of period/i });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(stripeService.stripeService.cancelSubscription).toHaveBeenCalledWith(false);
        expect(toast.success).toHaveBeenCalledWith('Subscription cancelled', {
          description: 'Your subscription will be cancelled at the end of the current period',
        });
        expect(mockRefreshUser).toHaveBeenCalled();
      });
    });

    it('should show warning banner when subscription is set to cancel', async () => {
      vi.mocked(stripeService.stripeService.getSubscriptionInfo).mockResolvedValue({
        planType: 'BUSINESS',
        status: 'active',
        amount: 49,
        currency: 'EUR',
        currentPeriodEnd: '2024-04-01T00:00:00Z',
        cancelAtPeriodEnd: true,
      });

      render(<SubscriptionManager />);

      await waitFor(() => {
        expect(screen.getByText(/Your subscription will be cancelled at the end of the current period/i)).toBeInTheDocument();
      });
    });

    it('should handle cancellation error', async () => {
      vi.mocked(stripeService.stripeService.cancelSubscription).mockRejectedValue(
        new Error('Cancel failed')
      );

      render(<SubscriptionManager />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Cancel subscription/i })).toBeInTheDocument();
      });

      const cancelButton = screen.getByRole('button', { name: /Cancel subscription/i });
      fireEvent.click(cancelButton);

      await waitFor(() => {
        expect(screen.getByText(/Cancel at end of period/i)).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole('button', { name: /Cancel at end of period/i });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Error', {
          description: 'Unable to cancel subscription',
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
        expect(screen.getByRole('button', { name: /Cancel subscription/i })).toBeInTheDocument();
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
        expect(screen.queryByRole('button', { name: /Cancel subscription/i })).not.toBeInTheDocument();
        expect(screen.getByText(/Your subscription will be cancelled at the end of the current period/i)).toBeInTheDocument();
      });
    });
  });
});
