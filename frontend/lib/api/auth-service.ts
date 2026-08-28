/**
 * Service d'authentification
 * Centralise tous les appels API liés à l'authentification
 */

import { apiClient, getErrorMessage } from "./client";
import type { LoginCredentials, RegisterCredentials, AuthUser } from "../auth";
import { AUTH_ROUTES } from "../config/api-routes";

/**
 * État des vérifications anti-robot, tel que le serveur le déclare.
 *
 * Le client n'infère rien : c'est le serveur qui dit ce qui est actif et fournit la clé de site.
 * Dupliquer cette configuration côté client la ferait diverger tôt ou tard, et la panne serait
 * silencieuse — widget affiché, vérification systématiquement en échec.
 */
export interface AuthChallenge {
  /** Jeton du défi signé maison, à renvoyer à l'inscription. Vide si le mécanisme est inactif. */
  token: string;
  /** Le défi signé est-il actif côté serveur ? */
  required: boolean;
  /** Clé de site Turnstile (publique). Vide si Turnstile est inactif. */
  turnstileSiteKey: string;
  /** Turnstile est-il actif côté serveur ? */
  turnstileRequired: boolean;
}

/**
 * Réponse d'authentification (login/register)
 */
export interface AuthResponse {
  user: AuthUser;
  accessToken: string;
  /** Absent du corps depuis la migration en cookie HttpOnly (posé par le backend). */
  refreshToken?: string | null;
  expiresIn: number;
  message?: string;
  /** Vrai quand le mot de passe est bon mais qu'un code 2FA est requis : aucun token n'est fourni. */
  twoFactorRequired?: boolean;
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
 * Réponse d'inscription (étape 1)
 */
export interface RegisterResponse {
  userId: string;
  email: string;
}

/**
 * Réponse de sélection de plan (étape 2)
 */
export interface SelectPlanResponse {
  email: string;
  planType: string;
  /** Présent uniquement pour un plan payant : redirection vers Stripe Checkout. */
  stripeCheckoutUrl?: string;
  message: string;
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

      // 2FA requis : le mot de passe est bon mais aucun token n'est émis à ce stade. On ne persiste
      // rien — le formulaire de connexion affiche l'étape « code » et rejoue le login avec `totp`.
      if (authData.twoFactorRequired) {
        return authData;
      }

      // Sauvegarder les tokens et l'utilisateur dans localStorage
      if (typeof window !== "undefined") {
        // Le refresh token n'est plus stocké côté JS : il vit dans un cookie HttpOnly posé par le backend.
        localStorage.setItem("accessToken", authData.accessToken);
        localStorage.setItem("user", JSON.stringify(authData.user));
      }

      return authData;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  /**
   * Défi de vérification humaine, à demander au chargement du formulaire d'inscription.
   *
   * En cas d'échec réseau on renvoie `{ token: "", required: false }` plutôt que de propager :
   * un serveur de défi injoignable ne doit pas empêcher quiconque de s'inscrire. Si le mécanisme est
   * réellement actif côté serveur, l'inscription sera refusée à la soumission avec un motif clair —
   * ce qui est le bon endroit pour le dire.
   */
  async getChallenge(): Promise<AuthChallenge> {
    try {
      const response = await apiClient.get<{
        success: boolean;
        message: string;
        data: AuthChallenge;
      }>(AUTH_ROUTES.CHALLENGE);
      return response.data.data;
    } catch {
      return { token: "", required: false, turnstileSiteKey: "", turnstileRequired: false };
    }
  },

  /**
   * Connexion externe, étape 1 : demander au serveur l'URL vers laquelle envoyer le navigateur.
   *
   * Le client ne construit pas cette URL lui-même : elle porte l'état anti-CSRF, que seul le serveur
   * peut signer. La composer côté navigateur reviendrait à laisser l'appelant choisir sa propre
   * protection.
   */
  async oauthAuthorizeUrl(provider: string, redirectUri: string): Promise<string> {
    try {
      const response = await apiClient.get<{
        success: boolean;
        message: string;
        data: { authUrl: string };
      }>(AUTH_ROUTES.OAUTH_AUTHORIZE(provider), { params: { redirectUri } });
      return response.data.data.authUrl;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  /**
   * Connexion externe, étape 2 : échanger le code d'autorisation contre une session TaskForce.
   *
   * Persiste les jetons exactement comme {@link login} : c'est la même session au bout du compte, et
   * deux façons de la stocker finiraient par diverger.
   */
  async oauthCallback(payload: {
    code: string;
    state: string;
    redirectUri: string;
  }): Promise<AuthResponse> {
    try {
      const response = await apiClient.post<{
        success: boolean;
        message: string;
        data: AuthResponse;
      }>(AUTH_ROUTES.OAUTH_CALLBACK, payload);

      const authData = response.data.data;
      if (typeof window !== "undefined") {
        // Le refresh token n'est plus stocké côté JS : il vit dans un cookie HttpOnly posé par le backend.
        localStorage.setItem("accessToken", authData.accessToken);
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
  async register(data: RegisterCredentials): Promise<RegisterResponse> {
    try {
      const response = await apiClient.post<{ success: boolean; message: string; data: RegisterResponse }>(AUTH_ROUTES.REGISTER, data);
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
  async selectPlan(email: string, planType: string): Promise<SelectPlanResponse> {
    try {
      const response = await apiClient.post<{ success: boolean; message: string; data: SelectPlanResponse }>(AUTH_ROUTES.SELECT_PLAN, { email, planType });
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
          // Refresh token en cookie HttpOnly (posé par le backend), plus en localStorage.
          localStorage.setItem("accessToken", otpData.authData.accessToken);
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
      // Seul `message` est consommé ici : la charge utile `data` reste volontairement non typée
      // (`unknown`) pour signaler qu'elle n'est pas exploitée côté client.
      const response = await apiClient.post<{ success: boolean; message: string; data: unknown }>(AUTH_ROUTES.FORGOT_PASSWORD, { email });
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
      // Idem `forgotPassword` : seule la confirmation textuelle est utilisée.
      const response = await apiClient.post<{ success: boolean; message: string; data: unknown }>(AUTH_ROUTES.RESET_PASSWORD, {
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
    // Révoquer la session Keycloak côté serveur AVANT de purger le localStorage
    // (l'intercepteur attache encore le Bearer). Best-effort : on nettoie le client
    // même si l'appel échoue (session déjà expirée, réseau…). Cf. AUTH-02.
    try {
      await apiClient.post(AUTH_ROUTES.LOGOUT);
    } catch {
      // ignore : la déconnexion côté client doit aboutir dans tous les cas
    }
    if (typeof window !== "undefined") {
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      localStorage.removeItem("user");
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
