/**
 * Service d'authentification
 * Centralise tous les appels API liés à l'authentification
 */

import { apiClient, getErrorMessage } from "./client";
import type { LoginCredentials, RegisterCredentials, AuthUser } from "../auth";

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
      const response = await apiClient.post<AuthResponse>("/auth/login", credentials);
      
      // Sauvegarder les tokens et l'utilisateur dans localStorage
      if (typeof window !== "undefined") {
        localStorage.setItem("accessToken", response.data.accessToken);
        localStorage.setItem("refreshToken", response.data.refreshToken);
        localStorage.setItem("user", JSON.stringify(response.data.user));
      }
      
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  /**
   * Inscription utilisateur (Étape 1)
   * @param data - Données d'inscription
   * @returns ID utilisateur et email
   */
  async register(data: RegisterCredentials): Promise<{ userId: string; email: string }> {
    try {
      const response = await apiClient.post("/auth/register", data);
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  /**
   * Sélection du plan (Étape 2)
   * @param userId - ID utilisateur
   * @param plan - Type de plan (FREE, PRO, ENTERPRISE)
   * @returns URL Stripe si plan payant
   */
  async selectPlan(userId: string, plan: string): Promise<{
    userId: string;
    plan: string;
    stripeCheckoutUrl?: string;
    message: string;
  }> {
    try {
      const response = await apiClient.post("/auth/register/plan", { userId, plan });
      return response.data;
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
      const response = await apiClient.post<VerifyOtpResponse>("/auth/verify-otp", {
        email,
        otpCode: otp,
      });
      
      // Si vérification réussie et tokens fournis, les sauvegarder
      if (response.data.authData) {
        if (typeof window !== "undefined") {
          localStorage.setItem("accessToken", response.data.authData.accessToken);
          localStorage.setItem("refreshToken", response.data.authData.refreshToken);
          localStorage.setItem("user", JSON.stringify(response.data.authData.user));
        }
      }
      
      return response.data;
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
      const response = await apiClient.post<OtpResponse>("/auth/resend-otp", { email });
      return response.data;
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
      const response = await apiClient.post("/auth/forgot-password", { email });
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  /**
   * Réinitialisation du mot de passe
   * @param token - Token de réinitialisation
   * @param password - Nouveau mot de passe
   * @returns Message de confirmation
   */
  async resetPassword(token: string, password: string): Promise<{ message: string }> {
    try {
      const response = await apiClient.post("/auth/reset-password", { token, password });
      return response.data;
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
      const response = await apiClient.post("/auth/refresh", { refreshToken });
      
      // Sauvegarder le nouveau token
      if (typeof window !== "undefined") {
        localStorage.setItem("accessToken", response.data.accessToken);
      }
      
      return response.data;
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
