import { create } from "zustand";

import { desktopBridge, type DesktopGitHubRepo, type DesktopToolsStatus } from "../desktop";

// ---------------------------------------------------------------------------
// Store des outils de la personne dans l'app desktop : Claude Code, git et GitHub CLI (cf. desktop/src/tools.ts et
// github.ts). Le runner les emploie pour les tâches déléguées ; l'écran dit ce qui est prêt et mène aux gestes
// manquants (se connecter à GitHub, choisir ou créer un dépôt). Hors de l'app desktop, rien ne se passe.
// Erreurs avalées (renvoie null/false, message dans `error`), l'appelant branche sur le retour.
// ---------------------------------------------------------------------------

const NOT_IN_APP = "Only available in the TaskForce desktop app";

interface DesktopToolsState {
  /** `null` = pas encore lu. */
  status: DesktopToolsStatus | null;
  checking: boolean;
  /** Dépôts GitHub de la personne. `null` = pas encore lus. */
  repos: DesktopGitHubRepo[] | null;
  /** Code à usage unique de la connexion GitHub en cours, à saisir sur github.com. */
  signInCode: string | null;
  error: string | null;

  refresh: () => Promise<DesktopToolsStatus | null>;
  fetchRepos: () => Promise<DesktopGitHubRepo[] | null>;
  /**
   * Dépôt prêt à lier : créé (`create`) ou vérifié (`link` : il existe et la personne peut y pousser). Rend son
   * `owner/name`.
   */
  resolveRepo: (mode: "create" | "link", name: string, isPrivate: boolean) => Promise<string | null>;
  /** Lance la connexion GitHub ; la fin arrive seule (statut relu, dépôts chargés). */
  startGitHubSignIn: () => Promise<boolean>;
  openGitHubSignInPage: () => void;
  cancelGitHubSignIn: () => void;
}

export const useDesktopToolsStore = create<DesktopToolsState>((set, get) => ({
  status: null,
  checking: false,
  repos: null,
  signInCode: null,
  error: null,

  refresh: async () => {
    const bridge = desktopBridge();
    if (!bridge) return null;
    set({ checking: true });
    try {
      const status = await bridge.tools.status();
      set({ status, checking: false });
      return status;
    } catch {
      set({ checking: false });
      return null;
    }
  },

  fetchRepos: async () => {
    const bridge = desktopBridge();
    if (!bridge) return null;
    try {
      const result = await bridge.github.repos();
      if (!result.ok) {
        set({ error: result.error });
        return null;
      }
      set({ repos: result.value });
      return result.value;
    } catch {
      return null;
    }
  },

  resolveRepo: async (mode, name, isPrivate) => {
    const bridge = desktopBridge();
    if (!bridge) {
      set({ error: NOT_IN_APP });
      return null;
    }
    try {
      if (mode === "create") {
        const created = await bridge.github.createRepo({ name, private: isPrivate });
        if (!created.ok) {
          set({ error: created.error });
          return null;
        }
        set({ repos: null }); // la liste se relit avec le nouveau dépôt
        return created.value;
      }
      const found = await bridge.github.repo(name);
      if (!found.ok) {
        set({ error: found.error });
        return null;
      }
      if (!found.value) {
        set({ error: `${name} doesn't exist, or your GitHub account can't see it` });
        return null;
      }
      if (!found.value.canPush) {
        set({ error: `Your GitHub account can't push to ${found.value.fullName}: Claude Code couldn't open pull requests there` });
        return null;
      }
      return found.value.fullName;
    } catch {
      set({ error: "GitHub didn't answer. Please try again." });
      return null;
    }
  },

  startGitHubSignIn: async () => {
    const bridge = desktopBridge();
    if (!bridge) return false;
    try {
      const started = await bridge.github.signIn();
      if (!started.ok) {
        set({ error: started.error });
        return false;
      }
      set({ signInCode: started.value, error: null });
      void bridge.github.waitForSignIn().then(async (outcome) => {
        // Une connexion relancée ou annulée entre-temps a déjà effacé (ou remplacé) le code.
        if (get().signInCode !== started.value) return;
        set({ signInCode: null, error: outcome.ok ? null : outcome.error });
        if (outcome.ok) {
          await get().refresh();
          await get().fetchRepos();
        }
      });
      return true;
    } catch {
      return false;
    }
  },

  openGitHubSignInPage: () => {
    void desktopBridge()?.github.openSignInPage();
  },

  cancelGitHubSignIn: () => {
    set({ signInCode: null });
    void desktopBridge()?.github.cancelSignIn();
  },
}));
