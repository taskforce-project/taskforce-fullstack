/**
 * Service d'authentification
 * Centralise tous les appels API liés à l'authentification
 */

import { apiClient, getErrorMessage } from "./client";
import type { LoginCredentials, RegisterCredentials, AuthUser } from "../auth";
import { AUTH_ROUTES } from "../config/api-routes";

/**
 * Réponse d'authentification (login/register)
 */
export interface AuthResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  message?: string;
}

/**
 * Réponse OTP
 */
export interface OtpResponse {
  message: string;
  expiresIn?: number;
  checkoutSessionUrl?: string;
}

/**
 * Réponse de vérification OTP
 */
export interface VerifyOtpResponse {
  verified: boolean;
  message: string;
  authData?: AuthResponse;
  checkoutSessionUrl?: string;
}

/**
 * Service d'authentification
 */
export const authService = {
  /**
   * Connexion utilisateur
   * @param credentials - Email et mot de passe
   * @returns Données utilisateur et tokens
   */
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    try {
      const response = await apiClient.post<{ success: boolean; message: string; data: AuthResponse }>(AUTH_ROUTES.LOGIN, credentials);
      
      // Le backend renvoie { success, message, data: AuthResponse }
      const authData = response.data.data;
      
      // Sauvegarder les tokens et l'utilisateur dans localStorage
      if (typeof window !== "undefined") {
        localStorage.setItem("accessToken", authData.accessToken);
        localStorage.setItem("refreshToken", authData.refreshToken);
        localStorage.setItem("user", JSON.stringify(authData.user));
      }
      
      return authData;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  /**
   * Inscription utilisateur (Étape 1)
   * @param data - Données d'inscription avec plan
   * @returns ID utilisateur et email
   */
  async register(data: RegisterCredentials): Promise<{ userId: string; email: string }> {
    try {
      const response = await apiClient.post<{ success: boolean; message: string; data: any }>(AUTH_ROUTES.REGISTER, data);
      return response.data.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  /**
   * Sélection du plan (Étape 2)
   * @param email - Email utilisateur
   * @param planType - Type de plan (FREE, PRO, ENTERPRISE)
   * @returns URL Stripe si plan payant
   */
  async selectPlan(email: string, planType: string): Promise<{
    email: string;
    planType: string;
    stripeCheckoutUrl?: string;
    message: string;
  }> {
    try {
      const response = await apiClient.post<{ success: boolean; message: string; data: any }>(AUTH_ROUTES.SELECT_PLAN, { email, planType });
      return response.data.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  /**
   * Vérification du code OTP (Étape 3)
   * @param email - Email utilisateur
   * @param otp - Code OTP à 6 chiffres
   * @returns Données d'authentification si succès
   */
  async verifyOtp(email: string, otp: string): Promise<VerifyOtpResponse> {
    try {
      const response = await apiClient.post<{ success: boolean; message: string; data: VerifyOtpResponse }>(AUTH_ROUTES.VERIFY_OTP, {
        email,
        otpCode: otp,
      });
      
      const otpData = response.data.data;
      
      // Si vérification réussie et tokens fournis, les sauvegarder
      if (otpData.authData) {
        if (typeof window !== "undefined") {
          localStorage.setItem("accessToken", otpData.authData.accessToken);
          localStorage.setItem("refreshToken", otpData.authData.refreshToken);
          localStorage.setItem("user", JSON.stringify(otpData.authData.user));
        }
      }
      
      return otpData;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  /**
   * Renvoyer un code OTP
   * @param email - Email utilisateur
   * @returns Message de confirmation
   */
  async resendOtp(email: string): Promise<OtpResponse> {
    try {
      const response = await apiClient.post<{ success: boolean; message: string; data: OtpResponse }>(AUTH_ROUTES.RESEND_OTP, { email });
      return response.data.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  /**
   * Demande de réinitialisation de mot de passe
   * @param email - Email utilisateur
   * @returns Message de confirmation
   */
  async forgotPassword(email: string): Promise<{ message: string }> {
    try {
      const response = await apiClient.post<{ success: boolean; message: string; data: any }>(AUTH_ROUTES.FORGOT_PASSWORD, { email });
      return { message: response.data.message || "Email envoyé" };
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  /**
   * Réinitialisation du mot de passe avec code OTP
   * @param email - Email utilisateur
   * @param otpCode - Code OTP à 6 chiffres
   * @param newPassword - Nouveau mot de passe
   * @returns Message de confirmation
   */
  async resetPassword(email: string, otpCode: string, newPassword: string): Promise<{ message: string }> {
    try {
      const response = await apiClient.post<{ success: boolean; message: string; data: any }>(AUTH_ROUTES.RESET_PASSWORD, { 
        email, 
        otpCode, 
        newPassword 
      });
      return { message: response.data.message || "Mot de passe réinitialisé" };
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  /**
   * Refresh du token d'accès
   * @param refreshToken - Token de refresh
   * @returns Nouveau access token
   */
  async refreshToken(refreshToken: string): Promise<{ accessToken: string; expiresIn: number }> {
    try {
      const response = await apiClient.post<{ success: boolean; message: string; data: { accessToken: string; expiresIn: number } }>(AUTH_ROUTES.REFRESH_TOKEN, { refreshToken });
      
      const tokenData = response.data.data;
      
      // Sauvegarder le nouveau token
      if (typeof window !== "undefined") {
        localStorage.setItem("accessToken", tokenData.accessToken);
      }
      
      return tokenData;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  /**
   * Déconnexion
   */
  async logout(): Promise<void> {
    try {
      // Appel API optionnel pour invalider le token côté serveur
      // await apiClient.post("/auth/logout");
      
      // Nettoyer le localStorage
      if (typeof window !== "undefined") {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
        localStorage.removeItem("user");
      }
    } catch (error) {
      // Même en cas d'erreur, nettoyer le localStorage
      if (typeof window !== "undefined") {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
        localStorage.removeItem("user");
      }
      
      throw new Error(getErrorMessage(error));
    }
  },

  /**
   * Récupère l'utilisateur courant depuis localStorage
   * @returns Utilisateur ou null
   */
  getCurrentUser(): AuthUser | null {
    if (typeof window === "undefined") return null;
    
    const userStr = localStorage.getItem("user");
    if (!userStr) return null;
    
    try {
      return JSON.parse(userStr);
    } catch {
      return null;
    }
  },

  /**
   * Vérifie si l'utilisateur est authentifié
   * @returns true si authentifié
   */
  isAuthenticated(): boolean {
    if (typeof window === "undefined") return false;
    
    const token = localStorage.getItem("accessToken");
    const user = localStorage.getItem("user");
    
    return !!(token && user);
  },
};
