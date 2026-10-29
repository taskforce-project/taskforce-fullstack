import { strict as assert } from "node:assert";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { after, before, beforeEach, describe, it } from "node:test";

import {
  AiRelay,
  DEFAULT_AI_SETTINGS,
  EMBEDDING_DIM,
  nativeReasoningOff,
  parseAiInput,
  pickModel,
  resolveModels,
  stripThinking,
  withNoThink,
  type AiSettings,
} from "../src/ai";

describe("withNoThink", () => {
  const messages = [{ role: "system", content: "Be brief." }, { role: "user", content: "Summarise  " }];

  it("asks Qwen3 to skip its reasoning on the last message", () => {
    const out = withNoThink(messages, "qwen3:8b", false);
    assert.equal(out[1]?.content, "Summarise /no_think");
    assert.equal(messages[1]?.content, "Summarise  ", "the caller's list is left untouched");
  });

  const unchanged: [string, string, boolean][] = [
    ["another model", "llama3.1:8b", false],
    ["a deep answer", "qwen3:8b", true],
  ];
  for (const [name, model, think] of unchanged) {
    it(`leaves the messages alone for ${name}`, () => {
      assert.equal(withNoThink(messages, model, think), messages);
    });
  }
});

describe("nativeReasoningOff", () => {
  const cases: [AiSettings["provider"], string, boolean, boolean][] = [
    ["ollama", "qwen3:8b", false, true],
    ["ollama", "qwen3:8b", true, false],
    ["ollama", "llama3.1:8b", false, false],
    ["custom", "qwen3:8b", false, false],
  ];
  for (const [provider, model, think, off] of cases) {
    it(`${provider}, ${model}, think ${think}: ${off ? "off" : "untouched"}`, () => {
      assert.equal(nativeReasoningOff(provider, model, think), off);
    });
  }
});

describe("stripThinking", () => {
  it("removes the reasoning block left in the answer", () => {
    assert.deepEqual(stripThinking({ role: "assistant", content: "<think>hmm</think>\n{\"ok\":true}" }), {
      role: "assistant",
      content: "{\"ok\":true}",
    });
  });
});

describe("model choice", () => {
  const installed = ["nomic-embed-text:latest", "llama3.1:8b", "bge-m3:latest", "qwen3:8b"];

  it("finds a preferred model under its tag", () => {
    assert.equal(pickModel(installed, ["bge-m3"]), "bge-m3:latest");
    assert.equal(pickModel(installed, ["mxbai-embed-large"]), null);
  });

  it("completes empty choices from what is installed", () => {
    assert.deepEqual(resolveModels(DEFAULT_AI_SETTINGS, installed), { chat: "qwen3:8b", fast: "qwen3:8b", embed: "bge-m3:latest" });
  });

  it("keeps the person's choices", () => {
    const chosen: AiSettings = { ...DEFAULT_AI_SETTINGS, model: "llama3.1:8b", modelFast: "qwen3:8b", embedModel: "x" };
    assert.deepEqual(resolveModels(chosen, installed), { chat: "llama3.1:8b", fast: "qwen3:8b", embed: "x" });
  });

  it("falls back on any chat model, never an embedding one", () => {
    assert.deepEqual(resolveModels(DEFAULT_AI_SETTINGS, ["bge-m3", "phi4:latest"]).chat, "phi4:latest");
  });
});

describe("parseAiInput", () => {
  it("keeps a valid provider and trims the address", () => {
    const parsed = parseAiInput({ settings: { provider: "custom", baseUrl: " https://api.example.test/v1/ ", model: "m" }, apiKey: " sk-1 " });
    assert.deepEqual(parsed, {
      settings: { provider: "custom", baseUrl: "https://api.example.test/v1", model: "m", modelFast: "", embedModel: "" },
      apiKey: "sk-1",
    });
  });

  it("falls back on Ollama for an unknown provider and drops the address", () => {
    assert.deepEqual(parseAiInput({ settings: { provider: "other", baseUrl: "https://x" } }).settings.provider, "ollama");
    assert.equal(parseAiInput({ settings: { provider: "ollama", baseUrl: "https://x" } }).settings.baseUrl, "");
  });

  it("refuses an API without address", () => {
    assert.throws(() => parseAiInput({ settings: { provider: "custom", baseUrl: "file:///etc" } }), /address of the API/);
  });

  const keys: [unknown, string | null | undefined][] = [[undefined, undefined], [null, null], ["", ""]];
  for (const [given, expected] of keys) {
    it(`reads the key ${JSON.stringify(given)} as ${JSON.stringify(expected)}`, () => {
      assert.equal(parseAiInput({ settings: {}, apiKey: given }).apiKey, expected);
    });
  }
});

/** Faux fournisseur compatible OpenAI : liste de modèles, conversation et embeddings, requêtes gardées. */
class FakeProvider {
  server: Server | null = null;
  port = 0;
  requests: { path: string; body: Record<string, unknown>; auth: string | undefined }[] = [];
  models = ["qwen3:8b", "bge-m3:latest"];
  /** Taille de requête refusée au-delà de ce nombre d'outils (413), comme un fournisseur au payload borné. */
  maxTools = Number.POSITIVE_INFINITY;
  dimensions = EMBEDDING_DIM;

  async start(): Promise<void> {
    this.server = createServer(async (req, res) => {
      const body = JSON.parse((await read(req)) || "{}") as Record<string, unknown>;
      const path = req.url ?? "/";
      this.requests.push({ path, body, auth: req.headers.authorization });
      const json = (status: number, value: unknown) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(value));
      };
      if (path === "/v1/models") return json(200, { data: this.models.map((id) => ({ id })) });
      if (path === "/v1/chat/completions") {
        if (Array.isArray(body.tools) && body.tools.length > this.maxTools) return json(413, { error: "too large" });
        return json(200, {
          choices: [{ message: { role: "assistant", content: `<think>x</think>answer from ${String(body.model)}` } }],
          usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
        });
      }
      if (path === "/v1/embeddings") {
        const input = body.input as string[];
        return json(200, { data: input.map((_, index) => ({ index, embedding: new Array(this.dimensions).fill(0.5) })).reverse() });
      }
      json(404, {});
    });
    await new Promise<void>((resolve) => this.server?.listen(0, "127.0.0.1", () => resolve()));
    const address = this.server.address();
    this.port = typeof address === "object" && address ? address.port : 0;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
  }
}

function read(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk: Buffer) => (data += chunk.toString()));
    req.on("end", () => resolve(data));
  });
}

describe("AiRelay", () => {
  const provider = new FakeProvider();
  let current: { settings: AiSettings; apiKey: string | undefined };
  const relay = new AiRelay(() => current);

  const ask = async (path: string, body?: unknown, token = relay.token) => {
    const response = await fetch(`${relay.url()}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: (await response.json()) as Record<string, any> };
  };

  before(async () => {
    await provider.start();
    await relay.start();
  });
  after(async () => {
    await relay.stop();
    await provider.stop();
  });
  beforeEach(() => {
    provider.requests = [];
    provider.maxTools = Number.POSITIVE_INFINITY;
    provider.dimensions = EMBEDDING_DIM;
    current = {
      settings: { ...DEFAULT_AI_SETTINGS, provider: "custom", baseUrl: `http://127.0.0.1:${provider.port}/v1` },
      apiKey: "sk-test",
    };
    relay.invalidate();
  });

  it("refuses a caller without the launch secret", async () => {
    assert.equal((await ask("/v1/status", undefined, "wrong")).status, 401);
  });

  it("reports the models in the shape the backend reads", async () => {
    const { status, body } = await ask("/v1/status");
    assert.equal(status, 200);
    assert.deepEqual(body, {
      configured: true,
      chat: { model: "qwen3:8b", model_fast: "qwen3:8b", available: true },
      embeddings: { model: "bge-m3:latest", dimensions: EMBEDDING_DIM, available: true },
    });
    assert.equal(provider.requests[0]?.auth, "Bearer sk-test", "the key goes to the provider only");
  });

  it("says a chosen model that is not installed is unavailable", async () => {
    current.settings = { ...current.settings, model: "missing:1b" };
    assert.equal((await ask("/v1/status")).body.chat.available, false);
  });

  it("reports AI off when the person turned it off", async () => {
    current.settings = { ...current.settings, provider: "off" };
    const { body } = await ask("/v1/status");
    assert.equal(body.configured, false);
    assert.equal((await ask("/v1/chat", { messages: [] })).status, 503);
  });

  it("answers a chat with the tier's model, without the reasoning", async () => {
    const { status, body } = await ask("/v1/chat", { messages: [{ role: "user", content: "Hi" }], tier: "fast", json_mode: true });
    assert.equal(status, 200);
    assert.equal(body.model, "qwen3:8b");
    assert.equal(body.message.content, "answer from qwen3:8b");
    assert.deepEqual(body.usage, { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 });
    const sent = provider.requests.find((r) => r.path === "/v1/chat/completions")?.body;
    assert.deepEqual(sent?.response_format, { type: "json_object" });
    assert.equal((sent?.messages as { content: string }[])[0]?.content, "Hi /no_think");
  });

  it("halves the tools until the provider accepts the request", async () => {
    provider.maxTools = 2;
    const tools = Array.from({ length: 8 }, (_, i) => ({ type: "function", function: { name: `t${i}` } }));
    const { status } = await ask("/v1/chat", { messages: [{ role: "user", content: "Hi" }], tools });
    assert.equal(status, 200);
    const sizes = provider.requests.filter((r) => r.path === "/v1/chat/completions").map((r) => (r.body.tools as unknown[]).length);
    assert.deepEqual(sizes, [8, 4, 2]);
  });

  it("never answers without the tools: refused down to the last one, it says so", async () => {
    provider.maxTools = 0;
    const tools = Array.from({ length: 8 }, (_, i) => ({ type: "function", function: { name: `t${i}` } }));
    const { status, body } = await ask("/v1/chat", { messages: [{ role: "user", content: "Hi" }], tools });
    assert.equal(status, 422);
    assert.equal(body.detail, "AI provider refused the tools (HTTP 413)");
    const sizes = provider.requests.filter((r) => r.path === "/v1/chat/completions").map((r) => (r.body.tools as unknown[] | undefined)?.length ?? 0);
    assert.deepEqual(sizes, [8, 4, 2, 1], "no request goes out without the tools");
  });

  it("keeps the reasoning setting to Ollama, where it is known", async () => {
    await ask("/v1/chat", { messages: [{ role: "user", content: "Hi" }], tier: "fast" });
    const sent = provider.requests.find((r) => r.path === "/v1/chat/completions")?.body;
    assert.equal(sent?.reasoning_effort, undefined);
  });

  it("returns the vectors in the order of the texts", async () => {
    const { status, body } = await ask("/v1/embeddings", { texts: ["a", "b"] });
    assert.equal(status, 200);
    assert.equal(body.vectors.length, 2);
    assert.equal(body.dimensions, EMBEDDING_DIM);
  });

  it("refuses vectors the database cannot store", async () => {
    provider.dimensions = 768;
    const { status, body } = await ask("/v1/embeddings", { texts: ["a"] });
    assert.equal(status, 503);
    assert.match(body.detail, /768 dimensions/);
  });
});
