import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { Claim } from "./api.js";
import type { RunnerConfig } from "./config.js";
import { run } from "./proc.js";
import { buildPrompt } from "./prompt.js";

export interface AgentOutcome {
  ok: boolean;
  /** Résumé final de l'agent (quand ok) ou message d'échec. */
  text: string;
  costUsd: number | null;
  turns: number | null;
}

/** Nom du serveur MCP vu par Claude Code : ses outils s'appellent `mcp__taskforce__<outil>`. */
const MCP_SERVER = "taskforce";

/**
 * Outils pré-autorisés. En mode `dontAsk`, tout le reste est refusé d'office, sans question : pas de
 * shell libre, pas de réseau, pas de push. Les outils MCP listés sont ceux qui restent dans le périmètre
 * d'une session déléguée (le backend refuserait les autres de toute façon).
 */
export function allowedTools(extra: string[]): string[] {
  return [
    "Read", "Glob", "Grep", "Edit", "Write",
    "Bash(git status *)", "Bash(git status)", "Bash(git diff *)", "Bash(git diff)", "Bash(git log *)",
    "Bash(git add *)", "Bash(git commit *)", "Bash(git mv *)", "Bash(git rm *)",
    ...["get_issue", "add_comment", "brain_search", "list_projects", "list_issues", "list_issue_statuses",
      "list_my_issues", "workspace_kpis", "create_issue", "update_issue"]
      .map((tool) => `mcp__${MCP_SERVER}__taskforce_${tool}`),
    ...extra,
  ];
}

/** Arguments de `claude -p`. Exporté pour les tests : c'est la frontière de sécurité de l'exécution locale. */
export function agentArgs(config: RunnerConfig, claim: Claim, mcpConfigPath: string, settingsPath: string): string[] {
  const args = [
    "-p",
    "--output-format", "json",
    "--permission-mode", "dontAsk",
    "--allowedTools", allowedTools(config.agent.extraAllowedTools).join(","),
    "--mcp-config", mcpConfigPath,
    "--strict-mcp-config",
    "--settings", settingsPath,
    "--max-turns", String(config.agent.maxTurns),
  ];
  const model = config.agent.model ?? claim.model;
  if (model) args.push("--model", model);
  return args;
}

/**
 * Environnement de l'agent. Par défaut (`auth: "subscription"`) la clé API ambiante est RETIRÉE : sinon
 * Claude Code la préfère au login de l'abonnement, et la facture part sur le compte API sans prévenir.
 */
export function agentEnv(config: RunnerConfig, base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base };
  if (config.agent.auth === "subscription") {
    delete env.ANTHROPIC_API_KEY;
    delete env.ANTHROPIC_AUTH_TOKEN;
  } else if (!env.ANTHROPIC_API_KEY) {
    throw new Error('agent.auth = "api-key" mais ANTHROPIC_API_KEY est absent de l\'environnement');
  }
  // Les identifiants machine du runner ne descendent jamais dans le processus de l'agent.
  delete env.TASKFORCE_RUNNER_CLIENT_ID;
  delete env.TASKFORCE_RUNNER_CLIENT_SECRET;
  return env;
}

/**
 * Lance Claude Code sans interface dans le worktree, MCP TaskForce branché sur la session déléguée du run.
 *
 * Le MCP reçoit un jeton machine de COURTE durée (jamais le secret du runner), utilisable seulement
 * dans le périmètre de ce run. Le fichier qui le porte vit hors du worktree (l'agent ne lit pas hors de son
 * dossier en mode `dontAsk`) et est supprimé à la fin.
 */
export async function runAgent(
  config: RunnerConfig, claim: Claim, worktreePath: string, branch: string, sessionToken: string,
): Promise<AgentOutcome> {
  const tmp = join(config.home, "tmp");
  mkdirSync(tmp, { recursive: true });
  const mcpConfigPath = join(tmp, `run-${claim.runId}-mcp.json`);
  const settingsPath = join(tmp, `run-${claim.runId}-settings.json`);

  writeFileSync(mcpConfigPath, JSON.stringify({
    mcpServers: {
      [MCP_SERVER]: {
        command: process.execPath,
        args: [config.mcpEntry],
        env: {
          TASKFORCE_API_URL: config.apiUrl,
          TASKFORCE_WORKSPACE: claim.workspaceSlug,
          TASKFORCE_TOKEN: sessionToken,
          TASKFORCE_DELIVERY_RUN: String(claim.runId),
        },
      },
    },
  }), { encoding: "utf8", mode: 0o600 });

  // Sans attribution : ni « Co-Authored-By » dans les commits, ni mention dans une PR (les deux clés,
  // l'ancienne et la nouvelle, pour couvrir les versions de Claude Code).
  writeFileSync(settingsPath, JSON.stringify(
    config.agent.attribution ? {} : { includeCoAuthoredBy: false, attribution: { commit: "", pr: "" } },
  ), "utf8");

  try {
    const result = await run(config.agent.command, agentArgs(config, claim, mcpConfigPath, settingsPath), {
      cwd: worktreePath,
      env: agentEnv(config),
      input: buildPrompt(claim, branch),
      timeoutMs: config.agent.timeoutMinutes * 60_000,
    });
    if (result.timedOut) {
      return { ok: false, text: `The agent was stopped after ${config.agent.timeoutMinutes} min (timeout).`, costUsd: null, turns: null };
    }
    return parseAgentOutput(result.code, result.stdout, result.stderr);
  } finally {
    rmSync(mcpConfigPath, { force: true });
    rmSync(settingsPath, { force: true });
  }
}

/** Interprète la sortie `--output-format json` de Claude Code. Exporté pour les tests. */
export function parseAgentOutput(code: number | null, stdout: string, stderr: string): AgentOutcome {
  let json: Record<string, unknown> | null = null;
  const trimmed = stdout.trim();
  if (trimmed) {
    try {
      // La sortie utile est le dernier objet JSON (des avertissements peuvent le précéder).
      const start = trimmed.lastIndexOf("\n{") >= 0 ? trimmed.lastIndexOf("\n{") + 1 : trimmed.indexOf("{");
      json = JSON.parse(trimmed.slice(start)) as Record<string, unknown>;
    } catch {
      json = null;
    }
  }
  const costUsd = typeof json?.total_cost_usd === "number" ? json.total_cost_usd : null;
  const turns = typeof json?.num_turns === "number" ? json.num_turns : null;
  const resultText = typeof json?.result === "string" ? json.result.trim() : "";
  const failed = code !== 0 || json?.is_error === true
    || (typeof json?.subtype === "string" && json.subtype !== "success");

  if (failed) {
    const reason = resultText
      || (typeof json?.subtype === "string" ? `Claude Code stopped: ${json.subtype}` : "")
      || stderr.trim().split(/\r?\n/).slice(-3).join(" | ")
      || `Claude Code exited with code ${code}`;
    return { ok: false, text: reason.slice(0, 3900), costUsd, turns };
  }
  if (!resultText) {
    return { ok: false, text: "Claude Code finished without a summary.", costUsd, turns };
  }
  return { ok: true, text: resultText, costUsd, turns };
}
