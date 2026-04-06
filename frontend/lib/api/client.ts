/**
 * Configuration du client API Axios
 * Client HTTP centralisé avec intercepteurs pour la gestion des tokens
 */

import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from "axios";
import { toast } from "sonner";

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
  timeout: 10000, // 10 secondes
  withCredentials: true, // Activé pour accepter les cookies HttpOnly JWT
});

/**
 * Intercepteur pour ajouter le token JWT aux requêtes
 * Exclut les endpoints publics qui ne nécessitent pas d'authentification
 */
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Liste des endpoints publics qui ne doivent PAS avoir de token
    const publicEndpoints = ["/api/auth/", "/api/sales/"];
    
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
    
    // Si erreur 401 et pas déjà retryé
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      try {
        // Tentative de refresh du token
        const refreshToken = globalThis.window !== undefined ? localStorage.getItem("refreshToken") : null;
        
        if (refreshToken) {
          const response = await axios.post(`${API_URL}/auth/refresh`, {
            refreshToken,
          });
          
          const { accessToken } = response.data;
          
          // Sauvegarder le nouveau token
          if (globalThis.window !== undefined) {
            localStorage.setItem("accessToken", accessToken);
          }
          
          // Retry la requête originale avec le nouveau token
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          }
          
          return apiClient(originalRequest);
        }
      } catch (refreshError) {
        // Si le refresh échoue, déconnecter l'utilisateur
        if (globalThis.window !== undefined) {
          localStorage.removeItem("accessToken");
          localStorage.removeItem("refreshToken");
          localStorage.removeItem("user");
          window.location.href = "/auth/login";
        }
        
        return Promise.reject(refreshError);
      }
    }

    // Show toast for non-401 errors (and 401 that could not be refreshed)
    if (globalThis.window !== undefined) {
      const status = error.response?.status
      const data = error.response?.data as { message?: string } | undefined
      const message = data?.message || error.message || "Une erreur est survenue"

      if (status === 403) {
        toast.error("Accès refusé", { description: message })
      } else if (status === 404) {
        // 404 are usually silent (handled per-feature)
      } else if (status && status >= 500) {
        toast.error("Erreur serveur", { description: `${status} — ${message}` })
      } else if (status && status >= 400) {
        toast.error("Requête invalide", { description: message })
      } else if (!error.response) {
        toast.error("Impossible de contacter le serveur", {
          description: "Vérifiez votre connexion réseau.",
        })
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
