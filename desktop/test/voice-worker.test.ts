import { strict as assert } from "node:assert";
import { join } from "node:path";
import { describe, it } from "node:test";

import { recognizerConfig, serve, type FromWorker, type Sherpa, type WorkerPort } from "../src/voice-worker";

class FakePort implements WorkerPort {
  readonly sent: FromWorker[] = [];
  private listener: (event: { data: unknown }) => void = () => undefined;

  on(_event: "message", listener: (event: { data: unknown }) => void): void {
    this.listener = listener;
  }

  postMessage(message: FromWorker): void {
    this.sent.push(message);
  }

  send(data: unknown): void {
    this.listener({ data });
  }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 2));

function sherpa(text: string, fail?: "load" | "decode"): Sherpa & { fed: Float32Array[]; config: unknown[] } {
  const fed: Float32Array[] = [];
  const config: unknown[] = [];
  return {
    fed,
    config,
    OfflineRecognizer: {
      createAsync: async (value: unknown) => {
        if (fail === "load") throw new Error("no library");
        config.push(value);
        return {
          createStream: () => ({ acceptWaveform: (wave: { samples: Float32Array; sampleRate: number }) => fed.push(wave.samples) }),
          decodeAsync: async () => {
            if (fail === "decode") throw new Error("decode failed");
            return { text };
          },
        };
      },
    },
  };
}

describe("recognizerConfig", () => {
  it("points at the files of the model, on the processor, without debug output", () => {
    const config = recognizerConfig("D:\\model", 3) as {
      modelConfig: { numThreads: number; debug: number; provider: string; modelType: string; tokens: string; transducer: { encoder: string } };
    };

    assert.equal(config.modelConfig.numThreads, 3);
    assert.equal(config.modelConfig.debug, 0);
    assert.equal(config.modelConfig.provider, "cpu");
    assert.equal(config.modelConfig.modelType, "nemo_transducer");
    assert.equal(config.modelConfig.tokens, join("D:\\model", "tokens.txt"));
    assert.equal(config.modelConfig.transducer.encoder, join("D:\\model", "encoder.int8.onnx"));
  });
});

describe("serve", () => {
  it("loads the model, then writes what was said", async () => {
    const port = new FakePort();
    const engine = sherpa(" Create an issue. ");
    serve(port, () => engine);

    port.send({ type: "load", dir: "/model", threads: 2 });
    await tick();
    assert.equal(port.sent[0]?.type, "ready");

    const samples = new Float32Array(10);
    port.send({ type: "transcribe", id: 7, samples });
    await tick();

    assert.deepEqual(port.sent[1], { type: "text", id: 7, text: "Create an issue." });
    assert.equal(engine.fed[0], samples);
  });

  it("says that the model could not be loaded", async () => {
    const port = new FakePort();
    serve(port, () => sherpa("", "load"));

    port.send({ type: "load", dir: "/model", threads: 2 });
    await tick();

    assert.deepEqual(port.sent, [{ type: "failed", message: "no library" }]);
  });

  it("says that the native engine could not be opened", async () => {
    const port = new FakePort();
    serve(port, () => {
      throw new Error("the addon is blocked");
    });

    port.send({ type: "load", dir: "/model", threads: 2 });
    await tick();

    assert.deepEqual(port.sent, [{ type: "failed", message: "the addon is blocked" }]);
  });

  it("refuses to transcribe before the model is loaded", async () => {
    const port = new FakePort();
    serve(port, () => sherpa("hello"));

    port.send({ type: "transcribe", id: 1, samples: new Float32Array(4) });
    await tick();

    assert.deepEqual(port.sent, [{ type: "error", id: 1, message: "the model is not loaded" }]);
  });

  it("reports a failed transcription with the id of its request", async () => {
    const port = new FakePort();
    serve(port, () => sherpa("hello", "decode"));

    port.send({ type: "load", dir: "/model", threads: 2 });
    await tick();
    port.send({ type: "transcribe", id: 2, samples: new Float32Array(4) });
    await tick();

    assert.deepEqual(port.sent[1], { type: "error", id: 2, message: "decode failed" });
  });

  it("ignores what it does not know", async () => {
    const port = new FakePort();
    serve(port, () => sherpa("hello"));

    port.send({ type: "something-else" });
    await tick();

    assert.equal(port.sent.length, 0);
  });
});
