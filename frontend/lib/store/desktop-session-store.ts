import { create } from "zustand";

import { getErrorMessage } from "../api/client";
import {
  authorizeDesktopApp,
  listDesktopSessions,
  revokeDesktopSession,
  type DesktopAuthorization,
  type DesktopSession,
} from "../api/desktop-session-service";

// ---------------------------------------------------------------------------
// Store des sessions de l'app desktop : l'accord donné sur /auth/desktop et les ordinateurs connectés (réglages de
// sécurité). Un domaine = un store. Erreurs avalées (renvoie null/false, message dans `error`).
// ---------------------------------------------------------------------------

interface DesktopSessionState {
  /** Ordinateurs connectés. `null` = pas encore lus. */
  sessions: DesktopSession[] | null;
  error: string | null;

  /** Accord à l'app desktop : l'adresse de retour de l'app, avec son code, ou null. */
  authorize: (request: DesktopAuthorization) => Promise<string | null>;
  fetchSessions: () => Promise<DesktopSession[] | null>;
  revokeSession: (sessionId: number) => Promise<boolean>;
}

export const useDesktopSessionStore = create<DesktopSessionState>((set) => ({
  sessions: null,
  error: null,

  authorize: async (request) => {
    try {
      const redirectUrl = await authorizeDesktopApp({
        codeChallenge: request.codeChallenge,
        redirectUri: request.redirectUri,
        state: request.state,
      });
      set({ error: null });
      return redirectUrl;
    } catch (err) {
      set({ error: getErrorMessage(err) });
      return null;
    }
  },

  fetchSessions: async () => {
    try {
      const sessions = await listDesktopSessions();
      set({ sessions });
      return sessions;
    } catch {
      return null;
    }
  },

  revokeSession: async (sessionId) => {
    try {
      await revokeDesktopSession(sessionId);
      set((state) => ({ sessions: (state.sessions ?? []).filter((s) => s.id !== sessionId), error: null }));
      return true;
    } catch (err) {
      set({ error: getErrorMessage(err) });
      return false;
    }
  },
}));
