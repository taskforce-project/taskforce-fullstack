/**
 * Tests pour stripeService
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { stripeService } from './stripe-service';
import { apiClient } from './client';

// Mock du client API
vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
  getErrorMessage: vi.fn((error) => error.message || 'Unknown error'),
}));

describe('stripeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock window.location pour les tests
    Object.defineProperty(window, 'location', {
      value: { origin: 'http://localhost:3000' },
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createCheckoutSession', () => {
    it('devrait créer une session de checkout pour plan PRO', async () => {
      // Given
      const mockResponse = {
        data: {
          sessionId: 'session_123',
          checkoutUrl: 'https://checkout.stripe.com/session_123',
        },
      };
      vi.mocked(apiClient.post).mockResolvedValue(mockResponse);

      // When
      const result = await stripeService.createCheckoutSession('PRO');

      // Then
      expect(result).toEqual(mockResponse.data);
      expect(apiClient.post).toHaveBeenCalledWith('/api/stripe/create-checkout', {
        planType: 'PRO',
        successUrl: 'http://localhost:3000/payment/success',
        cancelUrl: 'http://localhost:3000/payment/cancel',
      });
    });

    it('devrait créer une session de checkout pour plan ENTERPRISE', async () => {
      // Given
      const mockResponse = {
        data: {
          sessionId: 'session_456',
          checkoutUrl: 'https://checkout.stripe.com/session_456',
        },
      };
      vi.mocked(apiClient.post).mockResolvedValue(mockResponse);

      // When
      const result = await stripeService.createCheckoutSession('ENTERPRISE');

      // Then
      expect(result).toEqual(mockResponse.data);
      expect(apiClient.post).toHaveBeenCalledWith('/api/stripe/create-checkout', {
        planType: 'ENTERPRISE',
        successUrl: 'http://localhost:3000/payment/success',
        cancelUrl: 'http://localhost:3000/payment/cancel',
      });
    });

    it('devrait utiliser les URLs personnalisées si fournies', async () => {
      // Given
      const mockResponse = {
        data: {
          sessionId: 'session_789',
          checkoutUrl: 'https://checkout.stripe.com/session_789',
        },
      };
      vi.mocked(apiClient.post).mockResolvedValue(mockResponse);

      const customSuccessUrl = 'http://localhost:3000/custom/success';
      const customCancelUrl = 'http://localhost:3000/custom/cancel';

      // When
      const result = await stripeService.createCheckoutSession(
        'PRO',
        customSuccessUrl,
        customCancelUrl
      );

      // Then
      expect(result).toEqual(mockResponse.data);
      expect(apiClient.post).toHaveBeenCalledWith('/api/stripe/create-checkout', {
        planType: 'PRO',
        successUrl: customSuccessUrl,
        cancelUrl: customCancelUrl,
      });
    });

    it('devrait lancer une erreur si la requête échoue', async () => {
      // Given
      const errorMessage = 'Stripe API error';
      vi.mocked(apiClient.post).mockRejectedValue(new Error(errorMessage));

      // When/Then
      await expect(
        stripeService.createCheckoutSession('PRO')
      ).rejects.toThrow(errorMessage);
    });
  });

  describe('getSubscriptionInfo', () => {
    it('devrait récupérer les informations d\'abonnement FREE', async () => {
      // Given
      const mockSubscription = {
        data: {
          id: 1,
          userId: 10,
          planType: 'FREE' as const,
          status: 'ACTIVE',
        },
      };
      vi.mocked(apiClient.get).mockResolvedValue(mockSubscription);

      // When
      const result = await stripeService.getSubscriptionInfo();

      // Then
      expect(result).toEqual(mockSubscription.data);
      expect(apiClient.get).toHaveBeenCalledWith('/api/stripe/subscription');
    });

    it('devrait récupérer les informations d\'abonnement PRO avec détails', async () => {
      // Given
      const mockSubscription = {
        data: {
          id: 2,
          userId: 20,
          planType: 'PRO' as const,
          status: 'ACTIVE',
          amount: 999,
          currency: 'EUR',
          currentPeriodEnd: '2026-04-19T00:00:00Z',
          cancelAtPeriodEnd: false,
        },
      };
      vi.mocked(apiClient.get).mockResolvedValue(mockSubscription);

      // When
      const result = await stripeService.getSubscriptionInfo();

      // Then
      expect(result).toEqual(mockSubscription.data);
      expect(result.amount).toBe(999);
      expect(result.currency).toBe('EUR');
      expect(result.cancelAtPeriodEnd).toBe(false);
    });

    it('devrait lancer une erreur si la requête échoue', async () => {
      // Given
      const errorMessage = 'Subscription not found';
      vi.mocked(apiClient.get).mockRejectedValue(new Error(errorMessage));

      // When/Then
      await expect(stripeService.getSubscriptionInfo()).rejects.toThrow(errorMessage);
    });
  });

  describe('cancelSubscription', () => {
    it('devrait annuler l\'abonnement à la fin de la période (par défaut)', async () => {
      // Given
      const mockResponse = {
        data: {
          message: 'Abonnement annulé à la fin de la période',
        },
      };
      vi.mocked(apiClient.post).mockResolvedValue(mockResponse);

      // When
      const result = await stripeService.cancelSubscription();

      // Then
      expect(result).toEqual(mockResponse.data);
      expect(apiClient.post).toHaveBeenCalledWith('/api/stripe/cancel', {
        immediately: false,
      });
    });

    it('devrait annuler l\'abonnement immédiatement si demandé', async () => {
      // Given
      const mockResponse = {
        data: {
          message: 'Abonnement annulé immédiatement',
        },
      };
      vi.mocked(apiClient.post).mockResolvedValue(mockResponse);

      // When
      const result = await stripeService.cancelSubscription(true);

      // Then
      expect(result).toEqual(mockResponse.data);
      expect(apiClient.post).toHaveBeenCalledWith('/api/stripe/cancel', {
        immediately: true,
      });
    });

    it('devrait lancer une erreur si l\'annulation échoue', async () => {
      // Given
      const errorMessage = 'Cannot cancel subscription';
      vi.mocked(apiClient.post).mockRejectedValue(new Error(errorMessage));

      // When/Then
      await expect(stripeService.cancelSubscription()).rejects.toThrow(errorMessage);
    });
  });
});
