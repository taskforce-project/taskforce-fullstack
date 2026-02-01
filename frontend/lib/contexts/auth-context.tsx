/**
 * Context d'authentification
 * Gestion globale de l'état d'authentification dans l'application
 */

"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { authService } from "../api/auth-service";
import type { AuthUser, LoginCredentials } from "../auth";

/**
 * Type du contexte d'authentification
 */
interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => void;
}

/**
 * Contexte d'authentification
 */
const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Props du provider
 */
interface AuthProviderProps {
  children: ReactNode;
}

/**
 * Provider d'authentification
 * Encapsule l'application pour fournir l'état d'authentification
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  /**
   * Initialisation - Récupère l'utilisateur depuis localStorage
   */
  useEffect(() => {
    const initAuth = () => {
      const currentUser = authService.getCurrentUser();
      setUser(currentUser);
      setIsLoading(false);
    };

    initAuth();
  }, []);

  /**
   * Connexion
   */
  const login = async (credentials: LoginCredentials) => {
    try {
      const response = await authService.login(credentials);
      setUser(response.user);
      
      // Redirection vers dashboard
      router.push("/dashboard");
    } catch (error) {
      setUser(null);
      throw error;
    }
  };

  /**
   * Déconnexion
   */
  const logout = async () => {
    try {
      await authService.logout();
      setUser(null);
      
      // Redirection vers login
      router.push("/auth/login");
    } catch (error) {
      // Même en cas d'erreur, déconnecter côté client
      setUser(null);
      router.push("/auth/login");
      throw error;
    }
  };

  /**
   * Rafraîchir les données utilisateur
   */
  const refreshUser = () => {
    const currentUser = authService.getCurrentUser();
    setUser(currentUser);
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook pour utiliser le contexte d'authentification
 * @returns Contexte d'authentification
 * @throws Error si utilisé hors du AuthProvider
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  
  if (context === undefined) {
    throw new Error("useAuth doit être utilisé à l'intérieur d'un AuthProvider");
  }
  
  return context;
}

/**
 * Hook pour vérifier l'authentification et rediriger si nécessaire
 * @param redirectTo - URL de redirection si non authentifié (par défaut: /auth/login)
 */
export function useRequireAuth(redirectTo: string = "/auth/login") {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push(redirectTo);
    }
  }, [isAuthenticated, isLoading, redirectTo, router]);

  return { isAuthenticated, isLoading };
}
