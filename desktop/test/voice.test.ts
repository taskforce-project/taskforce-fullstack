import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { initLog } from "../src/log";
import { nativePackage, Voice, voiceThreads, type VoiceModel, type VoiceProcess, type VoiceStatus } from "../src/voice";
import type { FromWorker, ToWorker } from "../src/voice-worker";

const sha256 = (data: Buffer) => createHash("sha256").update(data).digest("hex");

const TOKENS = Buffer.from("tokens of the model");
const ENCODER = Buffer.alloc(4096, 7);

function model(overrides: Partial<VoiceModel> = {}): VoiceModel {
  return {
    id: "test-model",
    base: "https://models.test/rev",
    files: [
      { name: "tokens.txt", bytes: TOKENS.length, sha256: sha256(TOKENS) },
      { name: "encoder.onnx", bytes: ENCODER.length, sha256: sha256(ENCODER) },
    ],
    ...overrides,
  };
}

type Call = { url: string; range: string | null };

/** Sert les fichiers du modèle ; `stopAfter` coupe le corps après ce nombre d'octets, comme un réseau qui tombe. */
function server(options: { rangeless?: boolean; stopAfter?: number; status?: number; files?: Record<string, Buffer> } = {}) {
  const calls: Call[] = [];
  const files = options.files ?? { "tokens.txt": TOKENS, "encoder.onnx": ENCODER };
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    const range = headers.get("range");
    calls.push({ url, range });
    if (options.status) return new Response("nope", { status: options.status });
    const body = files[url.split("/").pop() ?? ""];
    if (!body) return new Response("nope", { status: 404 });
    const start = range && !options.rangeless ? Number(/bytes=(\d+)-/.exec(range)?.[1]) : 0;
    const slice = body.subarray(start);
    let delivered = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (delivered) {
          controller.error(new Error("connection lost"));
          return;
        }
        delivered = true;
        controller.enqueue(new Uint8Array(options.stopAfter === undefined ? slice : slice.subarray(0, options.stopAfter)));
        if (options.stopAfter === undefined) controller.close();
      },
    });
    return new Response(stream, { status: start > 0 ? 206 : 200 });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

class FakeProcess extends EventEmitter implements VoiceProcess {
  readonly sent: ToWorker[] = [];
  killed = false;

  postMessage(message: ToWorker): void {
    this.sent.push(message);
  }

  kill(): boolean {
    this.killed = true;
    return true;
  }

  say(message: FromWorker): void {
    this.emit("message", message);
  }
}

describe("Voice", () => {
  let root: string;
  let dir: string;
  let spawned: FakeProcess[];

  const spawn = () => {
    const child = new FakeProcess();
    spawned.push(child);
    return child;
  };

  /** Le modèle déjà téléchargé et vérifié. */
  function installed(id = "test-model") {
    writeFileSync(join(dir, "tokens.txt"), TOKENS);
    writeFileSync(join(dir, "encoder.onnx"), ENCODER);
    writeFileSync(join(dir, "verified.json"), JSON.stringify({ id }));
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "tf-voice-"));
    dir = join(root, "model");
    spawned = [];
    initLog(root);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  describe("the model", () => {
    it("says its size before anything is downloaded", async () => {
      const voice = new Voice({ dir, spawn, fetchImpl: server().fetchImpl, model: model() });

      assert.deepEqual(await voice.status(), { state: "missing", bytes: TOKENS.length + ENCODER.length, received: 0 });
    });

    it("downloads from the pinned address, checks each file and shows its progress", async () => {
      const { fetchImpl, calls } = server();
      const seen: VoiceStatus[] = [];
      const voice = new Voice({ dir, spawn, fetchImpl, model: model(), onStatus: (status) => seen.push(status) });

      assert.deepEqual(await voice.download(), { ok: true, value: undefined });

      assert.deepEqual(calls.map((call) => call.url), ["https://models.test/rev/tokens.txt", "https://models.test/rev/encoder.onnx"]);
      assert.deepEqual(readFileSync(join(dir, "encoder.onnx")), ENCODER);
      assert.equal(existsSync(join(dir, "encoder.onnx.part")), false);
      assert.deepEqual(await voice.status(), { state: "ready", bytes: TOKENS.length + ENCODER.length });
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(seen[0]?.state, "downloading");
      assert.equal(seen.at(-1)?.state, "ready");
    });

    it("says that a download is running, and starts only one", async () => {
      const { fetchImpl, calls } = server();
      const voice = new Voice({ dir, spawn, fetchImpl, model: model() });

      const first = voice.download();
      const second = voice.download();

      assert.equal(first, second);
      assert.equal((await voice.status()).state, "downloading");
      await first;
      assert.equal(calls.length, 2);
    });

    it("throws away a file whose checksum is wrong and says so", async () => {
      const { fetchImpl } = server({ files: { "tokens.txt": Buffer.from("something else entirely"), "encoder.onnx": ENCODER } });
      const voice = new Voice({ dir, spawn, fetchImpl, model: model() });

      assert.deepEqual(await voice.download(), { ok: false, error: "checksum" });
      assert.equal(existsSync(join(dir, "tokens.txt.part")), false);
      assert.equal(existsSync(join(dir, "tokens.txt")), false);
      assert.equal((await voice.status()).state, "missing");
    });

    it("keeps what it has when the network fails, then resumes where it stopped", async () => {
      const broken = server({ stopAfter: 1000, files: { "tokens.txt": TOKENS, "encoder.onnx": ENCODER } });
      // Le petit fichier passe en entier, le gros s'arrête à 1 000 octets.
      const whole = server();
      let failNext = true;
      const fetchImpl = ((url: string | URL, init?: RequestInit) =>
        String(url).endsWith("encoder.onnx") && failNext ? broken.fetchImpl(url, init) : whole.fetchImpl(url, init)) as typeof fetch;
      const voice = new Voice({ dir, spawn, fetchImpl, model: model() });

      assert.deepEqual(await voice.download(), { ok: false, error: "network" });
      assert.deepEqual(await voice.status(), { state: "missing", bytes: TOKENS.length + ENCODER.length, received: TOKENS.length + 1000 });

      failNext = false;
      assert.deepEqual(await voice.download(), { ok: true, value: undefined });

      assert.deepEqual(whole.calls.at(-1), { url: "https://models.test/rev/encoder.onnx", range: "bytes=1000-" });
      assert.equal(whole.calls.filter((call) => call.url.endsWith("tokens.txt")).length, 1);
      assert.deepEqual(readFileSync(join(dir, "encoder.onnx")), ENCODER);
    });

    it("starts the file over when the server ignores the range", async () => {
      await new Voice({ dir, spawn, fetchImpl: server({ stopAfter: 5 }).fetchImpl, model: model() }).download();
      assert.equal(existsSync(join(dir, "tokens.txt.part")), true);

      const again = new Voice({ dir, spawn, fetchImpl: server({ rangeless: true }).fetchImpl, model: model() });

      assert.deepEqual(await again.download(), { ok: true, value: undefined });
      assert.deepEqual(readFileSync(join(dir, "tokens.txt")), TOKENS);
    });

    it("starts over from a part longer than the file", async () => {
      await new Voice({ dir, spawn, fetchImpl: server({ stopAfter: 1 }).fetchImpl, model: model() }).download();
      writeFileSync(join(dir, "tokens.txt.part"), Buffer.alloc(TOKENS.length + 50, 1));

      const voice = new Voice({ dir, spawn, fetchImpl: server().fetchImpl, model: model() });

      assert.deepEqual(await voice.download(), { ok: true, value: undefined });
      assert.deepEqual(readFileSync(join(dir, "tokens.txt")), TOKENS);
    });

    it("says that a server error stopped the download", async () => {
      const voice = new Voice({ dir, spawn, fetchImpl: server({ status: 503 }).fetchImpl, model: model() });

      assert.deepEqual(await voice.download(), { ok: false, error: "network" });
    });

    it("says that the disk is too full, before downloading", async () => {
      const { fetchImpl, calls } = server();
      const huge = model({ files: [{ name: "tokens.txt", bytes: 2 ** 62, sha256: "x" }] });
      const voice = new Voice({ dir, spawn, fetchImpl, model: huge });

      assert.deepEqual(await voice.download(), { ok: false, error: "disk" });
      assert.equal(calls.length, 0);
    });

    it("stops when the person cancels, and keeps what it has", async () => {
      let abortBody: (() => void) | undefined;
      const fetchImpl = (async (_url: string | URL, init?: RequestInit) => {
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array([1, 2, 3]));
            abortBody = () => controller.error(new Error("aborted"));
            init?.signal?.addEventListener("abort", () => abortBody?.());
          },
        });
        return new Response(stream, { status: 200 });
      }) as typeof fetch;
      const voice = new Voice({ dir, spawn, fetchImpl, model: model() });

      const running = voice.download();
      await new Promise((resolve) => setTimeout(resolve, 20));
      voice.cancelDownload();

      assert.deepEqual(await running, { ok: false, error: "cancelled" });
      assert.deepEqual(await voice.status(), { state: "missing", bytes: TOKENS.length + ENCODER.length, received: 3 });
    });

    it("does not trust a model verified for another version", async () => {
      await new Voice({ dir, spawn, fetchImpl: server().fetchImpl, model: model() }).download();
      installed("older-model");

      const voice = new Voice({ dir, spawn, fetchImpl: server().fetchImpl, model: model() });

      assert.equal((await voice.status()).state, "missing");
    });

    it("does not trust a verified model with a truncated file", async () => {
      await new Voice({ dir, spawn, fetchImpl: server().fetchImpl, model: model() }).download();
      writeFileSync(join(dir, "encoder.onnx"), Buffer.alloc(10));

      const voice = new Voice({ dir, spawn, fetchImpl: server().fetchImpl, model: model() });

      assert.equal((await voice.status()).state, "missing");
    });
  });

  describe("the transcription", () => {
    const samples = new Float32Array(16_000 * 2);

    async function ready(options: { idleMs?: number; timeoutMs?: number } = {}) {
      const voice = new Voice({ dir, spawn, fetchImpl: server().fetchImpl, model: model(), threads: 2, ...options });
      await voice.download();
      return voice;
    }

    const flush = () => new Promise((resolve) => setTimeout(resolve, 5));

    it("loads the model at the first click, once", async () => {
      const voice = await ready();

      voice.prepare();
      voice.prepare();

      assert.equal(spawned.length, 1);
      assert.deepEqual(spawned[0]?.sent[0], { type: "load", dir, threads: 2 });
    });

    it("transcribes off the main thread and logs durations, never the text", async () => {
      const voice = await ready();

      const running = voice.transcribe(samples);
      await flush();
      const child = spawned[0] as FakeProcess;
      child.say({ type: "ready", ms: 1200 });
      await flush();
      const request = child.sent[1] as Extract<ToWorker, { type: "transcribe" }>;
      assert.equal(request.samples, samples);
      child.say({ type: "text", id: request.id, text: "Create an issue about the secret launch" });

      assert.deepEqual(await running, { ok: true, value: "Create an issue about the secret launch" });
      const journal = readFileSync(join(root, "desktop.log"), "utf8");
      assert.match(journal, /voice: transcribed 2\.0 s of audio in \d+ ms/);
      assert.equal(journal.includes("secret launch"), false);
    });

    it("says that the model is missing", async () => {
      const voice = new Voice({ dir, spawn, fetchImpl: server().fetchImpl, model: model() });

      assert.deepEqual(await voice.transcribe(samples), { ok: false, error: "model" });
      assert.equal(spawned.length, 0);
    });

    it("has nothing to do with no audio", async () => {
      const voice = await ready();

      assert.deepEqual(await voice.transcribe(new Float32Array(0)), { ok: true, value: "" });
      assert.equal(spawned.length, 0);
    });

    it("refuses a recording longer than the composer allows", async () => {
      const voice = await ready();

      assert.deepEqual(await voice.transcribe(new Float32Array(16_000 * 130)), { ok: false, error: "engine" });
      assert.equal(spawned.length, 0);
    });

    it("says that the engine failed to start, and tries again at the next click", async () => {
      const voice = await ready();

      const running = voice.transcribe(samples);
      await flush();
      (spawned[0] as FakeProcess).say({ type: "failed", message: "cannot load the library" });

      assert.deepEqual(await running, { ok: false, error: "engine" });
      assert.equal(spawned[0]?.killed, true);

      voice.prepare();
      assert.equal(spawned.length, 2);
    });

    it("says that the engine stopped when it crashes during a transcription", async () => {
      const voice = await ready();

      const running = voice.transcribe(samples);
      await flush();
      const child = spawned[0] as FakeProcess;
      child.say({ type: "ready", ms: 10 });
      await flush();
      child.emit("exit", 139);

      assert.deepEqual(await running, { ok: false, error: "engine" });
    });

    it("says that the transcription failed when the engine reports an error", async () => {
      const voice = await ready();

      const running = voice.transcribe(samples);
      await flush();
      const child = spawned[0] as FakeProcess;
      child.say({ type: "ready", ms: 10 });
      await flush();
      child.say({ type: "error", id: (child.sent[1] as { id: number }).id, message: "decode failed" });

      assert.deepEqual(await running, { ok: false, error: "engine" });
    });

    it("gives up on a blocked transcription and relaunches at the next request", async () => {
      const voice = await ready({ timeoutMs: 10 });

      const running = voice.transcribe(samples);
      await flush();
      const child = spawned[0] as FakeProcess;
      child.say({ type: "ready", ms: 10 });

      assert.deepEqual(await running, { ok: false, error: "engine" });
      assert.equal(child.killed, true);
      voice.prepare();
      assert.equal(spawned.length, 2);
    });

    it("ignores the answer to a request nobody waits for any more", async () => {
      const voice = await ready();
      voice.prepare();
      const child = spawned[0] as FakeProcess;

      assert.doesNotThrow(() => child.say({ type: "text", id: 999, text: "late" }));
    });

    it("gives the memory back when idle, and reloads at the next click", async () => {
      const voice = await ready({ idleMs: 5 });

      voice.prepare();
      const child = spawned[0] as FakeProcess;
      child.say({ type: "ready", ms: 10 });
      await new Promise((resolve) => setTimeout(resolve, 30));

      assert.equal(child.killed, true);
      child.emit("exit", 0);
      voice.prepare();
      assert.equal(spawned.length, 2);
    });

    it("keeps the engine while a transcription is running", async () => {
      const voice = await ready({ idleMs: 5 });

      const running = voice.transcribe(samples);
      await flush();
      const child = spawned[0] as FakeProcess;
      child.say({ type: "ready", ms: 10 });
      await new Promise((resolve) => setTimeout(resolve, 30));

      assert.equal(child.killed, false);
      child.say({ type: "text", id: (child.sent[1] as { id: number }).id, text: "ok" });
      assert.deepEqual(await running, { ok: true, value: "ok" });
      voice.dispose();
    });

    it("stops the engine and the download on dispose", async () => {
      const voice = await ready();
      voice.prepare();

      voice.dispose();

      assert.equal(spawned[0]?.killed, true);
    });
  });
});

describe("voiceThreads", () => {
  for (const [cores, threads] of [[1, 1], [2, 1], [4, 2], [8, 4], [16, 4], [64, 4]] as const) {
    it(`uses ${threads} of ${cores} cores`, () => {
      assert.equal(voiceThreads(cores), threads);
    });
  }
});

describe("nativePackage", () => {
  const cases: [string, string, string | null][] = [
    ["win32", "x64", "sherpa-onnx-win-x64"],
    ["linux", "x64", "sherpa-onnx-linux-x64"],
    ["win32", "arm64", null],
    ["linux", "arm64", null],
    ["darwin", "x64", null],
  ];
  for (const [platform, arch, name] of cases) {
    it(`${platform} ${arch}: ${name ?? "no voice"}`, () => {
      assert.equal(nativePackage(platform, arch), name);
    });
  }
});
