/**
 * Configuration du client API Axios
 * Client HTTP centralisé avec intercepteurs pour la gestion des tokens
 */

import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from "axios";

/**
 * API URL configuration
 * - SSR (serveur Next.js): utilise NEXT_PUBLIC_API_URL_SSR ou backend:8080 (réseau Docker)
 * - CSR (navigateur): utilise NEXT_PUBLIC_API_URL ou localhost:8080 (hôte)
 */
const API_URL = typeof window === "undefined" 
  ? (process.env.NEXT_PUBLIC_API_URL_SSR || "http://backend:8080/api") // Server-side
  : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api");  // Client-side

/**
 * Instance Axios configurée pour les appels API
 */
export const apiClient: AxiosInstance = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 10000, // 10 secondes
  withCredentials: false, // Modifier à true si cookies nécessaires
});

/**
 * Intercepteur pour ajouter le token JWT aux requêtes
 */
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Récupérer le token depuis localStorage
    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
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
        const refreshToken = typeof window !== "undefined" ? localStorage.getItem("refreshToken") : null;
        
        if (refreshToken) {
          const response = await axios.post(`${API_URL}/auth/refresh`, {
            refreshToken,
          });
          
          const { accessToken } = response.data;
          
          // Sauvegarder le nouveau token
          if (typeof window !== "undefined") {
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
        if (typeof window !== "undefined") {
          localStorage.removeItem("accessToken");
          localStorage.removeItem("refreshToken");
          localStorage.removeItem("user");
          window.location.href = "/auth/login";
        }
        
        return Promise.reject(refreshError);
      }
    }
    
    return Promise.reject(error);
  }
);

/**
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
