/**
 * Service Stripe
 * Gestion des paiements et abonnements
 */

import { apiClient, getErrorMessage } from "./client";
import { STRIPE_ROUTES, BILLING_ROUTES } from "../config/api-routes";

/**
 * Réponse de création de session Stripe
 */
export interface CheckoutSessionResponse {
  sessionId?: string;
  checkoutUrl: string;
}

/**
 * Réponse d'informations d'abonnement
 */
export interface SubscriptionInfo {
  id?: number;
  userId?: number;
  planType: "FREE" | "PRO" | "ENTERPRISE";
  status: string;
  amount?: number;
  currency?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
}

/**
 * Service Stripe
 */
export const stripeService = {
  /**
   * Créer une session de paiement Stripe
   * @param planType - Type de plan (PRO, ENTERPRISE)
   * @param successUrl - URL de redirection après paiement réussi
   * @param cancelUrl - URL de redirection si annulation
   * @returns URL de checkout Stripe
   */
  async createCheckoutSession(
    planType: "PRO" | "ENTERPRISE",
    successUrl?: string,
    cancelUrl?: string
  ): Promise<CheckoutSessionResponse> {
    try {
      const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
      
      const response = await apiClient.post<CheckoutSessionResponse>(STRIPE_ROUTES.CREATE_CHECKOUT, {
        planType,
        successUrl: successUrl || `${baseUrl}/payment/success`,
        cancelUrl: cancelUrl || `${baseUrl}/payment/cancel`,
      });
      
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  /**
   * Récupérer les informations d'abonnement de l'utilisateur
   * @returns Informations d'abonnement
   */
  async getSubscriptionInfo(): Promise<SubscriptionInfo> {
    try {
      const response = await apiClient.get<SubscriptionInfo>(STRIPE_ROUTES.SUBSCRIPTION_INFO);
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  /**
   * Annuler l'abonnement
   * @param immediately - Annuler immédiatement ou à la fin de la période
   * @returns Message de confirmation
   */
  async cancelSubscription(immediately: boolean = false): Promise<{ message: string }> {
    try {
      const response = await apiClient.post(STRIPE_ROUTES.CANCEL_SUBSCRIPTION, { immediately });
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  /**
   * Ouvre le Stripe Customer Portal (gestion abonnement + factures) et redirige.
   */
  async openBillingPortal(): Promise<void> {
    try {
      const returnUrl = typeof window !== "undefined" ? window.location.href : undefined;
      const response = await apiClient.post<{ data: { url: string } }>(BILLING_ROUTES.PORTAL, { returnUrl });
      const url = response.data.data.url;
      if (typeof window !== "undefined" && url) window.location.href = url;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },
};
