/**
 * Enregistrement des tools MCP **TaskForce** sur un `McpServer`.
 *
 * Extrait ici pour être **partagé** par les deux transports : `index.ts` (stdio, local) et
 * `http.ts` (Streamable HTTP, remote/SaaS). Un seul jeu de définitions → aucune dérive entre les deux.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { TaskforceClient } from "./taskforce-client.js";

/** Nombre de tools exposés (pour les logs de démarrage). */
export const TOOL_COUNT = 10;

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

/**
 * Enregistre les 10 tools TaskForce (7 lecture + 3 écriture) sur `server`, câblés sur `tf`.
 * `tf` peut être un client « compte de service » (env) ou un client propre à une session HTTP
 * (token pass-through) — les définitions de tools sont identiques dans les deux cas.
 */
export function registerTaskforceTools(server: McpServer, tf: TaskforceClient): void {
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

  // ── Brain OS : recherche sémantique dans le graphe de connaissance ────────────
  server.registerTool(
    "taskforce_brain_search",
    {
      title: "Search Brain OS",
      description:
        "Recherche sémantique dans le Brain OS du workspace (décisions, architecture, problèmes connus, " +
        "process…). Renvoie les notes les plus pertinentes + leur domaine. LA source de CONTEXTE à " +
        "consulter avant d'agir (ici ou dans un outil externe comme Linear).",
      inputSchema: {
        query: z.string().min(2).describe("Ce que l'on cherche dans le Brain OS"),
        topK: z.number().int().min(1).max(20).optional().describe("Nombre de résultats"),
        domain: z.string().optional().describe("Filtrer sur un domaine (ex. ARCHITECTURE, DECISIONS)"),
        workspace: workspaceArg,
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ query, topK, domain, workspace }) => {
      try {
        const hits = await tf.request<Array<Record<string, unknown>>>(
          "POST", `/workspaces/${tf.workspace(workspace)}/brain/search`,
          { query, topK, domain },
        );
        return ok({ count: hits.length, hits });
      } catch (e) {
        return fail(e);
      }
    },
  );

  // ── Issues d'un projet (lecture) ──────────────────────────────────────────────
  server.registerTool(
    "taskforce_list_issues",
    {
      title: "List project issues",
      description: "Liste les issues d'un projet (id, identifier, titre, statut, assigné, priorité). Utiliser projectId de taskforce_list_projects.",
      inputSchema: {
        projectId: z.number().int().describe("Id du projet (cf. taskforce_list_projects)"),
        workspace: workspaceArg,
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ projectId, workspace }) => {
      try {
        const issues = await tf.request<Array<Record<string, unknown>>>(
          "GET", `/workspaces/${tf.workspace(workspace)}/projects/${projectId}/issues`,
        );
        return ok({ count: issues.length, issues });
      } catch (e) {
        return fail(e);
      }
    },
  );

  // ── Statuts d'un projet (pour résoudre statusId) ──────────────────────────────
  server.registerTool(
    "taskforce_list_issue_statuses",
    {
      title: "List issue statuses",
      description: "Liste les statuts d'issue d'un projet (id, nom, catégorie). Sert à résoudre le statusId pour taskforce_update_issue.",
      inputSchema: {
        projectId: z.number().int().describe("Id du projet"),
        workspace: workspaceArg,
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ projectId, workspace }) => {
      try {
        const statuses = await tf.request<Array<Record<string, unknown>>>(
          "GET", `/workspaces/${tf.workspace(workspace)}/projects/${projectId}/issues/statuses`,
        );
        return ok({ count: statuses.length, statuses });
      } catch (e) {
        return fail(e);
      }
    },
  );

  // ── Créer une issue (ÉCRITURE) ────────────────────────────────────────────────
  server.registerTool(
    "taskforce_create_issue",
    {
      title: "Create issue",
      description:
        "Crée une issue dans un projet TaskForce. Écriture : à faire une fois le contexte réuni (Brain OS, KPIs). " +
        "assigneeId/dueDate optionnels (ids issus des tools de lecture).",
      inputSchema: {
        projectId: z.number().int().describe("Id du projet cible"),
        title: z.string().min(2).describe("Titre de l'issue"),
        description: z.string().optional().describe("Description (markdown)"),
        priority: z.enum(["NONE", "LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
        assigneeId: z.number().int().optional().describe("Id de l'assigné (membre du workspace)"),
        dueDate: z.string().optional().describe("Échéance ISO (YYYY-MM-DD)"),
        workspace: workspaceArg,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ projectId, title, description, priority, assigneeId, dueDate, workspace }) => {
      try {
        const issue = await tf.request<Record<string, unknown>>(
          "POST", `/workspaces/${tf.workspace(workspace)}/projects/${projectId}/issues`,
          { title, description, priority, assigneeId, dueDate },
        );
        return ok(issue);
      } catch (e) {
        return fail(e);
      }
    },
  );

  // ── Mettre à jour une issue (ÉCRITURE) : statut / assigné / priorité / titre ──
  server.registerTool(
    "taskforce_update_issue",
    {
      title: "Update issue",
      description:
        "Met à jour une issue (statut, assigné, priorité, titre, description, échéance). Écriture. " +
        "Résoudre statusId via taskforce_list_issue_statuses ; assigneeId via taskforce_list_issues.",
      inputSchema: {
        projectId: z.number().int().describe("Id du projet"),
        issueId: z.number().int().describe("Id de l'issue"),
        statusId: z.number().int().optional().describe("Nouveau statut (cf. taskforce_list_issue_statuses)"),
        assigneeId: z.number().int().optional().describe("Nouvel assigné"),
        priority: z.enum(["NONE", "LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
        title: z.string().optional(),
        description: z.string().optional(),
        dueDate: z.string().optional().describe("Échéance ISO (YYYY-MM-DD)"),
        workspace: workspaceArg,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ projectId, issueId, statusId, assigneeId, priority, title, description, dueDate, workspace }) => {
      try {
        const issue = await tf.request<Record<string, unknown>>(
          "PATCH", `/workspaces/${tf.workspace(workspace)}/projects/${projectId}/issues/${issueId}`,
          { statusId, assigneeId, priority, title, description, dueDate },
        );
        return ok(issue);
      } catch (e) {
        return fail(e);
      }
    },
  );

  // ── Smart Assign (IA) : recommande le meilleur assigné (à appliquer via update) ─
  server.registerTool(
    "taskforce_smart_assign",
    {
      title: "Smart assign (IA)",
      description:
        "Recommande le meilleur assigné pour une issue (charge + compétences + historique). Renvoie l'assigné " +
        "suggéré + l'explication. N'assigne PAS : appliquer ensuite avec taskforce_update_issue(assigneeId).",
      inputSchema: {
        projectId: z.number().int().describe("Id du projet"),
        issueId: z.number().int().describe("Id de l'issue à assigner"),
        workspace: workspaceArg,
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ projectId, issueId, workspace }) => {
      try {
        const res = await tf.request<Record<string, unknown>>(
          "POST", `/workspaces/${tf.workspace(workspace)}/projects/${projectId}/issues/${issueId}/smart-assign`,
        );
        return ok(res);
      } catch (e) {
        return fail(e);
      }
    },
  );
}
