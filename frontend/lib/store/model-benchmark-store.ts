import { create } from "zustand";

import { getErrorMessage, getErrorStatus, getRetryAfterSeconds, isRequestTimeout } from "../api/client";
import { getEvalBank, runEvalCase, startEvalRun } from "../api/eval-service";
import {
  BANK_TASK,
  chooseBlindTrial,
  getBenchmarkDetail,
  getBenchmarkHistory,
  getBenchmarkMatrix,
  loadBenchmarkModel,
  playBenchmarkCase,
  playBlindTrialLetter,
  setBenchmarkVerdict,
  startBenchmarkRun,
  startBlindTrial,
  stopBenchmark,
  type BenchmarkMatrix,
  type BenchmarkModelDetail,
  type BenchmarkRunLine,
  type BlindTrialLetterAnswer,
  type BlindTrialRequest,
  type BlindTrialResult,
  type BlindTrialStarted,
} from "../api/model-benchmark-service";
import { measureModelCase, startModelMeasure } from "../api/model-capability-service";
import { CONSTANTS_EN } from "../constants_en";
import { parseServerDate } from "../utils/server-date";
import { useEvalStore } from "./eval-store";
import { measuredFully, useModelCapabilityStore } from "./model-capability-store";

// ---------------------------------------------------------------------------
// Store du banc des modèles (R131, séance n°19 ; R142, séance n°20) : la matrice, la file des modèles à passer, le détail d'un
// modèle où la personne retourne une note, et l'essai sur une de ses issues. La file vit ici et pas dans le composant : elle
// continue quand la personne change d'onglet dans le volet. Un modèle à la fois : le premier appel le charge avant que rien ne
// soit chronométré, puis ses capacités, ses tâches, et la banque de tests de l'espace. Un domaine = un store ; les erreurs sont
// avalées (null/false, message dans `error`).
// ---------------------------------------------------------------------------

/** Un passage attend le frein de débit de l'IA au plus trois fois par cas, deux minutes chaque fois. */
const MAX_WAITS = 3;
const MAX_WAIT_SECONDS = 120;

/** `everything` : le passage complet ; `capabilities` : la mesure du modèle de Cortex, lancée seule une fois (R125). */
export type BenchmarkScope = "everything" | "capabilities";

/** Un modèle qui attend son tour. */
export interface BenchmarkQueued {
  model: string;
  scope: BenchmarkScope;
}

export interface BenchmarkProgress {
  /** Le modèle en cours. */
  model: string;
  /** `loading` : le premier appel, qui le charge ; `running` : ses cas. */
  phase: "loading" | "running";
  /** Les cas faits de ce modèle. */
  done: number;
  /** Les cas à faire de ce modèle. */
  total: number;
  /** Secondes d'attente du frein de débit de l'IA, null quand le passage avance. */
  waitSeconds: number | null;
  /** La personne a demandé l'arrêt : le passage s'arrête sans attendre la fin du cas. */
  stopping: boolean;
  /** La mesure du modèle de Cortex que TaskForce lance seul, une fois. */
  auto: boolean;
}

/** Un essai sur son travail en cours : les réponses arrivent, puis la personne choisit ; à un seul modèle, rien à choisir. */
export interface BlindTrial {
  phase: "answering" | "choosing" | "revealed" | "tried";
  trial: BlindTrialStarted;
  answers: Record<string, BlindTrialLetterAnswer>;
  /** Les noms, une fois la personne décidée. */
  result: BlindTrialResult | null;
  /** Le nom du modèle quand il est seul : il n'y a rien à cacher. */
  model: string | null;
  /** Secondes d'attente du frein de débit, null sinon. */
  waitSeconds: number | null;
}

interface ModelBenchmarkState {
  /** `null` = pas encore lue. */
  matrix: BenchmarkMatrix | null;
  /** Le détail des modèles ouverts, par nom. */
  details: Record<string, BenchmarkModelDetail>;
  /** Le passage en cours, null sinon : un modèle à la fois. */
  progress: BenchmarkProgress | null;
  /** Les modèles qui attendent leur tour. */
  queue: BenchmarkQueued[];
  /** Ce qui a empêché un modèle d'aller au bout, par nom : le passage est allé au suivant. */
  notes: Record<string, string>;
  /** Les modèles de Cortex que TaskForce a déjà mesurés seul pendant cette session : une fois chacun. */
  autoMeasured: string[];
  /** Les passages de l'espace, pour « History ». `null` = pas encore lus. */
  history: BenchmarkRunLine[] | null;
  /** Le choix des modèles à passer est ouvert : « History » peut l'ouvrir. */
  pickerOpen: boolean;
  /** L'essai en cours, null sinon. */
  blind: BlindTrial | null;
  /** La ligne ouverte : elle le reste quand la personne change d'onglet et revient. */
  openModel: string | null;
  error: string | null;

  fetchMatrix: (slug: string) => Promise<BenchmarkMatrix | null>;
  fetchDetail: (slug: string, model: string) => Promise<BenchmarkModelDetail | null>;
  fetchHistory: (slug: string) => Promise<BenchmarkRunLine[] | null>;
  /**
   * Met ces modèles dans la file, à la suite de ceux qui attendent ; lance la file si rien ne tourne. false seulement si la
   * file s'est arrêtée sur une panne de l'IA, un quota atteint ou une réponse perdue.
   */
  run: (slug: string, models: string[]) => Promise<boolean>;
  /**
   * Mesure le modèle de Cortex, une fois, sans clic, quand ses capacités ne sont pas mesurées : la première fois que l'onglet
   * s'ouvre, et après que la personne a changé de modèle (R125). false quand rien n'est lancé.
   */
  measureCortexModel: (slug: string) => Promise<boolean>;
  /** Arrête tout : le cas en cours est coupé, la file se vide. */
  stop: (slug: string) => void;
  setPickerOpen: (open: boolean) => void;
  /** Retourne la note d'un cas (réussi, raté) ; null la rend au code. */
  overturn: (slug: string, model: string, resultId: number, passed: boolean | null) => Promise<boolean>;
  /** Lance l'essai : les réponses arrivent sous A, B, C, ou celle du modèle seul ; false sur une panne. */
  startTrial: (slug: string, request: BlindTrialRequest) => Promise<boolean>;
  /** Choisit une lettre, ou aucune (null) ; les noms apparaissent. */
  chooseTrial: (slug: string, letter: string | null) => Promise<boolean>;
  closeTrial: () => void;
  setOpenModel: (model: string | null) => void;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** L'IA ne répond plus : inutile d'essayer les modèles suivants. */
class AiUnreachable extends Error {}

/** Ce qui a arrêté la file, en mots : le message du serveur quand il répond ; sinon ce qui s'est passé et quoi faire (R133). */
function failureText(err: unknown): string {
  if (err instanceof AiUnreachable) return err.message;
  const status = getErrorStatus(err);
  return status === undefined || status >= 500 ? CONSTANTS_EN.benchmark.connectionLost : getErrorMessage(err);
}

export const useModelBenchmarkStore = create<ModelBenchmarkState>((set, get) => {
  const progress = (patch: Partial<BenchmarkProgress>) =>
    set((state) => (state.progress ? { progress: { ...state.progress, ...patch } } : {}));

  const blind = (patch: Partial<BlindTrial>) =>
    set((state) => (state.blind ? { blind: { ...state.blind, ...patch } } : {}));

  const stopping = () => Boolean(get().progress?.stopping);

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

  /** Joue un cas. Une réponse qui n'arrive pas à temps (un relais devant l'API) passe au cas suivant : il reste non noté. */
  const playOne = async (call: () => Promise<unknown>) => {
    try {
      await patiently(call, (waitSeconds) => progress({ waitSeconds }), stopping);
    } catch (err) {
      if (!isRequestTimeout(err)) throw err;
    }
    progress({ done: (get().progress?.done ?? 0) + 1 });
  };

  const playCases = async (cases: readonly (() => Promise<unknown>)[], afterEach?: () => Promise<unknown>) => {
    for (const call of cases) {
      if (stopping()) return;
      await playOne(call);
      await afterEach?.();
    }
  };

  /** La mesure des capacités d'un modèle ; son total s'ajoute à celui du passage. */
  const playCapabilities = async (slug: string, model: string) => {
    const measure = await startModelMeasure(slug, model);
    progress({ total: (get().progress?.total ?? 0) + measure.cases.length });
    await playCases(measure.cases.map((key) => () => measureModelCase(slug, measure.runId, key)));
  };

  /** Le rejeu de la banque de l'espace sur ce modèle, s'il y a des cas : la colonne « Your tests ». */
  const playBank = async (slug: string, model: string) => {
    const hasBank = get().matrix?.tasks.some((task) => task.key === BANK_TASK);
    if (!hasBank || stopping()) return;
    const started = await startEvalRun(slug, model);
    const bank = await getEvalBank(slug);
    const startedAt = parseServerDate(started.startedAt).getTime();
    const cases = bank.cases.filter((c) => parseServerDate(c.criteriaAt).getTime() <= startedAt);
    progress({ total: (get().progress?.total ?? 0) + cases.length });
    await playCases(cases.map((c) => () => runEvalCase(slug, started.id, c.id)));
    void useEvalStore.getState().fetchHistory(slug);
  };

  /** Un modèle, en entier : chargé, ses capacités, ses tâches, la banque. Un chargement qui n'aboutit pas passe au suivant. */
  const playModel = async (slug: string, next: BenchmarkQueued) => {
    if (next.scope === "capabilities") {
      await playCapabilities(slug, next.model);
      return;
    }
    const started = await startBenchmarkRun(slug, next.model);
    const loaded = await loadBenchmarkModel(slug, started.runId);
    if (loaded.status === "unreachable") throw new AiUnreachable(loaded.message ?? "");
    if (loaded.status !== "loaded") return; // sa ligne le dit : « Too slow here », ou qu'il ne se charge pas
    progress({ phase: "running", total: started.cases.length });
    await playCapabilities(slug, next.model);
    await playCases(
      started.cases.map((caseKey) => () => playBenchmarkCase(slug, started.runId, caseKey)),
      // La ligne du modèle se remplit à mesure : chaque tâche finie montre son verdict.
      () => get().fetchMatrix(slug),
    );
    await playBank(slug, next.model);
  };

  /** La file : un modèle après l'autre, jusqu'au bout ou jusqu'à un arrêt. Rien ne la double : un seul runner. */
  const drain = async (slug: string): Promise<boolean> => {
    let ok = true;
    while (get().queue.length > 0 && !stopping()) {
      const [next, ...rest] = get().queue;
      set({
        queue: rest,
        progress: { model: next.model, phase: next.scope === "capabilities" ? "running" : "loading", done: 0, total: 0, waitSeconds: null, stopping: false, auto: next.scope === "capabilities" },
      });
      try {
        await playModel(slug, next);
      } catch (err) {
        // Arrêté par la personne : ce n'est pas une panne à afficher. Un 400 ne parle que de ce modèle (il a cessé de répondre) :
        // sa ligne le dit, le suivant passe.
        if (!stopping() && getErrorStatus(err) === 400) {
          set((state) => ({ notes: { ...state.notes, [next.model]: getErrorMessage(err) } }));
        } else if (!stopping()) {
          ok = false;
          set({ error: failureText(err), queue: [] });
        }
      }
      await refreshAfter(slug, next.model);
    }
    set({ progress: null, queue: [] });
    return ok;
  };

  /** Ce qu'un modèle a changé : sa ligne, son détail s'il est ouvert, ses capacités, l'histoire. */
  const refreshAfter = async (slug: string, model: string) => {
    await get().fetchMatrix(slug);
    if (get().details[model]) await get().fetchDetail(slug, model);
    await Promise.all([useModelCapabilityStore.getState().fetchTable(slug), get().fetchHistory(slug)]);
  };

  return {
    matrix: null,
    details: {},
    progress: null,
    queue: [],
    notes: {},
    autoMeasured: [],
    history: null,
    pickerOpen: false,
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

    fetchHistory: async (slug) => {
      try {
        const history = await getBenchmarkHistory(slug);
        set({ history });
        return history;
      } catch {
        return null;
      }
    },

    run: async (slug, models) => {
      const running = get().progress;
      const taken = new Set([...get().queue.map((item) => item.model), ...(running ? [running.model] : [])]);
      const wanted = models.filter((model) => !taken.has(model));
      if (wanted.length === 0) return false;
      set((state) => ({
        error: null,
        notes: Object.fromEntries(Object.entries(state.notes).filter(([model]) => !wanted.includes(model))),
        queue: [...state.queue, ...wanted.map((model): BenchmarkQueued => ({ model, scope: "everything" }))],
      }));
      if (running) return true; // la file tourne déjà : ils attendent leur tour
      return drain(slug);
    },

    measureCortexModel: async (slug) => {
      const { progress: running, queue, autoMeasured, matrix } = get();
      const table = useModelCapabilityStore.getState().table;
      const model = table?.current;
      if (!slug || !table || !model || running || queue.length > 0 || autoMeasured.includes(model)) return false;
      const row = table.models.find((candidate) => candidate.model === model);
      if (!row || measuredFully(row)) return false;
      if (matrix?.models.find((candidate) => candidate.model === model)?.facts?.chat === false) return false;
      set({ autoMeasured: [...autoMeasured, model], queue: [{ model, scope: "capabilities" }] });
      return drain(slug);
    },

    stop: (slug) => {
      if (!get().progress) return;
      progress({ stopping: true });
      set({ queue: [] });
      void stopBenchmark(slug).catch(() => undefined);
    },

    setPickerOpen: (open) => set({ pickerOpen: open }),

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
      const alone = request.models.length === 1 ? request.models[0] : null;
      try {
        const trial = await startBlindTrial(slug, request);
        set({ blind: { phase: "answering", trial, answers: {}, result: null, model: alone, waitSeconds: null } });
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
        blind({ phase: alone ? "tried" : "choosing" });
        // À un seul modèle, l'essai s'est refermé sur sa réponse : il rejoint les essais du détail.
        if (alone && get().details[alone]) await get().fetchDetail(slug, alone);
        return true;
      } catch (err) {
        set({ error: failureText(err), blind: null });
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
