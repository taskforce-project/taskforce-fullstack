import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, statfs, writeFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { app, ipcMain, net, utilityProcess, type BrowserWindow } from "electron";

import { log } from "./log";
import { fromStore } from "./paths";
import { SAMPLE_RATE, type FromWorker, type ToWorker } from "./voice-worker";

/**
 * La voix de l'app desktop (R80, R132, E15) : la personne parle, le texte arrive dans le compositeur, et rien ne quitte
 * l'ordinateur. Le modèle se télécharge une fois, au premier clic, après que sa taille a été dite, et chaque fichier est
 * vérifié contre son empreinte. La transcription tourne dans un processus à part (voice-worker.ts), rendu à l'inactivité.
 * Le journal ne garde que des durées, jamais le texte.
 */

export interface VoiceModelFile {
  name: string;
  bytes: number;
  sha256: string;
}

export interface VoiceModel {
  id: string;
  /** Adresse des fichiers, figée sur une révision du dépôt : un changement chez l'hébergeur n'atteint pas l'app. */
  base: string;
  files: VoiceModelFile[];
}

/**
 * Parakeet TDT 0.6b v3 (NVIDIA, CC BY 4.0), quantifié en int8 et exporté pour sherpa-onnx. Choisi par la mesure d'E15 :
 * le français et l'anglais sans réglage, l'erreur par mot la plus basse, et moins d'une seconde sur un seul coeur.
 */
export const VOICE_MODEL: VoiceModel = {
  id: "parakeet-tdt-0.6b-v3-int8",
  base: "https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/resolve/ed5d745623472f97cfc2e6c2916ee248798fc5a8",
  files: [
    { name: "tokens.txt", bytes: 93_939, sha256: "d58544679ea4bc6ac563d1f545eb7d474bd6cfa467f0a6e2c1dc1c7d37e3c35d" },
    { name: "joiner.int8.onnx", bytes: 6_355_277, sha256: "cbd02f3696e9944970111fb439d9c3fd365a80374565f13f2b9c7007d253fc98" },
    { name: "decoder.int8.onnx", bytes: 11_845_274, sha256: "0222a86147299d4dee90edf95b6d13827edb42ad8b7c9cf0b2582f030937c0b5" },
    { name: "encoder.int8.onnx", bytes: 652_282_294, sha256: "1afbe69c1ffdabee94755f42e4daf1d93549131a3da11356bda84fcef0f2c479" },
  ],
};

/** Plus longue dictée acceptée (le compositeur s'arrête à deux minutes). */
const MAX_SAMPLES = SAMPLE_RATE * 125;

/** Le modèle pèse près d'un gigaoctet en mémoire : il part après trois minutes sans dictée. */
const IDLE_MS = 3 * 60_000;

/** Une transcription bloquée libère sa place : le processus est relancé à la demande suivante. */
const TRANSCRIBE_TIMEOUT_MS = 3 * 60_000;

/** Marge laissée sur le disque au-delà de ce qu'il reste à télécharger. */
const DISK_MARGIN_BYTES = 64 * 1024 * 1024;

const MARKER = "verified.json";

export type VoiceStatus =
  | { state: "missing"; bytes: number; received: number }
  | { state: "downloading"; bytes: number; received: number }
  | { state: "ready"; bytes: number };

export type VoiceErrorCode = "model" | "engine" | "network" | "checksum" | "disk" | "cancelled";
export type VoiceResult<T> = { ok: true; value: T } | { ok: false; error: VoiceErrorCode };

/** Le processus de transcription, tel que `utilityProcess.fork` le rend. */
export interface VoiceProcess {
  postMessage(message: ToWorker): void;
  on(event: "message", listener: (message: FromWorker) => void): unknown;
  on(event: "exit", listener: (code: number) => void): unknown;
  kill(): boolean;
}

export interface VoiceOptions {
  /** Dossier du modèle, sous les données de l'app. */
  dir: string;
  spawn: () => VoiceProcess;
  fetchImpl: typeof fetch;
  onStatus?: (status: VoiceStatus) => void;
  model?: VoiceModel;
  threads?: number;
  idleMs?: number;
  timeoutMs?: number;
}

class ChecksumError extends Error {}
class DiskError extends Error {}

const modelBytes = (model: VoiceModel): number => model.files.reduce((total, file) => total + file.bytes, 0);

async function sizeOf(path: string): Promise<number> {
  try {
    return (await stat(path)).size;
  } catch {
    return 0;
  }
}

async function sha256Of(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path, { highWaterMark: 1024 * 1024 })) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

/** Assez de coeurs pour être rapide, sans prendre l'ordinateur : au-delà de quatre, le modèle ne va pas plus vite (E15). */
export function voiceThreads(cores: number = availableParallelism()): number {
  return Math.max(1, Math.min(4, Math.floor(cores / 2)));
}

export class Voice {
  private readonly model: VoiceModel;
  private downloading: Promise<VoiceResult<void>> | null = null;
  private abort: AbortController | null = null;
  private received = 0;
  private lastNotice = 0;

  private child: VoiceProcess | null = null;
  private loaded: Promise<VoiceProcess> | null = null;
  private readonly pending = new Map<number, { resolve: (text: string) => void; reject: (error: Error) => void }>();
  private sequence = 0;
  private idle: NodeJS.Timeout | null = null;

  constructor(private readonly options: VoiceOptions) {
    this.model = options.model ?? VOICE_MODEL;
  }

  private get total(): number {
    return modelBytes(this.model);
  }

  /** Le modèle est là et a été vérifié : la vérification ne se refait pas à chaque clic. */
  private async verified(): Promise<boolean> {
    try {
      const marker = JSON.parse(await readFile(join(this.options.dir, MARKER), "utf8")) as { id?: unknown };
      if (marker.id !== this.model.id) return false;
    } catch {
      return false;
    }
    const sizes = await Promise.all(this.model.files.map((file) => sizeOf(join(this.options.dir, file.name))));
    return this.model.files.every((file, i) => sizes[i] === file.bytes);
  }

  /** Ce qui est déjà sur le disque : les fichiers finis et le morceau du fichier en cours. */
  private async onDisk(): Promise<number> {
    const sizes = await Promise.all(this.model.files.map(async (file) => {
      const finished = await sizeOf(join(this.options.dir, file.name));
      return finished === file.bytes ? finished : Math.min(await sizeOf(this.partOf(file)), file.bytes);
    }));
    return sizes.reduce((total, size) => total + size, 0);
  }

  private partOf(file: VoiceModelFile): string {
    return join(this.options.dir, `${file.name}.part`);
  }

  async status(): Promise<VoiceStatus> {
    if (this.downloading) return { state: "downloading", bytes: this.total, received: this.received };
    if (await this.verified()) return { state: "ready", bytes: this.total };
    return { state: "missing", bytes: this.total, received: await this.onDisk() };
  }

  /** Télécharge le modèle, ou reprend là où il s'était arrêté. Un seul téléchargement à la fois. */
  download(): Promise<VoiceResult<void>> {
    this.downloading ??= this.fetchModel().finally(() => {
      this.downloading = null;
      this.abort = null;
      void this.status().then((status) => this.options.onStatus?.(status));
    });
    return this.downloading;
  }

  cancelDownload(): void {
    this.abort?.abort();
  }

  private async fetchModel(): Promise<VoiceResult<void>> {
    const started = Date.now();
    this.abort = new AbortController();
    try {
      await mkdir(this.options.dir, { recursive: true });
      this.received = await this.onDisk();
      await this.checkSpace(this.total - this.received);
      this.notify(true);
      for (const file of this.model.files) await this.fetchFile(file, this.abort.signal);
      await writeFile(join(this.options.dir, MARKER), JSON.stringify({ id: this.model.id }));
      log.info(`voice: model downloaded (${Math.round(this.total / 1_000_000)} MB) in ${Math.round((Date.now() - started) / 1000)} s`);
      return { ok: true, value: undefined };
    } catch (error) {
      const code = this.abort?.signal.aborted
        ? "cancelled"
        : error instanceof ChecksumError
          ? "checksum"
          : error instanceof DiskError || (error as NodeJS.ErrnoException).code === "ENOSPC"
            ? "disk"
            : "network";
      log.warn(`voice: download stopped (${code}): ${(error as Error).message}`);
      return { ok: false, error: code };
    }
  }

  private async checkSpace(needed: number): Promise<void> {
    const disk = await statfs(this.options.dir).catch(() => null);
    if (disk && disk.bavail * disk.bsize < needed + DISK_MARGIN_BYTES) throw new DiskError("not enough free space");
  }

  private notify(force = false): void {
    const now = Date.now();
    if (!force && now - this.lastNotice < 200) return;
    this.lastNotice = now;
    this.options.onStatus?.({ state: "downloading", bytes: this.total, received: this.received });
  }

  /**
   * Un fichier : repris avec `Range` si un morceau est déjà là, recommencé si le serveur ne reprend pas, puis vérifié
   * contre son empreinte avant de porter son nom. Une empreinte fausse efface le morceau : rien de mauvais ne reste.
   */
  private async fetchFile(file: VoiceModelFile, signal: AbortSignal): Promise<void> {
    const target = join(this.options.dir, file.name);
    if ((await sizeOf(target)) === file.bytes) return;
    const part = this.partOf(file);
    let offset = await sizeOf(part);
    if (offset > file.bytes) {
      await rm(part, { force: true });
      this.received -= file.bytes;
      offset = 0;
    }
    if (offset < file.bytes) {
      const response = await this.options.fetchImpl(`${this.model.base}/${file.name}`, {
        headers: offset > 0 ? { Range: `bytes=${offset}-` } : {},
        signal,
      });
      if (!response.ok || !response.body) throw new Error(`${file.name}: HTTP ${response.status}`);
      if (offset > 0 && response.status !== 206) {
        this.received -= offset;
        offset = 0;
      }
      await this.writeBody(response.body, part, offset > 0);
    }
    if ((await sha256Of(part)) !== file.sha256) {
      await rm(part, { force: true });
      this.received = await this.onDisk();
      throw new ChecksumError(`${file.name}: wrong checksum`);
    }
    await rename(part, target);
  }

  private async writeBody(body: ReadableStream<Uint8Array>, path: string, append: boolean): Promise<void> {
    const sink = createWriteStream(path, { flags: append ? "a" : "w" });
    const failed = new Promise<never>((_resolve, reject) => sink.once("error", reject));
    failed.catch(() => undefined);
    const reader = body.getReader();
    try {
      for (;;) {
        const { done, value } = await Promise.race([reader.read(), failed]);
        if (done) break;
        this.received += value.byteLength;
        this.notify();
        if (!sink.write(value)) await Promise.race([once(sink, "drain"), failed]);
      }
    } finally {
      sink.end();
      await Promise.race([once(sink, "close"), failed]).catch(() => undefined);
    }
  }

  /** Charge le modèle dès le premier clic : il est prêt quand la personne a fini de parler. */
  prepare(): void {
    this.touch();
    this.engine().catch(() => undefined);
  }

  private touch(): void {
    if (this.idle) clearTimeout(this.idle);
    this.idle = setTimeout(() => this.release(), this.options.idleMs ?? IDLE_MS);
    this.idle.unref();
  }

  /** Rend la mémoire du modèle. Il se recharge au clic suivant, le temps que la personne parle. */
  private release(): void {
    if (this.pending.size > 0) {
      this.touch();
      return;
    }
    this.child?.kill();
    this.forget();
  }

  private forget(): void {
    this.child = null;
    this.loaded = null;
    if (this.idle) clearTimeout(this.idle);
    this.idle = null;
  }

  private engine(): Promise<VoiceProcess> {
    if (this.loaded) return this.loaded;
    const child = this.options.spawn();
    this.child = child;
    this.loaded = new Promise<VoiceProcess>((resolve, reject) => {
      child.on("message", (message) => {
        if (message.type === "ready") {
          log.info(`voice: model loaded in ${message.ms} ms`);
          resolve(child);
        } else if (message.type === "failed") {
          log.warn(`voice: the engine could not start: ${message.message}`);
          reject(new Error(message.message));
          this.drop(child);
        } else if (message.type === "text") {
          this.settle(message.id, (entry) => entry.resolve(message.text));
        } else {
          this.settle(message.id, (entry) => entry.reject(new Error(message.message)));
        }
      });
      child.on("exit", (code) => {
        if (this.child !== child) return;
        reject(new Error(`the engine stopped (exit ${code})`));
        log.warn(`voice: the engine stopped (exit ${code})`);
        this.forget();
        this.failPending(new Error("the engine stopped"));
      });
      child.postMessage({ type: "load", dir: this.options.dir, threads: this.options.threads ?? voiceThreads() });
    });
    return this.loaded;
  }

  private drop(child: VoiceProcess): void {
    if (this.child === child) this.forget();
    child.kill();
  }

  private settle(id: number, action: (entry: { resolve: (text: string) => void; reject: (error: Error) => void }) => void): void {
    const entry = this.pending.get(id);
    if (!entry) return;
    this.pending.delete(id);
    action(entry);
  }

  private failPending(error: Error): void {
    for (const entry of this.pending.values()) entry.reject(error);
    this.pending.clear();
  }

  /** Transcrit des échantillons mono à 16 kHz. Le journal note la durée, jamais le texte. */
  async transcribe(samples: Float32Array): Promise<VoiceResult<string>> {
    if (samples.length === 0) return { ok: true, value: "" };
    if (samples.length > MAX_SAMPLES) return { ok: false, error: "engine" };
    if (!(await this.verified())) return { ok: false, error: "model" };
    const started = Date.now();
    let timeout: NodeJS.Timeout | undefined;
    try {
      const child = await this.engine();
      const id = ++this.sequence;
      const text = await new Promise<string>((resolve, reject) => {
        this.pending.set(id, { resolve, reject });
        timeout = setTimeout(() => {
          this.failPending(new Error("timed out"));
          this.drop(child);
        }, this.options.timeoutMs ?? TRANSCRIBE_TIMEOUT_MS);
        child.postMessage({ type: "transcribe", id, samples });
      });
      log.info(`voice: transcribed ${(samples.length / SAMPLE_RATE).toFixed(1)} s of audio in ${Date.now() - started} ms`);
      return { ok: true, value: text };
    } catch (error) {
      log.warn(`voice: transcription failed: ${(error as Error).message}`);
      return { ok: false, error: "engine" };
    } finally {
      clearTimeout(timeout);
      this.touch();
    }
  }

  dispose(): void {
    this.cancelDownload();
    this.release();
  }
}

/** Paquet natif de sherpa-onnx pour cette machine ; `null` là où l'app ne l'embarque pas. */
export function nativePackage(platform: string = process.platform, arch: string = process.arch): string | null {
  if (arch !== "x64") return null;
  if (platform === "win32") return "sherpa-onnx-win-x64";
  return platform === "linux" ? "sherpa-onnx-linux-x64" : null;
}

function enginePresent(): boolean {
  const name = nativePackage();
  if (!name) return false;
  try {
    require.resolve(`${name}/package.json`);
    return true;
  } catch {
    return false;
  }
}

/**
 * La voix existe là où le moteur est embarqué, hors de la version du Microsoft Store : le paquet du Store demanderait de
 * déclarer le micro dans son manifeste, ce qui ne s'essaie pas sans l'installer. Sans moteur, l'interface ne montre aucun micro.
 */
export function voiceAvailable(): boolean {
  return !fromStore() && enginePresent();
}

/** Relie la voix à la fenêtre : le pont `voice` (preload.ts) passe par ces canaux. */
export function registerVoice(window: () => BrowserWindow | null): void {
  if (!voiceAvailable()) return;
  const send = (status: VoiceStatus) => {
    const target = window();
    if (target && !target.isDestroyed()) target.webContents.send("desktop:voice-status", status);
  };
  const voice = new Voice({
    dir: join(app.getPath("userData"), "voice", VOICE_MODEL.id),
    onStatus: send,
    // Le réseau de Chromium : les réglages de proxy de la machine s'appliquent au téléchargement.
    fetchImpl: ((url: string | URL, init?: RequestInit) => net.fetch(String(url), init)) as typeof fetch,
    spawn: () =>
      utilityProcess.fork(join(__dirname, "voice-worker.js"), [], {
        serviceName: "TaskForce voice",
        stdio: "ignore",
      }) as unknown as VoiceProcess,
  });
  ipcMain.handle("desktop:voice-get-status", () => voice.status());
  ipcMain.handle("desktop:voice-download", () => voice.download());
  ipcMain.handle("desktop:voice-cancel-download", () => voice.cancelDownload());
  ipcMain.on("desktop:voice-prepare", () => voice.prepare());
  ipcMain.handle("desktop:voice-transcribe", (_event, samples: unknown) =>
    samples instanceof Float32Array ? voice.transcribe(samples) : { ok: false, error: "engine" });
  app.on("will-quit", () => voice.dispose());
}
