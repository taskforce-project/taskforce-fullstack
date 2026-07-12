#!/usr/bin/env node
/**
 * Serveur MCP **TaskForce** — expose le workspace (agent Cortex + Brain OS + projets + issues + santé)
 * à Claude et à tout client MCP, via stdio.
 *
 * Idée directrice : TaskForce = **étape de réflexion/process** pour l'agent — une source d'info
 * (Brain OS) et de process (workflows/règles) à consulter AVANT d'agir.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { TaskforceClient } from "./taskforce-client.js";

const tf = new TaskforceClient();
const server = new McpServer({ name: "taskforce-mcp", version: "0.1.0" });

// ── Helpers de sortie MCP ─────────────────────────────────────────────────────
type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

function ok(data: unknown): ToolResult {
  const structured = (data && typeof data === "object" && !Array.isArray(data))
    ? (data as Record<string, unknown>)
    : { result: data };
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: structured };
}

function fail(error: unknown): ToolResult {
  const msg = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text", text: `Erreur TaskForce : ${msg}` }], isError: true };
}

const workspaceArg = z.string().optional().describe("Slug du workspace (défaut : env TASKFORCE_WORKSPACE)");

// ── Tool phare : interroger Cortex (Brain OS RAG + agent) ─────────────────────
server.registerTool(
  "taskforce_ask_cortex",
  {
    title: "Ask Cortex (TaskForce Brain OS)",
    description:
      "Interroge l'agent IA « Cortex » de TaskForce, fondé sur le Brain OS du workspace (graphe de " +
      "connaissance : décisions, architecture, problèmes connus…). Renvoie une réponse fondée + les " +
      "SOURCES citées + l'usage tokens. À utiliser comme source d'info et de process AVANT d'agir " +
      "(en mode approfondi, Cortex peut aussi consigner une note dans le Brain OS).",
    inputSchema: {
      message: z.string().min(2).describe("La question / demande adressée à Cortex"),
      workspace: workspaceArg,
    },
    annotations: { readOnlyHint: false, openWorldHint: true },
  },
  async ({ message, workspace }) => {
    try {
      const a = await tf.request<{
        answer: string; mode: string;
        sources: Array<{ title: string; domain: string }>;
        usage: { promptTokens: number; completionTokens: number; totalTokens: number };
      }>("POST", `/workspaces/${tf.workspace(workspace)}/assistant`, { message });
      return ok({ answer: a.answer, mode: a.mode, sources: a.sources, usage: a.usage });
    } catch (e) {
      return fail(e);
    }
  },
);

// ── Contexte : santé du workspace (KPIs réels) ────────────────────────────────
server.registerTool(
  "taskforce_workspace_kpis",
  {
    title: "Workspace KPIs",
    description: "Indicateurs réels du workspace (tâches résolues, vélocité, en cours, à risque…). Vue d'ensemble de la santé avant de décider.",
    inputSchema: { workspace: workspaceArg },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ workspace }) => {
    try {
      const kpis = await tf.request("GET", `/workspaces/${tf.workspace(workspace)}/analytics/kpis`);
      return ok(kpis);
    } catch (e) {
      return fail(e);
    }
  },
);

// ── Projets du workspace ──────────────────────────────────────────────────────
server.registerTool(
  "taskforce_list_projects",
  {
    title: "List projects",
    description: "Liste les projets du workspace (id, nom, clé, statut, avancement).",
    inputSchema: { workspace: workspaceArg },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ workspace }) => {
    try {
      const projects = await tf.request<Array<Record<string, unknown>>>(
        "GET", `/workspaces/${tf.workspace(workspace)}/projects`,
      );
      return ok({ count: projects.length, projects });
    } catch (e) {
      return fail(e);
    }
  },
);

// ── Mes issues (assignées à l'utilisateur du token) ───────────────────────────
server.registerTool(
  "taskforce_list_my_issues",
  {
    title: "List my issues",
    description: "Issues assignées à l'utilisateur (du token), tous projets confondus (identifier, titre, statut, priorité, échéance).",
    inputSchema: { workspace: workspaceArg },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ workspace }) => {
    try {
      const issues = await tf.request<Array<Record<string, unknown>>>(
        "GET", `/workspaces/${tf.workspace(workspace)}/my-issues`,
      );
      return ok({ count: issues.length, issues });
    } catch (e) {
      return fail(e);
    }
  },
);

// ── Démarrage (stdio) ─────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr : ne pas polluer stdout (réservé au protocole MCP).
  console.error("taskforce-mcp opérationnel (stdio) — tools: ask_cortex, workspace_kpis, list_projects, list_my_issues");
}

main().catch((err) => {
  console.error("taskforce-mcp erreur fatale :", err);
  process.exit(1);
});
