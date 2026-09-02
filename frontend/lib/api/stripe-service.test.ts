/**
 * Tests pour stripeService
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { stripeService } from './stripe-service';
import { apiClient } from './client';
import { BILLING_ROUTES, STRIPE_ROUTES } from '../config/api-routes';

/**
 * Enveloppe `ApiResponse<T>` : les routes protégées `/api/billing` la renvoient, le service lit donc
 * `response.data.data`. `/api/stripe/cancel` fait exception (cf. le bloc `cancelSubscription`).
 */
const envelope = <T,>(data: T) => ({ data: { success: true, message: 'ok', data } });

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
    it('devrait créer une session de checkout pour le plan BUSINESS', async () => {
      // Given
      vi.mocked(apiClient.post).mockResolvedValue(
        envelope({ sessionId: 'session_123', sessionUrl: 'https://checkout.stripe.com/session_123' })
      );

      // When
      const result = await stripeService.createCheckoutSession('BUSINESS');

      // Then - le service renomme `sessionUrl` en `checkoutUrl` pour l'appelant.
      expect(result).toEqual({
        sessionId: 'session_123',
        checkoutUrl: 'https://checkout.stripe.com/session_123',
      });
      expect(apiClient.post).toHaveBeenCalledWith(BILLING_ROUTES.CHECKOUT, {
        planType: 'BUSINESS',
        successUrl: 'http://localhost:3000/payment/success',
        cancelUrl: 'http://localhost:3000/payment/cancel',
      });
    });

    it('devrait créer une session de checkout pour le plan BASIC', async () => {
      // Given
      vi.mocked(apiClient.post).mockResolvedValue(
        envelope({ sessionId: 'session_456', sessionUrl: 'https://checkout.stripe.com/session_456' })
      );

      // When - seuls BASIC et BUSINESS sont souscrivables en self-service ; ENTERPRISE passe par un devis.
      const result = await stripeService.createCheckoutSession('BASIC');

      // Then
      expect(result).toEqual({
        sessionId: 'session_456',
        checkoutUrl: 'https://checkout.stripe.com/session_456',
      });
      expect(apiClient.post).toHaveBeenCalledWith(BILLING_ROUTES.CHECKOUT, {
        planType: 'BASIC',
        successUrl: 'http://localhost:3000/payment/success',
        cancelUrl: 'http://localhost:3000/payment/cancel',
      });
    });

    it('devrait utiliser les URLs personnalisées si fournies', async () => {
      // Given
      vi.mocked(apiClient.post).mockResolvedValue(
        envelope({ sessionId: 'session_789', sessionUrl: 'https://checkout.stripe.com/session_789' })
      );

      const customSuccessUrl = 'http://localhost:3000/custom/success';
      const customCancelUrl = 'http://localhost:3000/custom/cancel';

      // When
      const result = await stripeService.createCheckoutSession(
        'BUSINESS',
        customSuccessUrl,
        customCancelUrl
      );

      // Then
      expect(result).toEqual({
        sessionId: 'session_789',
        checkoutUrl: 'https://checkout.stripe.com/session_789',
      });
      expect(apiClient.post).toHaveBeenCalledWith(BILLING_ROUTES.CHECKOUT, {
        planType: 'BUSINESS',
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
        stripeService.createCheckoutSession('BUSINESS')
      ).rejects.toThrow(errorMessage);
    });
  });

  describe('getSubscriptionInfo', () => {
    it('devrait récupérer les informations d\'abonnement FREE', async () => {
      // Given
      const subscription = {
        id: 1,
        userId: 10,
        planType: 'FREE' as const,
        status: 'ACTIVE',
      };
      vi.mocked(apiClient.get).mockResolvedValue(envelope(subscription));

      // When
      const result = await stripeService.getSubscriptionInfo();

      // Then
      expect(result).toEqual(subscription);
      expect(apiClient.get).toHaveBeenCalledWith(BILLING_ROUTES.SUBSCRIPTION);
    });

    it('devrait récupérer les informations d\'abonnement BUSINESS avec détails', async () => {
      // Given
      const subscription = {
        id: 2,
        userId: 20,
        planType: 'BUSINESS' as const,
        status: 'ACTIVE',
        amount: 999,
        currency: 'EUR',
        currentPeriodEnd: '2026-04-19T00:00:00Z',
        cancelAtPeriodEnd: false,
      };
      vi.mocked(apiClient.get).mockResolvedValue(envelope(subscription));

      // When
      const result = await stripeService.getSubscriptionInfo();

      // Then
      expect(result).toEqual(subscription);
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

  describe('verifySession', () => {
    it('devrait vérifier une session et renvoyer le forfait appliqué', async () => {
      // Given - le back renvoie l'enveloppe ApiResponse<VerifySessionResponse>.
      const result = {
        email: 'user@taskforce.dev',
        planType: 'BUSINESS',
        paymentStatus: 'paid',
        subscriptionId: 'sub_123',
        customerId: 'cus_123',
        userCreated: false,
        message: 'Paiement validé avec succès.',
      };
      vi.mocked(apiClient.get).mockResolvedValue(envelope(result));

      // When
      const res = await stripeService.verifySession('cs_test_1');

      // Then - le service lit `response.data.data` et passe le session_id en query param.
      expect(res).toEqual(result);
      expect(apiClient.get).toHaveBeenCalledWith(STRIPE_ROUTES.VERIFY_SESSION, {
        params: { session_id: 'cs_test_1' },
      });
    });

    it('devrait lancer une erreur si la vérification échoue', async () => {
      // Given
      const errorMessage = 'Session not found';
      vi.mocked(apiClient.get).mockRejectedValue(new Error(errorMessage));

      // When/Then
      await expect(stripeService.verifySession('cs_bad')).rejects.toThrow(errorMessage);
    });
  });

  // `cancelSubscription` vise `/api/stripe/cancel` (contrôleur public), qui ne renvoie pas
  // l'enveloppe `ApiResponse<T>` : le service lit donc `response.data` directement, à un seul niveau.
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
      expect(apiClient.post).toHaveBeenCalledWith(STRIPE_ROUTES.CANCEL_SUBSCRIPTION, {
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
      expect(apiClient.post).toHaveBeenCalledWith(STRIPE_ROUTES.CANCEL_SUBSCRIPTION, {
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
