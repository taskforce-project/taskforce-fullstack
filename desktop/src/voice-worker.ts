import { join } from "node:path";

/**
 * Processus de la transcription (voice.ts) : un `utilityProcess` à part, pour que le modèle (près d'un gigaoctet en
 * mémoire) et le calcul ne pèsent ni sur la coque ni sur la fenêtre. Il charge sherpa-onnx et Parakeet, puis transcrit
 * les échantillons qu'on lui passe. Aucun texte ne quitte ce processus autrement que dans la réponse à sa demande.
 */

/** Taux des échantillons que le modèle attend (mono, flottants). */
export const SAMPLE_RATE = 16_000;

export type ToWorker =
  | { type: "load"; dir: string; threads: number }
  | { type: "transcribe"; id: number; samples: Float32Array };

export type FromWorker =
  | { type: "ready"; ms: number }
  | { type: "failed"; message: string }
  | { type: "text"; id: number; text: string }
  | { type: "error"; id: number; message: string };

/** La part de sherpa-onnx-node dont on se sert. */
export interface SherpaStream {
  acceptWaveform(wave: { samples: Float32Array; sampleRate: number }): void;
}

export interface SherpaRecognizer {
  createStream(): SherpaStream;
  decodeAsync(stream: SherpaStream): Promise<{ text: string }>;
}

export interface Sherpa {
  OfflineRecognizer: { createAsync(config: unknown): Promise<SherpaRecognizer> };
}

/** Le canal vers la coque : `process.parentPort` dans un `utilityProcess`. */
export interface WorkerPort {
  on(event: "message", listener: (event: { data: unknown }) => void): unknown;
  postMessage(message: FromWorker): void;
}

/** Configuration du modèle : Parakeet TDT, un transducteur NeMo, sur le processeur, sans sortie de débogage. */
export function recognizerConfig(dir: string, threads: number): unknown {
  return {
    // sherpa-onnx remplace la dimension par celle du modèle (128 pour Parakeet) ; le champ reste obligatoire.
    featConfig: { sampleRate: SAMPLE_RATE, featureDim: 80 },
    modelConfig: {
      numThreads: threads,
      provider: "cpu",
      debug: 0,
      modelType: "nemo_transducer",
      transducer: {
        encoder: join(dir, "encoder.int8.onnx"),
        decoder: join(dir, "decoder.int8.onnx"),
        joiner: join(dir, "joiner.int8.onnx"),
      },
      tokens: join(dir, "tokens.txt"),
    },
  };
}

/** Répond aux demandes de la coque : charge le modèle une fois, puis transcrit. */
export function serve(port: WorkerPort, loadSherpa: () => Sherpa): void {
  let recognizer: SherpaRecognizer | null = null;

  const load = async (dir: string, threads: number) => {
    const started = Date.now();
    try {
      recognizer = await loadSherpa().OfflineRecognizer.createAsync(recognizerConfig(dir, threads));
      port.postMessage({ type: "ready", ms: Date.now() - started });
    } catch (error) {
      port.postMessage({ type: "failed", message: (error as Error).message });
    }
  };

  const transcribe = async (id: number, samples: Float32Array) => {
    try {
      if (!recognizer) throw new Error("the model is not loaded");
      const stream = recognizer.createStream();
      stream.acceptWaveform({ samples, sampleRate: SAMPLE_RATE });
      const result = await recognizer.decodeAsync(stream);
      port.postMessage({ type: "text", id, text: result.text.trim() });
    } catch (error) {
      port.postMessage({ type: "error", id, message: (error as Error).message });
    }
  };

  port.on("message", ({ data }) => {
    const message = data as ToWorker;
    if (message.type === "load") void load(message.dir, message.threads);
    else if (message.type === "transcribe") void transcribe(message.id, message.samples);
  });
}

// Dans un `utilityProcess` seulement ; en test, le module ne fait qu'exporter.
if (process.parentPort) serve(process.parentPort, () => require("sherpa-onnx-node") as Sherpa);
