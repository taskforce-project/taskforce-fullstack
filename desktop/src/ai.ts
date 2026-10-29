import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { log } from "./log";
import { freePort, randomToken } from "./net";

/**
 * IA de l'app desktop. Le backend parle le protocole de l'ai-service de la webapp (`GET /v1/status`, `POST /v1/chat`,
 * `POST /v1/embeddings`, cf. ai-service/app) ; ici c'est la coque qui le sert, sur 127.0.0.1 avec un secret tiré au
 * lancement, et qui relaie vers le fournisseur choisi par la personne : Ollama sur l'ordinateur (défaut) ou une API
 * compatible OpenAI. La clé d'API reste dans le trousseau du système, ni le backend ni la base ne la voient.
 * Comportement aligné sur ai-service/app/services/provider.py : paliers, `/no_think` de Qwen3, outils réduits de
 * moitié sur un refus 400 ou 413, vecteurs de 1024 dimensions.
 */

/** Dimension des vecteurs : celle de la colonne pgvector `knowledge_nodes.embedding vector(1024)` (V59). */
export const EMBEDDING_DIM = 1024;
/** Ollama sur l'ordinateur, par son API compatible OpenAI. */
export const OLLAMA_URL = "http://127.0.0.1:11434/v1";
const USER_AGENT = "TaskForce-Desktop/1.0";
const CHAT_TIMEOUT_MS = 120_000;
const STATUS_TTL_MS = 30_000;

/** Modèles de conversation essayés dans l'ordre quand la personne n'en a pas choisi (rapides, gèrent les outils). */
const CHAT_PREFERENCES = ["qwen3:8b", "qwen2.5:7b-instruct", "qwen3:4b", "llama3.1:8b", "mistral-nemo", "gemma3:4b"];
/** Modèles d'embeddings de 1024 dimensions, la seule taille que la base accepte. */
const EMBED_PREFERENCES = ["bge-m3", "mxbai-embed-large"];
const EMBEDDING_NAME = /embed|bge|minilm|nomic|e5-|gte-/i;

/** Choix de la personne, gardé dans les réglages de son compte (la clé à part, chiffrée). */
export interface AiSettings {
  /** `ollama` : Ollama sur cet ordinateur ; `custom` : API compatible OpenAI ; `off` : pas d'IA. */
  provider: "ollama" | "custom" | "off";
  /** URL de base de l'API compatible OpenAI, avec `/v1` (`custom` seulement). */
  baseUrl: string;
  /** Modèle de conversation ; vide = choisi parmi les modèles installés (Ollama). */
  model: string;
  /** Modèle des réponses courtes ; vide = le modèle de conversation. */
  modelFast: string;
  /** Modèle d'embeddings ; vide = choisi parmi les modèles installés (Ollama). */
  embedModel: string;
}

export const DEFAULT_AI_SETTINGS: AiSettings = { provider: "ollama", baseUrl: "", model: "", modelFast: "", embedModel: "" };

/** État lu par le backend (`GET /v1/status`, même forme que l'ai-service) et par l'écran de réglages. */
export interface AiState {
  configured: boolean;
  /** Le fournisseur répond, avec la liste de ses modèles. */
  reachable: boolean;
  models: string[];
  chat: { model: string | null; model_fast: string | null; available: boolean };
  embeddings: { model: string | null; dimensions: number; available: boolean };
}

class ProviderError extends Error {
  constructor(message: string, readonly status = 503) {
    super(message);
  }
}

/** Vrai pour un modèle Qwen3, seul à comprendre `/no_think`. */
export function isQwen3(model: string): boolean {
  return model.toLowerCase().includes("qwen3");
}

type Message = Record<string, unknown>;

/** Ajoute `/no_think` au dernier message d'un modèle Qwen3 quand le raisonnement n'est pas voulu (réponse plus rapide). */
export function withNoThink(messages: Message[], model: string, think: boolean): Message[] {
  if (think || messages.length === 0 || !isQwen3(model)) return messages;
  const out = [...messages];
  const last = { ...out[out.length - 1] };
  const content = String(last.content ?? "").trimEnd();
  if (!content.includes("/no_think")) last.content = `${content} /no_think`.trim();
  out[out.length - 1] = last;
  return out;
}

/**
 * Vrai quand le raisonnement se coupe par le réglage natif d'Ollama (`reasoning_effort: "none"`) : Ollama 0.40 ignore
 * `/no_think`, et Qwen3 raisonnait à chaque réponse (même appel d'outil : 2,9 s puis 0,5 s, mesuré le 29/10/2026).
 * Ailleurs, le réglage n'est pas garanti : on ne l'envoie pas.
 */
export function nativeReasoningOff(provider: AiSettings["provider"], model: string, think: boolean): boolean {
  return !think && provider === "ollama" && isQwen3(model);
}

/** Retire un bloc `<think>…</think>` resté dans la réponse : les appelants attendent la réponse seule, parfois un JSON. */
export function stripThinking(message: Message): Message {
  const content = message.content;
  if (typeof content === "string" && content.includes("<think>")) {
    return { ...message, content: content.replace(/<think>[\s\S]*?<\/think>\s*/g, "").trim() };
  }
  return message;
}

/** Premier modèle installé qui correspond à une préférence (`bge-m3` trouve `bge-m3:latest`). */
export function pickModel(installed: string[], preferences: string[]): string | null {
  for (const wanted of preferences) {
    const found = installed.find((id) => id === wanted || id.startsWith(`${wanted}:`) || id.split("/").pop() === wanted);
    if (found) return found;
  }
  return null;
}

/** Modèles effectivement utilisés, une fois les choix vides complétés par ce qui est installé. */
export function resolveModels(settings: AiSettings, installed: string[]): { chat: string | null; fast: string | null; embed: string | null } {
  const chatModels = installed.filter((id) => !EMBEDDING_NAME.test(id));
  const chat = settings.model || pickModel(installed, CHAT_PREFERENCES) || chatModels[0] || null;
  return {
    chat,
    fast: settings.modelFast || chat,
    embed: settings.embedModel || pickModel(installed, EMBED_PREFERENCES),
  };
}

/**
 * Réglages reçus de l'interface, vérifiés avant d'être gardés : la page n'est jamais crue sur parole. `apiKey` vaut
 * `undefined` pour garder la clé enregistrée, `null` ou une chaîne vide pour l'effacer.
 */
export function parseAiInput(input: unknown): { settings: AiSettings; apiKey: string | null | undefined } {
  const value = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const raw = (value.settings && typeof value.settings === "object" ? value.settings : {}) as Record<string, unknown>;
  const text = (name: string, max: number) => (typeof raw[name] === "string" ? (raw[name] as string).trim().slice(0, max) : "");
  const provider = raw.provider === "custom" || raw.provider === "off" ? raw.provider : "ollama";
  const baseUrl = text("baseUrl", 500).replace(/\/+$/, "");
  if (provider === "custom" && !/^https?:\/\/\S+$/i.test(baseUrl)) {
    throw new Error("Enter the address of the API, for example https://api.openai.com/v1");
  }
  const apiKey = value.apiKey === null ? null : typeof value.apiKey === "string" ? value.apiKey.trim().slice(0, 500) : undefined;
  return {
    settings: {
      provider,
      baseUrl: provider === "custom" ? baseUrl : "",
      model: text("model", 200),
      modelFast: text("modelFast", 200),
      embedModel: text("embedModel", 200),
    },
    apiKey,
  };
}

/** Relais local entre le backend et le fournisseur d'IA. */
export class AiRelay {
  port = 0;
  readonly token = randomToken("tfai_");
  private server: Server | null = null;
  private cached: { state: AiState; at: number } | null = null;

  /**
   * @param current réglages et clé du compte, relus à chaque appel : un changement dans les réglages vaut tout de suite.
   */
  constructor(private readonly current: () => { settings: AiSettings; apiKey: string | undefined }) {}

  url(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  async start(): Promise<void> {
    this.port = await freePort();
    this.server = createServer((req, res) => {
      void this.handle(req, res).catch((error: Error) => {
        log.warn(`AI relay: ${error.message}`);
        if (!res.headersSent) send(res, 500, { detail: "AI relay error" });
      });
    });
    await new Promise<void>((resolve, reject) => {
      this.server?.once("error", reject);
      this.server?.listen(this.port, "127.0.0.1", () => resolve());
    });
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => (this.server ? this.server.close(() => resolve()) : resolve()));
    this.server = null;
  }

  /** Oublie l'état en cache (réglages changés) : la prochaine lecture interroge le fournisseur. */
  invalidate(): void {
    this.cached = null;
  }

  /** État courant, gardé 30 s comme dans l'ai-service ; `fresh` force une nouvelle lecture (écran de réglages). */
  async state(fresh = false): Promise<AiState> {
    if (!fresh && this.cached && Date.now() - this.cached.at < STATUS_TTL_MS) return this.cached.state;
    const state = await this.compute();
    this.cached = { state, at: Date.now() };
    return state;
  }

  private endpoint(): { baseUrl: string; apiKey: string | undefined; settings: AiSettings } {
    const { settings, apiKey } = this.current();
    const baseUrl = (settings.provider === "custom" ? settings.baseUrl : OLLAMA_URL).replace(/\/+$/, "");
    return { baseUrl, apiKey: settings.provider === "custom" ? apiKey : undefined, settings };
  }

  private async compute(): Promise<AiState> {
    const { baseUrl, apiKey, settings } = this.endpoint();
    const off: AiState = {
      configured: false,
      reachable: false,
      models: [],
      chat: { model: null, model_fast: null, available: false },
      embeddings: { model: null, dimensions: EMBEDDING_DIM, available: false },
    };
    if (settings.provider === "off" || (settings.provider === "custom" && !settings.baseUrl)) return off;
    let installed: string[];
    try {
      const listing = (await call(`${baseUrl}/models`, null, apiKey, 3_000)) as { data?: { id?: string }[] };
      installed = (listing.data ?? []).map((row) => row.id ?? "").filter(Boolean);
    } catch {
      return { ...off, configured: true };
    }
    const models = resolveModels(settings, installed);
    // Un modèle choisi mais absent de la liste ne répondrait pas : on le dit au lieu d'échouer à chaque appel.
    const listed = (model: string | null) => model !== null && (installed.length === 0 || installed.includes(model));
    return {
      configured: true,
      reachable: true,
      models: installed,
      chat: { model: models.chat, model_fast: models.fast, available: listed(models.chat) && listed(models.fast) },
      embeddings: { model: models.embed, dimensions: EMBEDDING_DIM, available: listed(models.embed) },
    };
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!this.authorized(req.headers.authorization)) {
      send(res, 401, { detail: "Invalid service token" });
      return;
    }
    const path = (req.url ?? "/").split("?")[0];
    if (req.method === "GET" && path === "/v1/status") {
      const state = await this.state();
      send(res, 200, { configured: state.configured, chat: state.chat, embeddings: state.embeddings });
      return;
    }
    if (req.method === "POST" && (path === "/v1/chat" || path === "/v1/embeddings")) {
      const body = JSON.parse((await readBody(req)) || "{}") as Record<string, unknown>;
      try {
        send(res, 200, path === "/v1/chat" ? await this.chat(body) : await this.embed(body));
      } catch (error) {
        const failure = error instanceof ProviderError ? error : new ProviderError((error as Error).message);
        if (path === "/v1/chat") this.invalidate();
        send(res, failure.status, { detail: failure.message });
      }
      return;
    }
    send(res, 404, { detail: "Not found" });
  }

  private authorized(header: string | undefined): boolean {
    const [scheme, value] = (header ?? "").split(" ");
    if (scheme?.toLowerCase() !== "bearer" || !value) return false;
    const given = Buffer.from(value);
    const expected = Buffer.from(this.token);
    return given.length === expected.length && timingSafeEqual(given, expected);
  }

  /** `POST /v1/chat` : palier → modèle, puis `/chat/completions` du fournisseur. */
  private async chat(body: Record<string, unknown>): Promise<unknown> {
    const state = await this.state();
    if (!state.configured) throw new ProviderError("AI is turned off on this computer");
    const tier = typeof body.tier === "string" ? body.tier : null;
    const fast = tier === "fast";
    const model = (fast ? state.chat.model_fast : state.chat.model) ?? (typeof body.model === "string" ? body.model : null);
    if (!model) throw new ProviderError("No AI model is set up on this computer");
    const think = tier === "deep" || (tier === null && body.think === true);
    const request: Record<string, unknown> = {
      model,
      messages: withNoThink((body.messages as Message[] | undefined) ?? [], model, think),
      temperature: typeof body.temperature === "number" ? body.temperature : 0.4,
      stream: false,
    };
    if (body.json_mode === true) request.response_format = { type: "json_object" };

    const { baseUrl, apiKey, settings } = this.endpoint();
    if (nativeReasoningOff(settings.provider, model, think)) request.reasoning_effort = "none";
    let tools = Array.isArray(body.tools) && body.tools.length > 0 ? [...body.tools] : null;
    for (;;) {
      if (tools) {
        request.tools = tools;
        request.tool_choice = "auto";
      } else {
        delete request.tools;
        delete request.tool_choice;
      }
      try {
        const payload = (await call(`${baseUrl}/chat/completions`, request, apiKey, CHAT_TIMEOUT_MS)) as {
          choices?: { message?: Message }[];
          usage?: Record<string, unknown>;
        };
        const message = payload.choices?.[0]?.message;
        if (!message) throw new ProviderError("AI provider answered without choices");
        return { model, message: stripThinking(message), usage: payload.usage ?? {} };
      } catch (error) {
        // Un serveur MCP riche peut dépasser la taille de requête du fournisseur (413) ou exposer un schéma d'outil
        // qu'il refuse (400) : on réessaie avec moitié moins d'outils (le backend les trie par pertinence). Jamais
        // jusqu'à zéro : sans outils, le modèle annonçait des actions qu'il n'avait pas faites (recette du 29/10/2026).
        if (error instanceof HttpError && (error.status === 400 || error.status === 413) && tools) {
          const keep = Math.floor(tools.length / 2);
          if (keep === 0) {
            log.error(`AI provider answered ${error.status} even with a single tool: the tools are refused`);
            throw new ProviderError(`AI provider refused the tools (HTTP ${error.status})`, 422);
          }
          log.warn(`AI provider answered ${error.status} with ${tools.length} tool(s), retrying with ${keep}`);
          tools = tools.slice(0, keep);
          continue;
        }
        if (error instanceof HttpError) throw new ProviderError(`AI provider refused the request (HTTP ${error.status})`);
        throw error instanceof ProviderError ? error : new ProviderError(`AI provider unreachable: ${(error as Error).message}`);
      }
    }
  }

  /** `POST /v1/embeddings` : vecteurs des textes, dans l'ordre, de la dimension de la base. */
  private async embed(body: Record<string, unknown>): Promise<unknown> {
    const state = await this.state();
    const model = state.embeddings.model;
    if (!state.configured || !model) throw new ProviderError("No embedding model is set up on this computer");
    const texts = Array.isArray(body.texts) ? body.texts.map(String) : [];
    if (texts.length === 0) return { model, dimensions: EMBEDDING_DIM, vectors: [] };
    const { baseUrl, apiKey } = this.endpoint();
    let payload: { data?: { index?: number; embedding?: number[] }[] };
    try {
      payload = (await call(`${baseUrl}/embeddings`, { model, input: texts }, apiKey, CHAT_TIMEOUT_MS)) as typeof payload;
    } catch (error) {
      if (error instanceof HttpError) throw new ProviderError(`Embeddings refused (HTTP ${error.status})`);
      throw new ProviderError(`Embeddings unreachable: ${(error as Error).message}`);
    }
    const rows = payload.data;
    if (!Array.isArray(rows) || rows.length !== texts.length) throw new ProviderError("Invalid embeddings response");
    const vectors = [...rows].sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map((row) => (row.embedding ?? []).map(Number));
    const wrong = vectors.find((vector) => vector.length !== EMBEDDING_DIM);
    if (wrong) {
      throw new ProviderError(`Embedding model ${model} returns ${wrong.length} dimensions, the database expects ${EMBEDDING_DIM}`);
    }
    return { model, dimensions: EMBEDDING_DIM, vectors };
  }
}

class HttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

/** Appel au fournisseur (GET sans corps, POST avec). */
async function call(url: string, body: unknown, apiKey: string | undefined, timeoutMs: number): Promise<unknown> {
  const headers: Record<string, string> = { "Content-Type": "application/json", "User-Agent": USER_AGENT };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const response = await fetch(url, {
    method: body === null ? "GET" : "POST",
    headers,
    body: body === null ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new HttpError(response.status);
  return response.json();
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}
