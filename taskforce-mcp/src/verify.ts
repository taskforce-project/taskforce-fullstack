/**
 * Vérification end-to-end : lance le serveur MCP compilé (`dist/index.js`) via stdio,
 * liste ses tools, puis appelle deux tools réels (KPIs + projets) contre le backend TaskForce.
 * Nécessite le backend up + l'auth configurée par variables d'env (cf. README).
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function main(): Promise<void> {
  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/index.js"],
    env: process.env as Record<string, string>,
  });
  const client = new Client({ name: "taskforce-mcp-verify", version: "0.1.0" });
  await client.connect(transport);

  const { tools } = await client.listTools();
  console.log("TOOLS:", tools.map((t) => t.name).join(", "));

  const kpis = await client.callTool({ name: "taskforce_workspace_kpis", arguments: {} });
  console.log("KPIS:", JSON.stringify(kpis).slice(0, 500));

  const projects = await client.callTool({ name: "taskforce_list_projects", arguments: {} });
  console.log("PROJECTS:", JSON.stringify(projects).slice(0, 400));

  await client.close();
  console.log("VERIFY OK");
}

main().catch((e) => {
  console.error("VERIFY FAIL:", e);
  process.exit(1);
});
