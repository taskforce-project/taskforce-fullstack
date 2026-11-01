import { strict as assert } from "node:assert";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { after, before, beforeEach, describe, it } from "node:test";

import {
  aiEnvironment,
  BackendAi,
  DEFAULT_AI_SETTINGS,
  OLLAMA_URL,
  parseAiInput,
  SHELL_HEADER,
  type AiSettings,
  type AiState,
} from "../src/ai";

describe("parseAiInput", () => {
  it("keeps a valid provider and trims the address", () => {
    const parsed = parseAiInput({ settings: { provider: "custom", baseUrl: " https://api.example.test/v1/ ", model: "m" }, apiKey: " sk-1 " });
    assert.deepEqual(parsed, {
      settings: { provider: "custom", baseUrl: "https://api.example.test/v1", model: "m", modelFast: "", embedModel: "" },
      apiKey: "sk-1",
    });
  });

  it("takes Anthropic's API, without an address", () => {
    const parsed = parseAiInput({ settings: { provider: "anthropic", baseUrl: "https://x", model: "claude-opus-5-5" } });
    assert.equal(parsed.settings.provider, "anthropic");
    assert.equal(parsed.settings.baseUrl, "");
    assert.equal(parsed.settings.model, "claude-opus-5-5");
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

describe("aiEnvironment", () => {
  const models = { model: "m", modelFast: "f", embedModel: "e" };
  const cases: [string, AiSettings, Record<string, string>][] = [
    ["Ollama on the computer", { ...DEFAULT_AI_SETTINGS, ...models, provider: "ollama" },
      { AI_PROVIDER: "ollama", AI_BASE_URL: "", AI_API_KEY: "" }],
    ["an OpenAI-compatible API, with its address and key", { ...models, provider: "custom", baseUrl: "https://api.example.test/v1" },
      { AI_PROVIDER: "openai", AI_BASE_URL: "https://api.example.test/v1", AI_API_KEY: "sk-1" }],
    ["Anthropic's API, with its key", { ...DEFAULT_AI_SETTINGS, ...models, provider: "anthropic" },
      { AI_PROVIDER: "anthropic", AI_BASE_URL: "", AI_API_KEY: "sk-1" }],
    ["no AI", { ...DEFAULT_AI_SETTINGS, ...models, provider: "off" },
      { AI_PROVIDER: "none", AI_BASE_URL: "", AI_API_KEY: "" }],
  ];
  for (const [name, settings, expected] of cases) {
    it(`gives the backend the variables of ${name}`, () => {
      assert.deepEqual(aiEnvironment(settings, "sk-1"), {
        ...expected,
        AI_MODEL: "m",
        AI_MODEL_FAST: "f",
        AI_EMBED_BASE_URL: "",
        AI_EMBED_API_KEY: "",
        AI_EMBED_MODEL: "e",
        OLLAMA_BASE_URL: OLLAMA_URL,
      });
    });
  }

  it("sends an empty key when none is saved, so the previous one does not stay", () => {
    assert.equal(aiEnvironment({ ...DEFAULT_AI_SETTINGS, provider: "anthropic" }, undefined).AI_API_KEY, "");
  });
});

const STATE: AiState = {
  configured: true,
  reachable: true,
  models: ["qwen3:8b", "bge-m3:latest"],
  embedModels: ["qwen3:8b", "bge-m3:latest"],
  chat: { model: "qwen3:8b", model_fast: "qwen3:8b", available: true },
  embeddings: { model: "bge-m3:latest", dimensions: 1024, available: true },
};

/** Faux backend : l'API locale de l'IA, requêtes gardées. */
class FakeBackend {
  server: Server | null = null;
  port = 0;
  status = 200;
  requests: { method: string; url: string; headers: IncomingMessage["headers"]; body: string }[] = [];

  async start(): Promise<void> {
    this.server = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk: Buffer) => (body += chunk.toString()));
      req.on("end", () => {
        this.requests.push({ method: req.method ?? "", url: req.url ?? "", headers: req.headers, body });
        res.writeHead(this.status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(this.status === 200 ? { success: true, data: STATE } : { message: "Forbidden" }));
      });
    });
    await new Promise<void>((resolve) => this.server?.listen(0, "127.0.0.1", () => resolve()));
    const address = this.server.address();
    this.port = typeof address === "object" && address ? address.port : 0;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
  }
}

describe("BackendAi", () => {
  const backend = new FakeBackend();
  const ai = new BackendAi(() => backend.port, "tfd_launch", "tfsh_secret");

  before(() => backend.start());
  after(() => backend.stop());
  beforeEach(() => {
    backend.requests = [];
    backend.status = 200;
  });

  it("reads the state with the launch token and the shell's secret", async () => {
    assert.deepEqual(await ai.state(true), STATE);
    const [request] = backend.requests;
    assert.equal(request?.method, "GET");
    assert.equal(request?.url, "/api/desktop/ai?fresh=true");
    assert.equal(request?.headers.authorization, "Bearer tfd_launch");
    assert.equal(request?.headers[SHELL_HEADER.toLowerCase()], "tfsh_secret");
  });

  it("changes the provider with the variables in the body, never in the address", async () => {
    const variables = aiEnvironment({ ...DEFAULT_AI_SETTINGS, provider: "anthropic" }, "sk-ant-1");
    assert.deepEqual(await ai.apply(variables), STATE);
    const [request] = backend.requests;
    assert.equal(request?.method, "PUT");
    assert.equal(request?.url, "/api/desktop/ai");
    assert.deepEqual(JSON.parse(request?.body ?? "{}"), { variables });
    assert.ok(!request?.url.includes("sk-ant-1"));
  });

  it("says when the backend refuses, without repeating what was sent", async () => {
    backend.status = 403;
    await assert.rejects(ai.apply({ AI_API_KEY: "sk-ant-1" }), (error: Error) => {
      assert.match(error.message, /HTTP 403/);
      assert.ok(!error.message.includes("sk-ant-1"));
      return true;
    });
  });
});
