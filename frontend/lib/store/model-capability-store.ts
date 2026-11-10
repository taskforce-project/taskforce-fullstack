import { create } from "zustand";

import { getErrorMessage } from "../api/client";
import {
  chooseModel,
  getModelCapabilities,
  type ModelCapabilityRow,
  type ModelCapabilityTable,
} from "../api/model-capability-service";

// ---------------------------------------------------------------------------
// Store de ce que sait faire chaque modèle (R113, séance n°16) : la table de l'instance, et le modèle que la personne prend
// pour Cortex dans la webapp. La mesure passe par la file du banc (`model-benchmark-store`, R142) : un seul runner, un modèle
// après l'autre. Un domaine = un store ; les erreurs sont avalées (null/false, message dans `error`).
// ---------------------------------------------------------------------------

interface ModelCapabilityState {
  /** La table de l'instance. `null` = pas encore lue. */
  table: ModelCapabilityTable | null;
  error: string | null;

  fetchTable: (slug: string) => Promise<ModelCapabilityTable | null>;
  /** Le modèle de Cortex pour la personne ; null revient à celui de l'instance. */
  choose: (slug: string, model: string | null) => Promise<boolean>;
  /**
   * Le modèle de l'instance vient de changer dans les réglages d'IA de l'app desktop : le dernier geste gagne, « Use for
   * Cortex » (R130) ne reste pas épinglé par-dessus. La table se relit dans tous les cas.
   */
  instanceChanged: (slug: string) => Promise<boolean>;
}

/**
 * Chaque cas de chaque capacité a une réponse (R113 : mesurée ici, jamais une fiche) ; un cas trop lent compte comme mesuré, le
 * remesurer sans rien changer redonnerait le même verdict (R142).
 */
export function measuredFully(row: ModelCapabilityRow): boolean {
  return row.scores.length > 0 && row.scores.every((score) => score.total > 0 && score.measured + score.tooSlow >= score.total);
}

export const useModelCapabilityStore = create<ModelCapabilityState>((set, get) => ({
  table: null,
  error: null,

  fetchTable: async (slug) => {
    try {
      const table = await getModelCapabilities(slug);
      set({ table });
      return table;
    } catch {
      return null;
    }
  },

  choose: async (slug, model) => {
    try {
      const table = await chooseModel(slug, model);
      set({ table, error: null });
      return true;
    } catch (err) {
      set({ error: getErrorMessage(err) });
      return false;
    }
  },

  instanceChanged: async (slug) => {
    if (get().table?.choice) return get().choose(slug, null);
    return (await get().fetchTable(slug)) !== null;
  },
}));
