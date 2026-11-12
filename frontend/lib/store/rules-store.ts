import { create } from "zustand";

import { getErrorMessage } from "../api/client";
import {
  addRule,
  checkAction,
  draftRule,
  getRules,
  removeRule,
  type RuleCheck,
  type RuleDraft,
  type RuleDraftRequest,
  type RuleSaveResult,
  type RuleScope,
  type RulesOverview,
} from "../api/rules-service";

// ---------------------------------------------------------------------------
// Les règles de l'entreprise, par couches (R157). Un domaine = un store. Erreurs avalées : chaque action rend null ou
// false, et la raison dans `error`.
// ---------------------------------------------------------------------------

interface RulesState {
  /** Les règles de l'espace ouvert ; null tant qu'elles ne sont pas lues. */
  overview: RulesOverview | null;
  /** L'espace dont `overview` donne les règles. */
  slug: string | null;
  loading: boolean;
  /** La dernière lecture a échoué : l'écran le dit au lieu d'attendre. */
  loadFailed: boolean;
  error: string | null;

  fetchRules: (slug: string) => Promise<RulesOverview | null>;
  /** Traduit une règle en mots (sans `rules`) ou revérifie une traduction ; null si le serveur n'a pas pu. */
  draftRule: (slug: string, request: RuleDraftRequest) => Promise<RuleDraft | null>;
  /** Ajoute une règle vérifiée ; une règle refusée revient avec sa vérification (`saved` faux). */
  addRule: (slug: string, request: RuleDraftRequest) => Promise<RuleSaveResult | null>;
  removeRule: (slug: string, scope: RuleScope, ref: string | null, group: string) => Promise<boolean>;
  /** « What would happen? » ; null si l'action n'a pas pu être jugée. */
  checkAction: (slug: string, text: string, projectId: number | null) => Promise<RuleCheck | null>;
}

export const useRulesStore = create<RulesState>((set, get) => ({
  overview: null,
  slug: null,
  loading: false,
  loadFailed: false,
  error: null,

  fetchRules: async (slug) => {
    set((state) => ({ loading: true, loadFailed: false, ...(state.slug === slug ? {} : { overview: null, slug }) }));
    try {
      const overview = await getRules(slug);
      set({ overview, slug, loading: false });
      return overview;
    } catch (error) {
      set({ loading: false, loadFailed: true, error: getErrorMessage(error) });
      return null;
    }
  },

  draftRule: async (slug, request) => {
    set({ error: null });
    try {
      return await draftRule(slug, request);
    } catch (error) {
      set({ error: getErrorMessage(error) });
      return null;
    }
  },

  addRule: async (slug, request) => {
    set({ error: null });
    try {
      const result = await addRule(slug, request);
      if (result.saved) await get().fetchRules(slug);
      return result;
    } catch (error) {
      set({ error: getErrorMessage(error) });
      return null;
    }
  },

  removeRule: async (slug, scope, ref, group) => {
    set({ error: null });
    try {
      await removeRule(slug, scope, ref, group);
      await get().fetchRules(slug);
      return true;
    } catch (error) {
      set({ error: getErrorMessage(error) });
      return false;
    }
  },

  checkAction: async (slug, text, projectId) => {
    set({ error: null });
    try {
      return await checkAction(slug, text, projectId);
    } catch (error) {
      set({ error: getErrorMessage(error) });
      return null;
    }
  },
}));
