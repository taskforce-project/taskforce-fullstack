import { create } from "zustand";

import { getErrorMessage, getRetryAfterSeconds } from "../api/client";
import {
  chooseModel,
  getModelCapabilities,
  measureModelCase,
  startModelMeasure,
  type ModelCapabilityResult,
  type ModelCapabilityTable,
} from "../api/model-capability-service";

// ---------------------------------------------------------------------------
// Store de ce que sait faire chaque modèle (R113, séance n°16) : la table de l'instance, la mesure d'un modèle, cas par
// cas, et le modèle que la personne prend pour Cortex dans la webapp. Un domaine = un store ; les erreurs sont avalées
// (null/false, message dans `error`).
// ---------------------------------------------------------------------------

/** Une mesure attend le frein de débit de l'IA au plus trois fois par cas, deux minutes chaque fois. */
const MAX_WAITS = 3;
const MAX_WAIT_SECONDS = 120;

export interface ModelMeasureProgress {
  model: string;
  done: number;
  total: number;
  /** Secondes d'attente du frein de débit de l'IA, null quand la mesure avance. */
  waitSeconds: number | null;
  /** La personne a demandé l'arrêt : la mesure s'arrête avant le cas suivant. */
  stopping: boolean;
}

interface ModelCapabilityState {
  /** La table de l'instance. `null` = pas encore lue. */
  table: ModelCapabilityTable | null;
  /** La mesure en cours, null sinon : une seule à la fois. */
  progress: ModelMeasureProgress | null;
  /** Les notes de la dernière mesure, dans l'ordre des cas. */
  results: ModelCapabilityResult[];
  error: string | null;

  fetchTable: (slug: string) => Promise<ModelCapabilityTable | null>;
  /** Rejoue les cas fixes sur un modèle, un par un ; false si la mesure s'est arrêtée sur une panne. */
  measure: (slug: string, model: string) => Promise<boolean>;
  stop: () => void;
  /** Le modèle de Cortex pour la personne (webapp) ; null revient à celui de l'instance. */
  choose: (slug: string, model: string | null) => Promise<boolean>;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const useModelCapabilityStore = create<ModelCapabilityState>((set, get) => {
  const progress = (patch: Partial<ModelMeasureProgress>) =>
    set((state) => (state.progress ? { progress: { ...state.progress, ...patch } } : {}));

  /** Note un cas ; un 429 du frein de débit se patiente, toute autre erreur arrête la mesure. */
  const grade = async (slug: string, runId: number, caseKey: string) => {
    for (let waits = 0; ; waits++) {
      try {
        return await measureModelCase(slug, runId, caseKey);
      } catch (err) {
        const wait = getRetryAfterSeconds(err);
        if (wait === null || wait > MAX_WAIT_SECONDS || waits >= MAX_WAITS || get().progress?.stopping) throw err;
        progress({ waitSeconds: wait });
        await sleep((wait + 1) * 1000);
        progress({ waitSeconds: null });
      }
    }
  };

  return {
    table: null,
    progress: null,
    results: [],
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

    measure: async (slug, model) => {
      if (get().progress) return false;
      set({ error: null, results: [], progress: { model, done: 0, total: 0, waitSeconds: null, stopping: false } });
      let ok = true;
      try {
        const started = await startModelMeasure(slug, model);
        progress({ total: started.cases.length });
        for (const caseKey of started.cases) {
          if (get().progress?.stopping) break;
          const result = await grade(slug, started.runId, caseKey);
          set((state) => ({ results: [...state.results, result] }));
          progress({ done: (get().progress?.done ?? 0) + 1 });
        }
      } catch (err) {
        ok = false;
        set({ error: getErrorMessage(err) });
      } finally {
        set({ progress: null });
        await get().fetchTable(slug);
      }
      return ok;
    },

    stop: () => progress({ stopping: true }),

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
  };
});
