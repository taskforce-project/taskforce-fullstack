import { create } from "zustand";

import { getErrorMessage } from "../api/client";
import {
  listPasskeys,
  passkeyRegistrationOptions,
  registerPasskey,
  removePasskey,
  type Passkey,
} from "../api/passkey-service";
import { createPasskey, passkeyLabel, PasskeyError } from "../auth/passkeys";

// ---------------------------------------------------------------------------
// Store des passkeys du compte (réglages de sécurité). Un domaine = un store. Erreurs avalées (renvoie null/false,
// message dans `error`) ; une personne qui ferme la fenêtre du navigateur n'est pas une erreur.
// ---------------------------------------------------------------------------

interface PasskeyState {
  /** Passkeys du compte, la plus récente d'abord. `null` = pas encore lues. */
  passkeys: Passkey[] | null;
  error: string | null;

  fetchPasskeys: () => Promise<Passkey[] | null>;
  /** Crée une passkey sur cet appareil et l'enregistre. Null si la personne renonce (`error` vide) ou en cas d'échec. */
  addPasskey: () => Promise<Passkey | null>;
  removePasskey: (passkeyId: string) => Promise<boolean>;
}

export const usePasskeyStore = create<PasskeyState>((set) => ({
  passkeys: null,
  error: null,

  fetchPasskeys: async () => {
    try {
      const passkeys = await listPasskeys();
      set({ passkeys });
      return passkeys;
    } catch {
      return null;
    }
  },

  addPasskey: async () => {
    set({ error: null });
    try {
      const options = await passkeyRegistrationOptions();
      const credential = await createPasskey(options);
      if (!credential) return null;
      const passkey = await registerPasskey(passkeyLabel(credential.authenticatorAttachment, navigator.userAgent), credential);
      set((state) => ({ passkeys: [passkey, ...(state.passkeys ?? [])] }));
      return passkey;
    } catch (err) {
      set({ error: err instanceof PasskeyError ? err.message : getErrorMessage(err) });
      return null;
    }
  },

  removePasskey: async (passkeyId) => {
    try {
      await removePasskey(passkeyId);
      set((state) => ({ passkeys: (state.passkeys ?? []).filter((p) => p.id !== passkeyId), error: null }));
      return true;
    } catch (err) {
      set({ error: getErrorMessage(err) });
      return false;
    }
  },
}));
