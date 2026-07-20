/**
 * Configuration du client API Axios
 * Client HTTP centralisé avec intercepteurs pour la gestion des tokens
 */

import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from "axios";
import { toast } from "sonner";

/**
 * Extension de la config Axios : `silentError` supprime le toast global (réseau/5xx).
 * À poser sur les appels de FOND (polling, préchargement, badges) qui ne doivent jamais
 * alarmer l'utilisateur s'ils échouent — seule une action explicite mérite un toast.
 */
declare module "axios" {
  interface AxiosRequestConfig {
    silentError?: boolean;
  }
}

/**
 * API URL configuration
 * - SSR (serveur Next.js): utilise NEXT_PUBLIC_API_URL_SSR ou backend:8080 (réseau Docker)
 * - CSR (navigateur): utilise NEXT_PUBLIC_API_URL ou localhost:8080 (hôte)
 */
const API_URL = globalThis.window === undefined 
  ? (process.env.NEXT_PUBLIC_API_URL_SSR || "http://backend:8080") // Server-side
  : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080");  // Client-side

/**
 * Instance Axios configurée pour les appels API
 */
export const apiClient: AxiosInstance = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30000, // 30s — backend dev (JVM froide + debug JDWP) dépasse souvent 10s au login
  withCredentials: true, // Activé pour accepter les cookies HttpOnly JWT
});

/**
 * Timeout dédié aux appels **génératifs** (LLM local Ollama) — spec, décision, agent.
 * La génération locale (surtout 14B / démarrage à froid / « Approfondir ») dépasse largement les 30s
 * par défaut. Aligné au-dessus du readTimeout du gateway backend (180s). À passer par requête :
 * `apiClient.post(url, body, { timeout: AI_TIMEOUT_MS })`.
 */
export const AI_TIMEOUT_MS = 200_000;

/**
 * Endpoints publics qui ne nécessitent pas de token JWT
 */
const publicEndpoints = ["/api/auth/", "/api/sales/"];

/**
 * Intercepteur pour ajouter le token JWT aux requêtes
 * Exclut les endpoints publics qui ne nécessitent pas d'authentification
 */
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Vérifier si l'URL correspond à un endpoint public
    const isPublicEndpoint = publicEndpoints.some(endpoint => 
      config.url?.includes(endpoint)
    );
    
    if (isPublicEndpoint) {
      // Supprimer explicitement le header pour les endpoints publics
      // (évite qu'un token expiré soit envoyé par erreur et déclenche un 401)
      if (config.headers) {
        delete config.headers["Authorization"];
      }
    } else {
      // Ajouter le token pour les endpoints protégés
      const token = globalThis.window ? localStorage.getItem("accessToken") : null;
      
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    
    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);

/**
 * Intercepteur pour gérer les erreurs et le refresh des tokens
 */
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    const requestUrl = error.config?.url ?? ""
    const isAuthEndpoint = publicEndpoints.some((ep) => requestUrl.includes(ep))

    // Déconnexion silencieuse (session expirée / refresh impossible) : pas de toast.
    const clearSessionAndRedirect = () => {
      if (globalThis.window !== undefined) {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
        localStorage.removeItem("user");
        window.location.href = "/auth/login";
      }
    };

    // Erreur 401 sur un endpoint protégé, pas déjà retryé.
    // (les 401 des endpoints auth — ex. mauvais mot de passe — sont laissés au formulaire)
    if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      originalRequest._retry = true;

      const refreshToken = globalThis.window !== undefined ? localStorage.getItem("refreshToken") : null;

      if (refreshToken) {
        try {
          // Tentative de refresh du token
          const response = await axios.post(`${API_URL}/api/auth/refresh-token`, {
            refreshToken,
          });

          // Le backend retourne ApiResponse<AuthResponse> : les tokens sont dans response.data.data
          const authData = response.data?.data ?? response.data;
          const { accessToken, refreshToken: newRefreshToken } = authData;

          // Sauvegarder les nouveaux tokens (rotation)
          if (globalThis.window !== undefined) {
            localStorage.setItem("accessToken", accessToken);
            if (newRefreshToken) {
              localStorage.setItem("refreshToken", newRefreshToken);
            }
          }

          // Retry la requête originale avec le nouveau token
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          }

          return apiClient(originalRequest);
        } catch (refreshError) {
          // Refresh échoué → déconnexion silencieuse (pas de toast "Requête invalide")
          clearSessionAndRedirect();
          return Promise.reject(refreshError);
        }
      }

      // Pas de refresh token → session simplement expirée : redirection silencieuse.
      clearSessionAndRedirect();
      return Promise.reject(error);
    }

    // Toast global réservé aux erreurs SYSTÉMIQUES (inattendues, non contextuelles) :
    //   - panne réseau (aucune réponse) et 5xx serveur → l'utilisateur doit être prévenu.
    //   - 4xx = contextuel (validation, autorisation, ressource absente, intégration non
    //     connectée) → géré par l'appelant (formulaire / composant) qui affiche un message
    //     adapté. On NE toast PAS globalement pour éviter faux positifs et doublons ;
    //     on trace quand même en console pour le debug.
    // (Les 401 sont déjà traités plus haut : refresh ou redirection silencieuse.)
    if (globalThis.window !== undefined && !isAuthEndpoint) {
      const status = error.response?.status
      const data = error.response?.data as { message?: string } | undefined
      const message = data?.message || error.message || "Une erreur est survenue"
      // Appels de fond (polling, préchargement) : on ne toast jamais, on trace seulement.
      const silent = Boolean(error.config?.silentError)

      if (!error.response) {
        // Réseau / timeout : `id` stable → un seul toast à la fois (pas d'empilement de doublons).
        if (silent) {
          console.warn(`[api] réseau/timeout (silencieux) ${error.config?.url ?? ""} — ${message}`)
        } else {
          toast.error("Impossible de contacter le serveur", {
            id: "api-network-error",
            description: "Vérifiez votre connexion réseau.",
          })
        }
      } else if (status && status >= 500) {
        if (silent) {
          console.warn(`[api] ${status} (silencieux) ${error.config?.url ?? ""} — ${message}`)
        } else {
          toast.error("Erreur serveur", { id: "api-server-error", description: `${status} — ${message}` })
        }
      } else if (status === 429) {
        // Exception au principe « 4xx = contextuel » : le 429 n'est pas lié à l'action en cours,
        // il frappe TOUS les appels de l'onglet pendant la fenêtre. Sans message dédié, l'appli
        // paraissait simplement figée (les stores avalent l'erreur en silence). `id` stable →
        // un seul toast même quand une rafale d'appels est rejetée d'un coup.
        const retryAfter = Number(error.response?.headers?.["retry-after"])
        const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? `${retryAfter} s` : "quelques secondes"
        console.warn(`[api] 429 ${error.config?.url ?? ""} — retry after ${wait}`)
        if (!silent) {
          toast.warning("Trop de requêtes", {
            id: "api-rate-limit",
            description: `Vous avez atteint la limite. Réessayez dans ${wait}.`,
          })
        }
      } else if (status && status >= 400) {
        // 4xx contextuel : pas de toast global — l'appelant décide. Trace console pour le dev.
        console.warn(`[api] ${status} ${error.config?.url ?? ""} — ${message}`)
      }
    }

    return Promise.reject(error)
  }
);

/**
 * Intercepteur global pour toast d'erreur réseau (no response)
 * Types d'erreurs API
 */
export interface ApiError {
  error: string;
  message: string;
  statusCode?: number;
}

/**
 * Fonction helper pour extraire le message d'erreur
 */
export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const apiError = error.response?.data as ApiError;
    return apiError?.message || error.message || "Une erreur est survenue";
  }
  
  if (error instanceof Error) {
    return error.message;
  }
  
  return "Une erreur inconnue est survenue";
}
