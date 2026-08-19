#!/usr/bin/env node
/**
 * Serveur MCP **TaskForce** — transport **stdio** (local : Claude Desktop / Claude Code).
 *
 * Expose le workspace (agent Cortex + Brain OS + projets + issues + santé) à tout client MCP.
 * Les tools sont définis dans `tools.ts` (partagés avec le transport HTTP `http.ts`).
 *
 * Idée directrice : TaskForce = **étape de réflexion/process** pour l'agent — une source d'info
 * (Brain OS) et de process (workflows/règles) à consulter AVANT d'agir.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { TaskforceClient } from "./taskforce-client.js";
import { registerTaskforceTools, TOOL_COUNT } from "./tools.js";

async function main(): Promise<void> {
  const tf = new TaskforceClient();
  const server = new McpServer({ name: "taskforce-mcp", version: "0.2.0" });
  registerTaskforceTools(server, tf);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr : ne pas polluer stdout (réservé au protocole MCP).
  console.error(
    `taskforce-mcp opérationnel (stdio) — ${TOOL_COUNT} tools (lecture + écriture) : ask_cortex, ` +
    "brain_search, workspace_kpis, list_projects, list_issues, list_issue_statuses, list_my_issues, " +
    "create_issue, update_issue, smart_assign",
  );
}

main().catch((err) => {
  console.error("taskforce-mcp erreur fatale :", err);
  process.exit(1);
});
