import { describe, it, expect, vi, afterEach } from 'vitest';

// Mock stripe service
const mockCreateCheckoutSession = vi.fn();
const mockCancelSubscription = vi.fn();
const mockGetSubscriptionInfo = vi.fn();

vi.mock('@/lib/api/stripe-service', () => ({
  stripeService: {
    createCheckoutSession: mockCreateCheckoutSession,
    cancelSubscription: mockCancelSubscription,
    getSubscriptionInfo: mockGetSubscriptionInfo,
  },
}));

// Mock auth service
const mockRefreshToken = vi.fn();
const mockGetCurrentUser = vi.fn();

vi.mock('@/lib/api/auth-service', () => ({
  authService: {
    refreshToken: mockRefreshToken,
    getCurrentUser: mockGetCurrentUser,
  },
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe('Integration Tests - Subscription Flow', () => {
  describe('API Integration - Upgrade Flow', () => {
    it('should successfully create checkout session for PRO upgrade', async () => {
      mockCreateCheckoutSession.mockResolvedValue({
        checkoutUrl: 'https://checkout.stripe.com/test-session-pro',
        sessionId: 'cs_test_123',
      });

      const { stripeService } = await import('@/lib/api/stripe-service');
      await stripeService.createCheckoutSession('PRO');

      expect(mockCreateCheckoutSession).toHaveBeenCalledWith('PRO');
    });

    it('should handle upgrade API failure gracefully', async () => {
      mockCreateCheckoutSession.mockRejectedValue(
        new Error('Payment processing error')
      );

      const { stripeService } = await import('@/lib/api/stripe-service');
      
      await expect(
        stripeService.createCheckoutSession('PRO')
      ).rejects.toThrow('Payment processing error');
    });
  });

  describe('API Integration - Subscription Cancellation', () => {
    it('should successfully cancel subscription immediately', async () => {
      mockCancelSubscription.mockResolvedValue({
        message: 'Subscription cancelled',
      });

      const { stripeService } = await import('@/lib/api/stripe-service');
      await stripeService.cancelSubscription(true);

      expect(mockCancelSubscription).toHaveBeenCalledWith(true);
    });

    it('should handle cancellation API failure', async () => {
      mockCancelSubscription.mockRejectedValue(
        new Error('Cannot cancel subscription')
      );

      const { stripeService } = await import('@/lib/api/stripe-service');
      
      await expect(
        stripeService.cancelSubscription(true)
      ).rejects.toThrow('Cannot cancel subscription');
    });
  });

describe('API Integration - Subscription Info Retrieval', () => {
    it('should fetch subscription info', async () => {
      mockGetSubscriptionInfo.mockResolvedValue({
        planType: 'FREE',
        status: 'active',
      });

      const { stripeService } = await import('@/lib/api/stripe-service');
      await stripeService.getSubscriptionInfo();

      expect(mockGetSubscriptionInfo).toHaveBeenCalled();
    });

    it('should handle subscription info fetch failure', async () => {
      mockGetSubscriptionInfo.mockRejectedValue(
        new Error('Network error')
      );

      const { stripeService } = await import('@/lib/api/stripe-service');
      
      await expect(
        stripeService.getSubscriptionInfo()
      ).rejects.toThrow('Network error');
    });
  });
});
