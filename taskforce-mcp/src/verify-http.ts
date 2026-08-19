/**
 * Vérification end-to-end du transport **Streamable HTTP** : se connecte au serveur `http.ts`
 * déjà démarré (MCP_HTTP_URL, défaut http://127.0.0.1:3111/mcp), liste les tools, appelle KPIs +
 * projets contre le backend TaskForce. Nécessite le serveur HTTP up + backend up.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

async function main(): Promise<void> {
  const url = new URL(process.env.MCP_HTTP_URL ?? "http://127.0.0.1:3111/mcp");
  const token = process.env.MCP_VERIFY_BEARER; // pass-through optionnel
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
  });
  const client = new Client({ name: "taskforce-mcp-verify-http", version: "0.2.0" });
  await client.connect(transport);
  console.log("SESSION:", transport.sessionId ?? "(stateless)");

  const { tools } = await client.listTools();
  console.log(`TOOLS(${tools.length}):`, tools.map((t) => t.name).join(", "));

  const kpis = await client.callTool({ name: "taskforce_workspace_kpis", arguments: {} });
  console.log("KPIS:", JSON.stringify(kpis).slice(0, 400));

  const projects = await client.callTool({ name: "taskforce_list_projects", arguments: {} });
  console.log("PROJECTS:", JSON.stringify(projects).slice(0, 300));

  await client.close(); // déclenche DELETE /mcp → fermeture de session côté serveur
  console.log("OK: session fermée proprement");
}

main().catch((err) => {
  console.error("VERIFY-HTTP ERREUR:", err instanceof Error ? err.message : err);
  process.exit(1);
});
