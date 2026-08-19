#!/usr/bin/env node
/**
 * Serveur MCP **TaskForce** — transport **Streamable HTTP** (remote / SaaS).
 *
 * Complète le transport stdio (`index.ts`) pour un déploiement distant : Claude (ou tout client MCP
 * distant) parle HTTP à ce serveur, qui relaie vers l'API TaskForce.
 *
 * ── Auth ──────────────────────────────────────────────────────────────────────
 * Deux modes, décidés à l'initialisation de session :
 *  • **Pass-through** (mode prod recommandé) : le client présente `Authorization: Bearer <token>`.
 *    Ce token est utilisé tel quel pour appeler TaskForce → chaque session agit avec l'identité du
 *    caller (compte de service en prod). C'est TaskForce qui valide le token.
 *  • **Compte de service local** : si le client ne présente pas de token mais que le serveur a une
 *    auth d'env (`TASKFORCE_TOKEN`, ou Keycloak password grant), on l'utilise. Non protégé au niveau
 *    MCP → à **binder sur localhost** / derrière un reverse proxy uniquement.
 *
 * Sessions : mode **stateful** (le serveur émet un `mcp-session-id`, à renvoyer par le client).
 * Un `McpServer` + un `TaskforceClient` sont instanciés **par session** (isolation du token).
 */
import { randomUUID } from "node:crypto";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import express, { type Request, type Response } from "express";

import { TaskforceClient } from "./taskforce-client.js";
import { registerTaskforceTools, TOOL_COUNT } from "./tools.js";

const PORT = Number(process.env.MCP_HTTP_PORT ?? 3000);
const HOST = process.env.MCP_HTTP_HOST ?? "127.0.0.1";
// Origines navigateur autorisées (anti DNS-rebinding). Les clients non-navigateur (Claude Desktop)
// n'envoient pas d'en-tête Origin → autorisés. Surcharge : MCP_HTTP_ALLOWED_ORIGINS (séparées par ,).
const ALLOWED_ORIGINS = (process.env.MCP_HTTP_ALLOWED_ORIGINS ?? "")
  .split(",").map((s) => s.trim()).filter(Boolean);

/** Vrai si le serveur peut s'authentifier seul (compte de service via env), sans token client. */
const HAS_ENV_AUTH = Boolean(
  process.env.TASKFORCE_TOKEN ||
  (process.env.KEYCLOAK_CLIENT_SECRET && process.env.TASKFORCE_PASSWORD),
);

/** Extrait le bearer d'un en-tête `Authorization: Bearer <token>` (sinon undefined). */
function bearerFrom(req: Request): string | undefined {
  const h = req.headers.authorization;
  if (!h) return undefined;
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : undefined;
}

/** Réponse JSON-RPC d'erreur (sans session valide). */
function rpcError(res: Response, status: number, code: number, message: string): void {
  res.status(status).json({ jsonrpc: "2.0", error: { code, message }, id: null });
}

const app = express();
app.use(express.json({ limit: "1mb" }));

// ── Garde anti DNS-rebinding : refuse une Origin navigateur non autorisée ──────
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.length > 0 && !ALLOWED_ORIGINS.includes(origin)) {
    rpcError(res, 403, -32000, `Origin non autorisée : ${origin}`);
    return;
  }
  next();
});

// ── Santé (probe reverse proxy / k8s) ─────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", transport: "streamable-http", tools: TOOL_COUNT });
});

// Transports actifs, indexés par session.
const transports = new Map<string, StreamableHTTPServerTransport>();

// ── POST /mcp : messages client → serveur (initialize + appels de tools) ───────
app.post("/mcp", async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  // Session existante → on réutilise son transport.
  if (sessionId && transports.has(sessionId)) {
    await transports.get(sessionId)!.handleRequest(req, res, req.body);
    return;
  }

  // Pas de session : seule une requête `initialize` est acceptable pour en ouvrir une.
  if (sessionId || !isInitializeRequest(req.body)) {
    rpcError(res, 400, -32000, "Requête invalide : session inconnue ou absente (initialize attendu).");
    return;
  }

  // Auth : token du client (pass-through) sinon compte de service d'env.
  const bearer = bearerFrom(req);
  if (!bearer && !HAS_ENV_AUTH) {
    rpcError(res, 401, -32001, "Authentification requise : fournir un en-tête Authorization: Bearer <token TaskForce>.");
    return;
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sid) => { transports.set(sid, transport); },
    onsessionclosed: (sid) => { transports.delete(sid); },
  });
  transport.onclose = () => {
    if (transport.sessionId) transports.delete(transport.sessionId);
  };

  const tf = new TaskforceClient(bearer ? { token: bearer } : {});
  const server = new McpServer({ name: "taskforce-mcp", version: "0.2.0" });
  registerTaskforceTools(server, tf);

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

// ── GET /mcp : flux SSE serveur → client (notifications) ───────────────────────
// ── DELETE /mcp : fin de session ───────────────────────────────────────────────
async function replayToSession(req: Request, res: Response): Promise<void> {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports.has(sessionId)) {
    rpcError(res, 400, -32000, "Session inconnue ou absente (en-tête mcp-session-id requis).");
    return;
  }
  await transports.get(sessionId)!.handleRequest(req, res);
}
app.get("/mcp", replayToSession);
app.delete("/mcp", replayToSession);

const httpServer = app.listen(PORT, HOST, () => {
  console.error(
    `taskforce-mcp opérationnel (Streamable HTTP) sur http://${HOST}:${PORT}/mcp — ${TOOL_COUNT} tools. ` +
    (HAS_ENV_AUTH
      ? "Auth : compte de service (env) + pass-through si Authorization présent."
      : "Auth : pass-through obligatoire (Authorization: Bearer <token TaskForce>)."),
  );
});

// ── Arrêt propre : ferme les sessions ouvertes ─────────────────────────────────
async function shutdown(): Promise<void> {
  console.error("taskforce-mcp : arrêt, fermeture des sessions…");
  for (const transport of transports.values()) {
    try { await transport.close(); } catch { /* ignore */ }
  }
  httpServer.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
