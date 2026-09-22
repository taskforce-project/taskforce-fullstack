#!/usr/bin/env node
/**
 * Agent de SUBSTITUTION pour éprouver le runner de bout en bout sans consommer Claude.
 *
 * Se lance à la place de `claude` (mêmes arguments, prompt sur stdin, résultat JSON sur stdout) et fait
 * ce qu'un agent ferait, en vrai : il démarre le serveur MCP TaskForce décrit par `--mcp-config`, lit
 * l'issue, la commente, SONDE les limites de la session déléguée (ce qui doit être refusé l'est-il ?),
 * puis laisse un commit dans le worktree.
 *
 * Usage : dans runner.config.json, `"agent": { "command": ".../test/fixtures/stub-agent" }`
 * (`stub-agent.cmd` sous Windows). Jamais en production.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const mcpPackage = resolve(here, "..", "..", "..", "taskforce-mcp", "package.json");
const requireFromMcp = createRequire(mcpPackage);
const { Client } = requireFromMcp("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = requireFromMcp("@modelcontextprotocol/sdk/client/stdio.js");

if (process.argv.includes("--version")) {
  console.log("stub-agent 0.1.0 (taskforce-runner test fixture, no LLM)");
  process.exit(0);
}

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function readStdin() {
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

function finish(ok, result) {
  process.stdout.write(JSON.stringify({
    type: "result", subtype: ok ? "success" : "error_during_execution", is_error: !ok,
    result, num_turns: 1, total_cost_usd: 0, session_id: "stub",
  }) + "\n");
  process.exit(ok ? 0 : 1);
}

const prompt = await readStdin();
const ids = /projectId (\d+), issueId (\d+)/.exec(prompt);
if (!ids) finish(false, "stub-agent: projectId/issueId introuvables dans le prompt");
const projectId = Number(ids[1]);
const issueId = Number(ids[2]);

const mcpConfig = JSON.parse(readFileSync(argValue("--mcp-config"), "utf8"));
const server = mcpConfig.mcpServers.taskforce;
const client = new Client({ name: "taskforce-runner-stub-agent", version: "0.1.0" });
await client.connect(new StdioClientTransport({
  command: server.command, args: server.args, env: { ...process.env, ...server.env },
}));

const call = async (name, args) => {
  const res = await client.callTool({ name, arguments: args });
  const text = res.content?.[0]?.text ?? "";
  return { refused: res.isError === true, text };
};

const lines = [];
const expect = (label, outcome, shouldBeRefused) => {
  const pass = outcome.refused === shouldBeRefused;
  lines.push(`- ${pass ? "PASS" : "FAIL"} ${label}: ${outcome.refused ? "refused" : "allowed"}${outcome.refused ? ` (${outcome.text.slice(0, 140)})` : ""}`);
  return pass;
};

let allPass = true;
try {
  const issue = await call("taskforce_get_issue", { projectId, issueId });
  allPass &= expect("read the delegated issue", issue, false);
  allPass &= expect("list workspace projects (read)", await call("taskforce_list_projects", {}), false);
  allPass &= expect("search the Brain OS (read via POST)", await call("taskforce_brain_search", { query: "architecture" }), false);
  allPass &= expect("comment the delegated issue (write, in scope)",
    await call("taskforce_add_comment", { projectId, issueId, content: "Runner self-test: delegated session reached this issue through the TaskForce MCP." }), false);
  // Hors périmètre : un AUTRE projet du même workspace, puis une écriture de niveau workspace.
  allPass &= expect("create an issue in ANOTHER project (write, out of scope)",
    await call("taskforce_create_issue", { projectId: projectId + 1, title: "must be refused" }), true);
  allPass &= expect("ask Cortex (workspace-level write, out of scope)",
    await call("taskforce_ask_cortex", { message: "hello from the stub agent" }), true);
} finally {
  await client.close();
}

writeFileSync(join(process.cwd(), "RUNNER_SELFTEST.md"),
  `# Runner self-test\n\nProduced by the stub agent for issue ${issueId} (project ${projectId}).\n\n${lines.join("\n")}\n`);
execFileSync("git", ["add", "RUNNER_SELFTEST.md"], { cwd: process.cwd() });
execFileSync("git", ["commit", "-m", "test: runner self-test"], { cwd: process.cwd() });

finish(Boolean(allPass), `Stub agent run (no LLM involved). Delegated-session checks:\n${lines.join("\n")}\n\nOne commit added (RUNNER_SELFTEST.md).`);
