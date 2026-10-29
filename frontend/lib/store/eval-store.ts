import { create } from "zustand";

import { getErrorMessage, getRetryAfterSeconds } from "../api/client";
import {
  archiveEvalCase,
  createEvalCase,
  draftEvalCase,
  getEvalBank,
  getEvalRun,
  runEvalCase,
  setEvalBankEnabled,
  startEvalRun,
  type EvalBank,
  type EvalCaseSummary,
  type EvalCriteria,
  type EvalDraft,
  type EvalRunDetail,
} from "../api/eval-service";
import { parseServerDate } from "../utils/server-date";

// ---------------------------------------------------------------------------
// Store de la banque d'évaluations de Cortex (R61, séance n°10). Un domaine = un store. Erreurs
// avalées (renvoie null/false, message dans `error`).
// ---------------------------------------------------------------------------

/** Un rejeu attend le frein de débit de l'IA au plus trois fois par cas, deux minutes chaque fois. */
const MAX_WAITS = 3;
const MAX_WAIT_SECONDS = 120;

export interface EvalProgress {
  done: number;
  total: number;
  /** Secondes d'attente du frein de débit de l'IA, null quand le rejeu avance. */
  waitSeconds: number | null;
  /** La personne a demandé l'arrêt : le rejeu s'arrête avant le cas suivant. */
  stopping: boolean;
}

interface EvalState {
  /** La banque de l'espace ouvert. `null` = pas encore lue. */
  bank: EvalBank | null;
  /** Le rejeu affiché, avec ses notes. */
  run: EvalRunDetail | null;
  /** Le rejeu en cours, null sinon : un seul à la fois. */
  progress: EvalProgress | null;
  error: string | null;

  fetchBank: (slug: string) => Promise<EvalBank | null>;
  draftCase: (slug: string, record: string) => Promise<EvalDraft | null>;
  addCase: (slug: string, record: string, title: string, criteria: EvalCriteria) => Promise<EvalCaseSummary | null>;
  archiveCase: (slug: string, caseId: number) => Promise<boolean>;
  setEnabled: (slug: string, enabled: boolean) => Promise<boolean>;
  /** Rejoue les cas de la banque sur un modèle, un par un, puis rend le rejeu noté (partiel s'il s'est arrêté). */
  runBank: (slug: string, model: string) => Promise<EvalRunDetail | null>;
  stopRun: () => void;
  openRun: (slug: string, runId: number) => Promise<EvalRunDetail | null>;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const useEvalStore = create<EvalState>((set, get) => {
  const progress = (patch: Partial<EvalProgress>) =>
    set((state) => (state.progress ? { progress: { ...state.progress, ...patch } } : {}));

  /** Note un cas ; un 429 du frein de débit se patiente, toute autre erreur arrête le rejeu. */
  const grade = async (slug: string, runId: number, caseId: number) => {
    for (let waits = 0; ; waits++) {
      try {
        return await runEvalCase(slug, runId, caseId);
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
    bank: null,
    run: null,
    progress: null,
    error: null,

    fetchBank: async (slug) => {
      try {
        const bank = await getEvalBank(slug);
        set({ bank });
        return bank;
      } catch {
        return null;
      }
    },

    draftCase: async (slug, record) => {
      try {
        const draft = await draftEvalCase(slug, record);
        set({ error: null });
        return draft;
      } catch (err) {
        set({ error: getErrorMessage(err) });
        return null;
      }
    },

    addCase: async (slug, record, title, criteria) => {
      try {
        const added = await createEvalCase(slug, record, title, criteria);
        set((state) => ({
          error: null,
          bank: state.bank ? { ...state.bank, cases: [added, ...state.bank.cases] } : state.bank,
        }));
        return added;
      } catch (err) {
        set({ error: getErrorMessage(err) });
        return null;
      }
    },

    archiveCase: async (slug, caseId) => {
      try {
        await archiveEvalCase(slug, caseId);
        set((state) => ({
          error: null,
          bank: state.bank ? { ...state.bank, cases: state.bank.cases.filter((c) => c.id !== caseId) } : state.bank,
        }));
        return true;
      } catch (err) {
        set({ error: getErrorMessage(err) });
        return false;
      }
    },

    setEnabled: async (slug, enabled) => {
      try {
        const kept = await setEvalBankEnabled(slug, enabled);
        set((state) => ({ error: null, bank: state.bank ? { ...state.bank, enabled: kept } : state.bank }));
        return true;
      } catch (err) {
        set({ error: getErrorMessage(err) });
        return false;
      }
    },

    runBank: async (slug, model) => {
      if (get().progress) return null;
      set({ error: null, run: null, progress: { done: 0, total: 0, waitSeconds: null, stopping: false } });
      let runId: number | null = null;
      try {
        const started = await startEvalRun(slug, model);
        runId = started.id;
        // Les cas du rejeu sont ceux dont les critères précèdent son départ, comme le compte le serveur.
        const bank = (await get().fetchBank(slug)) ?? get().bank;
        const startedAt = parseServerDate(started.startedAt).getTime();
        const caseIds = (bank?.cases ?? [])
          .filter((c) => parseServerDate(c.criteriaAt).getTime() <= startedAt)
          .map((c) => c.id);
        progress({ total: caseIds.length });
        for (const caseId of caseIds) {
          if (get().progress?.stopping) break;
          await grade(slug, started.id, caseId);
          progress({ done: (get().progress?.done ?? 0) + 1 });
        }
      } catch (err) {
        set({ error: getErrorMessage(err) });
      }
      try {
        if (runId === null) return null;
        const detail = await getEvalRun(slug, runId);
        set({ run: detail });
        return detail;
      } catch {
        return null;
      } finally {
        set({ progress: null });
        void get().fetchBank(slug);
      }
    },

    stopRun: () => progress({ stopping: true }),

    openRun: async (slug, runId) => {
      try {
        const detail = await getEvalRun(slug, runId);
        set({ run: detail, error: null });
        return detail;
      } catch (err) {
        set({ error: getErrorMessage(err) });
        return null;
      }
    },
  };
});
