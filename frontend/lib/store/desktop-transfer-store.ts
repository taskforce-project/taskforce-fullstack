import { create } from "zustand";

import { desktopBridge, type DesktopMovedProject, type DesktopProjectMove, type DesktopWebWorkspace } from "../desktop";

// ---------------------------------------------------------------------------
// Store des déplacements de projets entre la webapp et l'app desktop (cf. desktop/src/transfer.ts) : les projets de la
// personne dans la webapp, et la copie d'un projet d'un côté à l'autre. Hors de l'app desktop, rien ne se passe.
// Erreurs avalées (renvoie null, message dans `error`), l'appelant branche sur le retour.
// ---------------------------------------------------------------------------

const NOT_IN_APP = "Only available in the TaskForce desktop app";

/** Clé d'un projet en cours de copie : `<espace>/<projet>`. */
export const moveKey = (move: Pick<DesktopProjectMove, "workspace" | "projectId">): string =>
  `${move.workspace}/${move.projectId}`;

interface DesktopTransferState {
  /** Espaces de la personne dans la webapp et leurs projets. `null` = pas encore lus. */
  webWorkspaces: DesktopWebWorkspace[] | null;
  loading: boolean;
  /** Copie en cours (clé `moveKey`), une à la fois. */
  moving: string | null;
  /** Projets déjà copiés pendant cette session de l'app, par clé d'origine. */
  moved: Record<string, DesktopMovedProject>;
  error: string | null;

  fetchWebProjects: () => Promise<DesktopWebWorkspace[] | null>;
  /** Copie un projet de la webapp dans un espace de l'ordinateur. */
  bring: (move: DesktopProjectMove) => Promise<DesktopMovedProject | null>;
  /** Copie un projet de l'ordinateur dans un espace de la webapp. */
  send: (move: DesktopProjectMove) => Promise<DesktopMovedProject | null>;
  openWeb: (url: string) => void;
}

export const useDesktopTransferStore = create<DesktopTransferState>((set, get) => {
  async function move(
    kind: "bring" | "send",
    request: DesktopProjectMove,
  ): Promise<DesktopMovedProject | null> {
    const bridge = desktopBridge();
    if (!bridge) {
      set({ error: NOT_IN_APP });
      return null;
    }
    if (get().moving) return null;
    const key = moveKey(request);
    set({ moving: key, error: null });
    try {
      const result = await bridge.projects[kind](request);
      if (!result.ok) {
        set({ moving: null, error: result.error });
        return null;
      }
      set((state) => ({ moving: null, moved: { ...state.moved, [key]: result.value } }));
      return result.value;
    } catch (err) {
      set({ moving: null, error: err instanceof Error ? err.message : "The project wasn't copied" });
      return null;
    }
  }

  return {
    webWorkspaces: null,
    loading: false,
    moving: null,
    moved: {},
    error: null,

    fetchWebProjects: async () => {
      const bridge = desktopBridge();
      if (!bridge) {
        set({ error: NOT_IN_APP });
        return null;
      }
      set({ loading: true, error: null });
      try {
        const result = await bridge.projects.web();
        if (!result.ok) {
          set({ loading: false, error: result.error });
          return null;
        }
        set({ loading: false, webWorkspaces: result.value });
        return result.value;
      } catch (err) {
        set({ loading: false, error: err instanceof Error ? err.message : "The web app didn't answer" });
        return null;
      }
    },

    bring: (request) => move("bring", request),
    send: (request) => move("send", request),

    openWeb: (url) => {
      void desktopBridge()?.projects.openWeb(url);
    },
  };
});
