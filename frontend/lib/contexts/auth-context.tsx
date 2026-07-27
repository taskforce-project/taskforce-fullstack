/**
 * Context d'authentification
 * Gestion globale de l'état d'authentification dans l'application
 */

"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { authService } from "../api/auth-service";
import { useUserStore } from "../store/user-store";
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
  refreshUser: () => Promise<void>;
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
  const pathname = usePathname();
  const { fetchMe, setUser: setStoreUser, clearUser } = useUserStore();

  /**
   * Initialisation — lit le token en localStorage puis charge le profil depuis le backend.
   * Si le token est absent ou expiré, reste non-authentifié.
   */
  useEffect(() => {
    const initAuth = async () => {
      const hasToken = authService.isAuthenticated();
      if (!hasToken) {
        setIsLoading(false);
        return;
      }
      // Tenter de récupérer le profil complet depuis le backend
      const remoteUser = await fetchMe();
      if (remoteUser) {
        setUser(remoteUser);
      } else {
        // Token invalide ou expiré → fallback sur localStorage
        const localUser = authService.getCurrentUser();
        setUser(localUser);
      }
      setIsLoading(false);
    };

    initAuth();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Redirections post-authentification : garde d'onboarding + sortie de la page login.
   *
   * <p><b>Garde d'onboarding</b> : tant que le parcours n'est pas franchi
   * ({@code onboardingCompleted === false}), on force le wizard `/onboarding` — sauf si on y est déjà,
   * ou sur une page d'auth (l'inscription/OAuth est en cours, le rappel gère lui-même la suite). Le
   * test est strictement {@code === false} : si le drapeau est inconnu (ancien cache, réponse
   * partielle), on ne bloque personne. Le wizard, à sa fin, recharge en dur → l'utilisateur revient ici
   * avec {@code onboardingCompleted === true} et n'est plus renvoyé.</p>
   */
  useEffect(() => {
    if (isLoading || !user || globalThis.window === undefined) return;
    const path = pathname ?? globalThis.location.pathname;

    if (user.onboardingCompleted === false && !path.startsWith("/onboarding") && !path.startsWith("/auth")) {
      router.replace("/onboarding");
      return;
    }
    if (path === "/auth/login") {
      router.replace("/");
    }
  }, [user, isLoading, router, pathname]);

  /**
   * Connexion
   */
  const login = async (credentials: LoginCredentials) => {
    try {
      const response = await authService.login(credentials);
      // Setter immédiat depuis la réponse login → redirection rapide, pas de blocage réseau
      setUser(response.user);
      setStoreUser(response.user);
      // Enrichir avec le profil complet en arrière-plan (non bloquant)
      void fetchMe().then((remoteUser) => {
        if (remoteUser) {
          setUser(remoteUser);
          setStoreUser(remoteUser);
        }
      });
      // La redirection est gérée par le composant appelant
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
      clearUser();
      // Reload DUR (window.location) et non router.push : détruit tous les stores Zustand
      // en mémoire (singletons module-level) pour ne pas mélanger les comptes sur un même
      // navigateur (cache stale au switch de compte → 403, erreurs d'intégrations…). QA2.
      window.location.href = "/auth/login";
    } catch (error) {
      // Même en cas d'erreur, déconnecter côté client
      setUser(null);
      clearUser();
      window.location.href = "/auth/login";
      throw error;
    }
  };

  /**
   * Rafraîchir les données utilisateur depuis le backend
   */
  const refreshUser = async () => {
    const remoteUser = await fetchMe();
    if (remoteUser) {
      setUser(remoteUser);
    } else {
      const localUser = authService.getCurrentUser();
      setUser(localUser);
    }
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
