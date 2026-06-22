import { create } from "zustand";
import type { ReactNode } from "react";

/**
 * Socle de panneaux (PROD-8.9) — surfaces ouvrables à gauche/droite, empilables,
 * redimensionnables, qui s'intègrent dans le shell sans changer de page.
 * N'importe quel composant peut ouvrir un panneau via `openPanel`/`togglePanel`.
 */

export type PanelSide = "left" | "right";

export interface PanelDescriptor {
  /** Identifiant stable — réouvrir le même id remplace/focus au lieu de dupliquer. */
  id: string;
  side: PanelSide;
  title: string;
  icon?: ReactNode;
  /** Largeur courante en px (redimensionnable). */
  width: number;
  minWidth: number;
  maxWidth: number;
  content: ReactNode;
}

export interface OpenPanelInput {
  id: string;
  side?: PanelSide;
  title: string;
  icon?: ReactNode;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  content: ReactNode;
}

const DEFAULT_WIDTH = 420;
const DEFAULT_MIN = 320;
const DEFAULT_MAX = 760;

function normalize(input: OpenPanelInput): PanelDescriptor {
  const minWidth = input.minWidth ?? DEFAULT_MIN;
  const maxWidth = input.maxWidth ?? DEFAULT_MAX;
  const width = Math.min(maxWidth, Math.max(minWidth, input.width ?? DEFAULT_WIDTH));
  return {
    id: input.id,
    side: input.side ?? "right",
    title: input.title,
    icon: input.icon,
    width,
    minWidth,
    maxWidth,
    content: input.content,
  };
}

interface PanelState {
  panels: PanelDescriptor[];
  openPanel: (input: OpenPanelInput) => void;
  togglePanel: (input: OpenPanelInput) => void;
  closePanel: (id: string) => void;
  closeAll: () => void;
  setWidth: (id: string, width: number) => void;
  isOpen: (id: string) => boolean;
}

export const usePanelStore = create<PanelState>((set, get) => ({
  panels: [],

  openPanel: (input) => {
    const panel = normalize(input);
    set((s) => {
      const others = s.panels.filter((p) => p.id !== panel.id);
      // Conserver la largeur courante si le panneau était déjà ouvert
      const existing = s.panels.find((p) => p.id === panel.id);
      return { panels: [...others, existing ? { ...panel, width: existing.width } : panel] };
    });
  },

  togglePanel: (input) => {
    if (get().isOpen(input.id)) {
      get().closePanel(input.id);
    } else {
      get().openPanel(input);
    }
  },

  closePanel: (id) => set((s) => ({ panels: s.panels.filter((p) => p.id !== id) })),

  closeAll: () => set({ panels: [] }),

  setWidth: (id, width) =>
    set((s) => ({
      panels: s.panels.map((p) =>
        p.id === id ? { ...p, width: Math.min(p.maxWidth, Math.max(p.minWidth, width)) } : p
      ),
    })),

  isOpen: (id) => get().panels.some((p) => p.id === id),
}));
