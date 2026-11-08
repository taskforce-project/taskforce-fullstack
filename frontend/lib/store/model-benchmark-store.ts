import { create } from "zustand";

import { getErrorMessage, getRetryAfterSeconds } from "../api/client";
import {
  chooseBlindTrial,
  getBenchmarkDetail,
  getBenchmarkMatrix,
  playBenchmarkCase,
  playBlindTrialLetter,
  setBenchmarkVerdict,
  startBenchmarkRun,
  startBlindTrial,
  type BenchmarkMatrix,
  type BenchmarkModelDetail,
  type BlindTrialLetterAnswer,
  type BlindTrialRequest,
  type BlindTrialResult,
  type BlindTrialStarted,
} from "../api/model-benchmark-service";

// ---------------------------------------------------------------------------
// Store du banc des modèles (R131, séance n°19) : la matrice, le passage de modèles cas par cas, le détail d'un modèle où
// la personne retourne une note, et l'essai à l'aveugle sur une de ses issues. Le passage vit ici et pas dans le composant :
// il continue quand la personne change d'onglet dans le volet. Un domaine = un store ; les erreurs sont avalées
// (null/false, message dans `error`).
// ---------------------------------------------------------------------------

/** Un passage attend le frein de débit de l'IA au plus trois fois par cas, deux minutes chaque fois. */
const MAX_WAITS = 3;
const MAX_WAIT_SECONDS = 120;

export interface BenchmarkProgress {
  /** Le modèle en cours. */
  model: string;
  /** Les cas faits, tous modèles confondus. */
  done: number;
  /** Les cas à faire : le total s'affine quand chaque modèle commence. */
  total: number;
  /** Secondes d'attente du frein de débit de l'IA, null quand le passage avance. */
  waitSeconds: number | null;
  /** La personne a demandé l'arrêt : le passage s'arrête avant le cas suivant. */
  stopping: boolean;
}

/** Un essai à l'aveugle en cours : les réponses arrivent sous leur lettre, puis la personne choisit. */
export interface BlindTrial {
  phase: "answering" | "choosing" | "revealed";
  trial: BlindTrialStarted;
  answers: Record<string, BlindTrialLetterAnswer>;
  /** Les noms, une fois la personne décidée. */
  result: BlindTrialResult | null;
  /** Secondes d'attente du frein de débit, null sinon. */
  waitSeconds: number | null;
}

interface ModelBenchmarkState {
  /** `null` = pas encore lue. */
  matrix: BenchmarkMatrix | null;
  /** Le détail des modèles ouverts, par nom. */
  details: Record<string, BenchmarkModelDetail>;
  /** Le passage en cours, null sinon : un seul à la fois. */
  progress: BenchmarkProgress | null;
  /** L'essai à l'aveugle en cours, null sinon. */
  blind: BlindTrial | null;
  /** La ligne ouverte : elle le reste quand la personne change d'onglet et revient. */
  openModel: string | null;
  error: string | null;

  fetchMatrix: (slug: string) => Promise<BenchmarkMatrix | null>;
  fetchDetail: (slug: string, model: string) => Promise<BenchmarkModelDetail | null>;
  /** Passe la suite sur ces modèles, un cas à la fois ; false si le passage s'est arrêté sur une panne. */
  run: (slug: string, models: string[]) => Promise<boolean>;
  stop: () => void;
  /** Retourne la note d'un cas (réussi, raté) ; null la rend au code. */
  overturn: (slug: string, model: string, resultId: number, passed: boolean | null) => Promise<boolean>;
  /** Lance l'essai : les réponses arrivent sous A, B, C ; false sur une panne. */
  startTrial: (slug: string, request: BlindTrialRequest) => Promise<boolean>;
  /** Choisit une lettre, ou aucune (null) ; les noms apparaissent. */
  chooseTrial: (slug: string, letter: string | null) => Promise<boolean>;
  closeTrial: () => void;
  setOpenModel: (model: string | null) => void;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const useModelBenchmarkStore = create<ModelBenchmarkState>((set, get) => {
  const progress = (patch: Partial<BenchmarkProgress>) =>
    set((state) => (state.progress ? { progress: { ...state.progress, ...patch } } : {}));

  const blind = (patch: Partial<BlindTrial>) =>
    set((state) => (state.blind ? { blind: { ...state.blind, ...patch } } : {}));

  /** Un appel au modèle : un 429 du frein de débit se patiente, toute autre erreur remonte. */
  const patiently = async <T,>(call: () => Promise<T>, onWait: (seconds: number | null) => void, stopped: () => boolean): Promise<T> => {
    for (let waits = 0; ; waits++) {
      try {
        return await call();
      } catch (err) {
        const wait = getRetryAfterSeconds(err);
        if (wait === null || wait > MAX_WAIT_SECONDS || waits >= MAX_WAITS || stopped()) throw err;
        onWait(wait);
        await sleep((wait + 1) * 1000);
        onWait(null);
      }
    }
  };

  return {
    matrix: null,
    details: {},
    progress: null,
    blind: null,
    openModel: null,
    error: null,

    fetchMatrix: async (slug) => {
      try {
        const matrix = await getBenchmarkMatrix(slug);
        set({ matrix });
        return matrix;
      } catch {
        return null;
      }
    },

    fetchDetail: async (slug, model) => {
      try {
        const detail = await getBenchmarkDetail(slug, model);
        set((state) => ({ details: { ...state.details, [model]: detail } }));
        return detail;
      } catch {
        return null;
      }
    },

    run: async (slug, models) => {
      if (get().progress || models.length === 0) return false;
      const perModel = get().matrix?.cases ?? 0;
      set({
        error: null,
        progress: { model: models[0], done: 0, total: perModel * models.length, waitSeconds: null, stopping: false },
      });
      let ok = true;
      try {
        for (const model of models) {
          if (get().progress?.stopping) break;
          progress({ model });
          const started = await startBenchmarkRun(slug, model);
          for (const caseKey of started.cases) {
            if (get().progress?.stopping) break;
            await patiently(
              () => playBenchmarkCase(slug, started.runId, caseKey),
              (waitSeconds) => progress({ waitSeconds }),
              () => Boolean(get().progress?.stopping),
            );
            progress({ done: (get().progress?.done ?? 0) + 1 });
            // La ligne du modèle se remplit à mesure : chaque tâche finie montre son verdict.
            await get().fetchMatrix(slug);
          }
          if (get().details[model]) await get().fetchDetail(slug, model);
        }
      } catch (err) {
        ok = false;
        set({ error: getErrorMessage(err) });
      } finally {
        set({ progress: null });
        await get().fetchMatrix(slug);
      }
      return ok;
    },

    stop: () => progress({ stopping: true }),

    overturn: async (slug, model, resultId, passed) => {
      try {
        const detail = await setBenchmarkVerdict(slug, resultId, passed);
        set((state) => ({ details: { ...state.details, [model]: detail }, error: null }));
        await get().fetchMatrix(slug);
        return true;
      } catch (err) {
        set({ error: getErrorMessage(err) });
        return false;
      }
    },

    startTrial: async (slug, request) => {
      if (get().blind) return false;
      set({ error: null });
      try {
        const trial = await startBlindTrial(slug, request);
        set({ blind: { phase: "answering", trial, answers: {}, result: null, waitSeconds: null } });
        for (const letter of trial.letters) {
          // La personne a fermé l'essai : sa dernière réponse se perd, le reste ne part pas.
          if (get().blind?.trial.trialId !== trial.trialId) return false;
          const answer = await patiently(
            () => playBlindTrialLetter(slug, trial.trialId, letter),
            (waitSeconds) => blind({ waitSeconds }),
            () => get().blind?.trial.trialId !== trial.trialId,
          );
          set((state) => state.blind?.trial.trialId === trial.trialId
            ? { blind: { ...state.blind, answers: { ...state.blind.answers, [letter]: answer } } }
            : {});
        }
        blind({ phase: "choosing" });
        return true;
      } catch (err) {
        set({ error: getErrorMessage(err), blind: null });
        return false;
      }
    },

    chooseTrial: async (slug, letter) => {
      const running = get().blind;
      if (!running) return false;
      try {
        const result = await chooseBlindTrial(slug, running.trial.trialId, letter);
        blind({ phase: "revealed", result });
        for (const answer of result.answers) {
          if (get().details[answer.model]) await get().fetchDetail(slug, answer.model);
        }
        return true;
      } catch (err) {
        set({ error: getErrorMessage(err) });
        return false;
      }
    },

    closeTrial: () => set({ blind: null }),

    setOpenModel: (model) => set({ openModel: model }),
  };
});
