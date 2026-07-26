import { create } from "zustand";
import type { AuthUser } from "../auth";
import { completeOnboarding, getMe, updateMe, type UpdateUserPayload } from "../api/user-service";

interface UserState {
  user: AuthUser | null;
  isLoading: boolean;

  setUser: (user: AuthUser | null) => void;
  clearUser: () => void;

  /**
   * Récupère le profil de l'utilisateur connecté depuis le backend.
   * À appeler après login et au mount si un token est présent.
   */
  fetchMe: () => Promise<AuthUser | null>;

  /**
   * Met à jour le displayName et/ou l'avatarUrl de l'utilisateur connecté.
   */
  updateProfile: (payload: UpdateUserPayload) => Promise<AuthUser | null>;

  /**
   * Clôt l'onboarding (rôle + drapeau) et met à jour l'utilisateur en mémoire.
   */
  finishOnboarding: (jobTitle?: string) => Promise<AuthUser | null>;
}

export const useUserStore = create<UserState>((set) => ({
  user: null,
  isLoading: false,

  setUser: (user) => set({ user }),

  clearUser: () => set({ user: null }),

  fetchMe: async () => {
    set({ isLoading: true });
    try {
      const user = await getMe();
      set({ user, isLoading: false });
      return user;
    } catch {
      set({ isLoading: false });
      return null;
    }
  },

  updateProfile: async (payload) => {
    set({ isLoading: true });
    try {
      const user = await updateMe(payload);
      set({ user, isLoading: false });
      return user;
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  finishOnboarding: async (jobTitle) => {
    const user = await completeOnboarding(jobTitle);
    set({ user });
    return user;
  },
}));
