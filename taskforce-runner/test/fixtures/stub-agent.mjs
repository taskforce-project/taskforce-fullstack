#!/usr/bin/env node
/**
 * Agent de SUBSTITUTION pour éprouver le runner de bout en bout sans consommer Claude.
 *
 * Se lance à la place de `claude` (mêmes arguments, prompt sur stdin, sortie `stream-json` sur stdout) et fait ce
 * qu'un agent ferait, en vrai : il fait juger des actions par le hook `PreToolUse` du fichier `--settings` (les règles
 * de la mission), parle au serveur MCP de l'instance décrit par `--mcp-config` (HTTP, session déléguée), lit l'issue,
 * la commente, SONDE les limites de la session (ce qui doit être refusé l'est-il ?), demande une validation par le
 * hook `PermissionRequest` pour une action que les règles demandent (comme Claude Code le ferait pour
 * `npm install`), puis laisse un commit dans le worktree.
 *
 * Usage : dans runner.config.json, `"agent": { "command": ".../test/fixtures/stub-agent" }`
 * (`stub-agent.cmd` sous Windows). Jamais en production.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

if (process.argv.includes("--version")) {
  console.log("2.1.295 (stub-agent: taskforce-runner test fixture, no LLM)");
  process.exit(0);
}

const emit = (line) => process.stdout.write(JSON.stringify(line) + "\n");
const argValue = (flag) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

function finish(ok, result) {
  emit({ type: "result", subtype: ok ? "success" : "error_during_execution", is_error: !ok, result, num_turns: 1,
    total_cost_usd: 0, session_id: "stub" });
  emit({ type: "system", subtype: "task_summary" });
  process.exit(ok ? 0 : 1);
}

let prompt = "";
for await (const chunk of process.stdin) prompt += chunk;
const ids = /projectId (\d+), issueId (\d+)/.exec(prompt);
if (!ids) finish(false, "stub-agent: projectId/issueId not found in the prompt");
const projectId = Number(ids[1]);
const issueId = Number(ids[2]);

emit({ type: "system", subtype: "init", model: "stub", claude_code_version: "stub-agent" });

// ---------------------------------------------------------------- serveur MCP de l'instance (HTTP)
const server = JSON.parse(readFileSync(argValue("--mcp-config"), "utf8")).mcpServers.taskforce;
let rpcId = 0;
async function rpc(method, params) {
  const res = await fetch(server.url, {
    method: "POST",
    headers: { ...server.headers, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  if (!res.ok) throw new Error(`MCP ${method}: HTTP ${res.status}`);
  return (await res.json()).result;
}
await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "stub-agent", version: "0.2.0" } });

async function call(name, args) {
  const id = `toolu_stub_${rpcId + 1}`;
  emit({ type: "assistant", message: { content: [{ type: "tool_use", id, name: `mcp__taskforce__${name}`, input: args }] } });
  const result = await rpc("tools/call", { name, arguments: args });
  const text = result?.content?.[0]?.text ?? "";
  emit({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, is_error: result?.isError === true, content: text }] } });
  return { refused: result?.isError === true, text };
}

// ---------------------------------------------------------------- hooks du fichier --settings, comme Claude Code
async function callHook(event, body) {
  const hook = JSON.parse(readFileSync(argValue("--settings"), "utf8")).hooks[event][0].hooks[0];
  const headers = Object.fromEntries(Object.entries(hook.headers ?? {}).map(([key, value]) => [
    key, String(value).replace(/\$([A-Z_][A-Z0-9_]*)/g, (_, name) => (hook.allowedEnvVars ?? []).includes(name) ? process.env[name] ?? "" : ""),
  ]));
  const res = await fetch(hook.url, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ hook_event_name: event, ...body }),
    signal: AbortSignal.timeout(hook.timeout * 1000),
  });
  return res.json();
}

/** La décision des règles sur une action : allow, deny, ou ask (pas de décision : place au hook PermissionRequest). */
async function judge(toolName, toolInput) {
  const output = (await callHook("PreToolUse", { tool_name: toolName, tool_input: toolInput })).hookSpecificOutput;
  return output?.permissionDecision ?? "ask";
}

// ---------------------------------------------------------------- validation par le hook PermissionRequest
async function askApproval(command) {
  emit({ type: "assistant", message: { content: [{ type: "tool_use", id: "toolu_stub_bash", name: "Bash", input: { command } }] } });
  const output = (await callHook("PermissionRequest", { tool_name: "Bash", tool_input: { command } })).hookSpecificOutput;
  const decision = output?.decision ?? { behavior: "deny", message: "no decision" };
  if (decision.behavior === "allow") {
    emit({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "toolu_stub_bash", is_error: false, content: "(simulated) tests passed" }] } });
    return true;
  }
  emit({ type: "system", subtype: "permission_denied", tool_name: "Bash", message: decision.message ?? "Denied" });
  return false;
}

const lines = [];
const expect = (label, outcome, shouldBeRefused) => {
  const pass = outcome.refused === shouldBeRefused;
  lines.push(`- ${pass ? "PASS" : "FAIL"} ${label}: ${outcome.refused ? "refused" : "allowed"}${outcome.refused ? ` (${outcome.text.slice(0, 140)})` : ""}`);
  return pass;
};

let allPass = true;
// Les règles de la mission, jugées par le runner avant chaque action (table par défaut).
for (const [label, tool, input, expected] of [
  ["read a file of the copy", "Read", { file_path: join(process.cwd(), "README.md") }, "allow"],
  ["push from the agent", "Bash", { command: "git push origin HEAD" }, "deny"],
  // R32 : les scripts du dépôt ne sont pas pour l'agent ; le runner lance les tests du projet après lui (S1).
  ["run the repository's tests", "Bash", { command: "npm test" }, "deny"],
  ["install a package", "Bash", { command: "npm install left-pad" }, "ask"],
]) {
  const verdict = await judge(tool, input);
  lines.push(`- ${verdict === expected ? "PASS" : "FAIL"} rules: ${label}: ${verdict}`);
  allPass &= verdict === expected;
}
allPass &= expect("read the delegated issue", await call("get_issue", { projectId, issueId }), false);
allPass &= expect("list workspace projects (read)", await call("list_projects", {}), false);
allPass &= expect("search the Brain OS (read via POST)", await call("brain_search", { query: "architecture" }), false);
allPass &= expect("comment the delegated issue (write, in scope)",
  await call("add_comment", { projectId, issueId, content: "Runner self-test: the delegated session reached this issue through the MCP server of the instance." }), false);
// Hors périmètre : un AUTRE projet du même workspace, puis Cortex (niveau workspace).
allPass &= expect("create an issue in ANOTHER project (write, out of scope)",
  await call("create_issue", { projectId: projectId + 1, title: "must be refused" }), true);
allPass &= expect("ask Cortex (workspace level, out of scope)", await call("ask_cortex", { message: "hello from the stub agent" }), true);

const approved = await askApproval("npm install left-pad");
lines.push(`- INFO approval of "npm install left-pad" in TaskForce: ${approved ? "allowed" : "denied"}`);

let committed = false;
try {
  execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: process.cwd(), stdio: "ignore" });
  writeFileSync(join(process.cwd(), "RUNNER_SELFTEST.md"),
    `# Runner self-test\n\nProduced by the stub agent for issue ${issueId} (project ${projectId}).\n\n${lines.join("\n")}\n`);
  execFileSync("git", ["add", "RUNNER_SELFTEST.md"], { cwd: process.cwd() });
  execFileSync("git", ["commit", "-m", "test: runner self-test"], { cwd: process.cwd() });
  committed = true;
} catch {
  // tâche sans dépôt : rien à commiter, le commentaire tient lieu de livrable
}

finish(Boolean(allPass), `Stub agent run (no LLM involved). Delegated-session checks:\n${lines.join("\n")}\n\n`
  + (committed ? "One commit added (RUNNER_SELFTEST.md)." : "No repository: the comment is the deliverable."));
