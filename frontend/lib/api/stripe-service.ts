/**
 * Service Stripe
 * Gestion des paiements et abonnements
 */

import { apiClient, getErrorMessage } from "./client";

/**
 * Réponse de création de session Stripe
 */
export interface CheckoutSessionResponse {
  sessionId: string;
  checkoutUrl: string;
}

/**
 * Réponse d'informations d'abonnement
 */
export interface SubscriptionInfo {
  id: number;
  userId: number;
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
      
      const response = await apiClient.post<CheckoutSessionResponse>("/stripe/create-checkout", {
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
      const response = await apiClient.get<SubscriptionInfo>("/stripe/subscription");
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
      const response = await apiClient.post("/stripe/cancel", { immediately });
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },
};
