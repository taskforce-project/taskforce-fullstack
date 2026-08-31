/**
 * Configuration du client API Axios
 * Client HTTP centralisé avec intercepteurs pour la gestion des tokens
 */

import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from "axios";
import { toast } from "sonner";
import { API_URL, API_URL_SSR } from "@/lib/config/urls";

/**
 * Extension de la config Axios : `silentError` supprime le toast global (réseau/5xx).
 * À poser sur les appels de FOND (polling, préchargement, badges) qui ne doivent jamais
 * alarmer l'utilisateur s'ils échouent - seule une action explicite mérite un toast.
 */
declare module "axios" {
  interface AxiosRequestConfig {
    silentError?: boolean;
  }
}

/**
 * URL de base de l'API (origines dérivées d'un domaine unique dans `lib/config/urls.ts`) :
 * - SSR (serveur Next) : `API_URL_SSR` - nom de service Docker en mono-hôte, URL publique en multi-VM.
 * - CSR (navigateur) : `API_URL` - hôte public (prod) ou localhost (dev).
 */
const BASE_URL = globalThis.window === undefined ? API_URL_SSR : API_URL;

/**
 * Instance Axios configurée pour les appels API
 */
export const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30000, // 30s - backend dev (JVM froide + debug JDWP) dépasse souvent 10s au login
  withCredentials: true, // Activé pour accepter les cookies HttpOnly JWT
});

/**
 * Timeout dédié aux appels **génératifs** (LLM local Ollama) - spec, décision, agent.
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
 * Single-flight du refresh : une seule requête `/api/auth/refresh-token` en vol à la fois,
 * partagée par TOUS les appels qui prennent un 401 en même temps. Sans ce partage, N requêtes
 * expirées lançaient N refresh ; or Keycloak fait tourner le refresh token
 * (revokeRefreshToken=true, maxReuse=0) → les refresh en trop réutilisent un token déjà tourné
 * → réutilisation détectée → session révoquée → déconnexion parasite. Renvoie le nouvel access
 * token, ou `null` si aucun refresh token n'est disponible.
 */
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  // Le refresh token vit dans un cookie HttpOnly, envoyé automatiquement (`withCredentials`).
  // Repli de transition : une session créée AVANT la migration a encore le token en localStorage
  // → on l'envoie une dernière fois dans le corps (le backend l'accepte), puis on le purge une
  // fois que le cookie a pris le relais.
  const legacy = globalThis.window !== undefined ? localStorage.getItem("refreshToken") : null;
  const body = legacy ? { refreshToken: legacy } : {};
  // `axios` brut (pas `apiClient`) → la requête de refresh ne re-traverse pas cet intercepteur ;
  // `withCredentials` pour que le cookie HttpOnly parte avec la requête.
  const response = await axios.post(`${API_URL}/api/auth/refresh-token`, body, { withCredentials: true });
  const authData = response.data?.data ?? response.data;
  const accessToken: string | undefined = authData?.accessToken;
  if (globalThis.window !== undefined && accessToken) {
    localStorage.setItem("accessToken", accessToken);
    localStorage.removeItem("refreshToken"); // le cookie prend le relais
  }
  return accessToken ?? null;
}

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
    // (les 401 des endpoints auth - ex. mauvais mot de passe - sont laissés au formulaire)
    if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      originalRequest._retry = true;
      try {
        // Single-flight : tous les 401 concurrents partagent le MÊME appel de refresh
        // (voir refreshAccessToken ci-dessus) ; `finally` libère le verrou pour la salve suivante.
        refreshInFlight = refreshInFlight ?? refreshAccessToken().finally(() => { refreshInFlight = null; });
        const newAccessToken = await refreshInFlight;

        if (!newAccessToken) {
          // Pas de refresh token → session simplement expirée : redirection silencieuse.
          clearSessionAndRedirect();
          return Promise.reject(error);
        }

        // Retry la requête originale avec le nouveau token.
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        }
        return apiClient(originalRequest);
      } catch (refreshError) {
        // Refresh échoué (token rejeté/expiré) → déconnexion silencieuse (pas de toast).
        clearSessionAndRedirect();
        return Promise.reject(refreshError);
      }
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
      const message = data?.message || error.message || "Something went wrong"
      // Appels de fond (polling, préchargement) : on ne toast jamais, on trace seulement.
      const silent = Boolean(error.config?.silentError)

      if (!error.response) {
        // Réseau / timeout : `id` stable → un seul toast à la fois (pas d'empilement de doublons).
        if (silent) {
          console.warn(`[api] réseau/timeout (silencieux) ${error.config?.url ?? ""} - ${message}`)
        } else {
          toast.error("Couldn't reach the server", {
            id: "api-network-error",
            description: "Check your network connection.",
          })
        }
      } else if (status && status >= 500) {
        if (silent) {
          console.warn(`[api] ${status} (silencieux) ${error.config?.url ?? ""} - ${message}`)
        } else {
          toast.error("Server error", { id: "api-server-error", description: `${status} - ${message}` })
        }
      } else if (status === 429) {
        // Exception au principe « 4xx = contextuel » : le 429 n'est pas lié à l'action en cours,
        // il frappe TOUS les appels de l'onglet pendant la fenêtre. Sans message dédié, l'appli
        // paraissait simplement figée (les stores avalent l'erreur en silence). `id` stable →
        // un seul toast même quand une rafale d'appels est rejetée d'un coup.
        const retryAfter = Number(error.response?.headers?.["retry-after"])
        const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? `${retryAfter}s` : "a few seconds"
        console.warn(`[api] 429 ${error.config?.url ?? ""} - retry after ${wait}`)
        if (!silent) {
          toast.warning("Too many requests", {
            id: "api-rate-limit",
            description: `You've hit the rate limit. Try again in ${wait}.`,
          })
        }
      } else if (status && status >= 400) {
        // 4xx contextuel : pas de toast global - l'appelant décide. Trace console pour le dev.
        console.warn(`[api] ${status} ${error.config?.url ?? ""} - ${message}`)
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

/**
 * Code HTTP d'une erreur Axios (`undefined` si erreur réseau/timeout ou non-Axios).
 * Permet à un appelant de distinguer un cas métier précis (ex. 409 quota IA atteint)
 * du repli générique, sans dépendre directement d'Axios dans le composant.
 */
export function getErrorStatus(error: unknown): number | undefined {
  return axios.isAxiosError(error) ? error.response?.status : undefined;
}
