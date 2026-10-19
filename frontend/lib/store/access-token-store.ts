import { create } from "zustand";

import {
  createAccessToken,
  listAccessTokens,
  revokeAccessToken,
  type AccessToken,
  type CreatedAccessToken,
} from "../api/access-token-service";

// ---------------------------------------------------------------------------
// Store des jetons personnels (lot 5). Un domaine = un store.
// Erreurs avalées (renvoie null/false), l'appelant branche sur le retour.
// ---------------------------------------------------------------------------

interface AccessTokenState {
  /** Jetons non révoqués, sans leur valeur. `null` = pas encore chargés. */
  tokens: AccessToken[] | null;

  fetchTokens: () => Promise<AccessToken[] | null>;
  /** Rend la valeur à l'appelant SANS la garder : un jeton ne vit pas dans l'état global. */
  createToken: (name: string, expiresInDays: number | null) => Promise<CreatedAccessToken | null>;
  revokeToken: (tokenId: number) => Promise<boolean>;
}

export const useAccessTokenStore = create<AccessTokenState>((set) => ({
  tokens: null,

  fetchTokens: async () => {
    try {
      const tokens = await listAccessTokens();
      set({ tokens });
      return tokens;
    } catch {
      return null;
    }
  },

  createToken: async (name, expiresInDays) => {
    try {
      const created = await createAccessToken(name, expiresInDays);
      set((state) => ({ tokens: [created.token, ...(state.tokens ?? [])] }));
      return created;
    } catch {
      return null;
    }
  },

  revokeToken: async (tokenId) => {
    try {
      await revokeAccessToken(tokenId);
      set((state) => ({ tokens: (state.tokens ?? []).filter((t) => t.id !== tokenId) }));
      return true;
    } catch {
      return false;
    }
  },
}));
