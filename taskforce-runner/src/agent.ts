import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { Claim } from "./api.js";
import { ApprovalServer, type ApprovalApi } from "./approvals.js";
import type { RunnerConfig } from "./config.js";
import { EventRelay, type EventSink } from "./events.js";
import type { RulesBundle } from "./harness/rules.js";
import { log } from "./log.js";
import { run } from "./proc.js";
import { buildPrompt, buildReplyPrompt } from "./prompt.js";
import { parseAgentOutput, toEvents, type AgentOutcome } from "./stream.js";

export type { AgentOutcome } from "./stream.js";
export { parseAgentOutput } from "./stream.js";

/** Nom du serveur MCP vu par Claude Code : ses outils s'appellent `mcp__taskforce__<outil>`. */
const MCP_SERVER = "taskforce";

/** En-tête qui désigne le run dont l'agent emprunte la session déléguée (cf. `DeliverySessionFilter`, ADR-013). */
const DELIVERY_RUN_HEADER = "X-TaskForce-Delivery-Run";

/** Variable d'environnement qui porte le jeton du serveur local de validations, lue par le hook. */
const HOOK_TOKEN_ENV = "TF_HOOK_TOKEN";

/**
 * Mode d'exécution de l'agent :
 * - `repo` : le projet a un dépôt, l'agent travaille dans un worktree git et livre par pull request ;
 * - `repoless` : le projet n'a pas de dépôt (tâche non-code), l'agent travaille dans un dossier temporaire
 *   jetable et rend son travail dans TaskForce (commentaire markdown). Rien à pousser.
 */
export type AgentMode = "repo" | "repoless";

/**
 * Jamais permis, même validé dans l'app : le runner pousse et ouvre la pull request lui-même, après l'agent. Une
 * règle de refus passe avant le hook de validation.
 */
export const DENIED_TOOLS = ["Bash(git push)", "Bash(git push *)", "Bash(gh)", "Bash(gh *)"];

/**
 * Nom de modèle sûr à poser sur une ligne de commande, ou null. Le modèle choisi à la délégation vient du
 * serveur : on n'accepte que la forme d'un identifiant (`claude-sonnet-5`, `opus`, `sonnet[1m]`).
 */
export function safeModel(model: string | null | undefined): string | null {
  return typeof model === "string" && /^[A-Za-z0-9][A-Za-z0-9._\[\]-]{0,79}$/.test(model) ? model : null;
}

/** Arguments de `claude -p`. Exporté pour les tests : c'est la frontière de sécurité de l'exécution locale. */
export function agentArgs(config: RunnerConfig, claim: Claim, mcpConfigPath: string, settingsPath: string): string[] {
  const args = [
    "-p",
    // Suivi en direct : une ligne JSON par message, relayée à la chronologie du run dans TaskForce.
    "--output-format", "stream-json",
    "--verbose",
    // Les règles de la mission jugent chaque action (hook PreToolUse du fichier --settings). Une action qu'elles
    // demandent attend une décision humaine (hook PermissionRequest) ; personne d'autre ne répond : sans décision, refus.
    "--permission-mode", "manual",
    "--permission-prompts", "none",
    "--disallowedTools", DENIED_TOOLS.join(","),
    "--mcp-config", mcpConfigPath,
    "--strict-mcp-config",
    // Seuls les réglages de la personne (et ceux du runner, via --settings) sont lus, jamais ceux du dépôt
    // cloné : en -p, Claude Code charge sinon `.claude/settings*.json` du dépôt sans demander, et un dépôt
    // piégé pourrait y déclarer des hooks qui s'exécutent sur le poste, ou rediriger l'URL de l'API.
    // Vérifié sur la CLI 2.1.293 : sans ce drapeau le hook du dépôt s'exécute, avec, seul celui du runner.
    "--setting-sources", "user",
    "--settings", settingsPath,
    "--max-turns", String(config.agent.maxTurns),
  ];
  // Rien n'est autorisé d'avance, sauf ce que la personne ajoute sur son poste : une autorisation d'avance passerait
  // outre une règle qui demande (une règle qui refuse la bloque toujours).
  const extra = config.agent.extraAllowedTools;
  if (extra.length > 0) args.push("--allowedTools", extra.join(","));
  const model = safeModel(config.agent.model) ?? safeModel(claim.model);
  if (model) args.push("--model", model);
  return args;
}

/**
 * Environnement de l'agent. Par défaut (`auth: "subscription"`) la clé API ambiante est RETIRÉE : sinon
 * Claude Code la préfère au login de l'abonnement, et la facture part sur le compte API sans prévenir.
 */
export function agentEnv(config: RunnerConfig, base: NodeJS.ProcessEnv = process.env, hookToken?: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base };
  if (config.agent.auth === "subscription") {
    delete env.ANTHROPIC_API_KEY;
    delete env.ANTHROPIC_AUTH_TOKEN;
  } else if (!env.ANTHROPIC_API_KEY) {
    throw new Error('agent.auth is "api-key" but ANTHROPIC_API_KEY is not set in the environment');
  }
  // Les identifiants machine du runner ne descendent jamais dans le processus de l'agent.
  delete env.TASKFORCE_RUNNER_CLIENT_ID;
  delete env.TASKFORCE_RUNNER_CLIENT_SECRET;
  if (hookToken) env[HOOK_TOKEN_ENV] = hookToken;
  else delete env[HOOK_TOKEN_ENV];
  return env;
}

/** Serveur MCP de l'instance pour ce run : HTTP, jeton de session déléguée, en-tête du run. */
export function mcpConfig(config: RunnerConfig, claim: Claim, sessionToken: string): Record<string, unknown> {
  return {
    mcpServers: {
      [MCP_SERVER]: {
        type: "http",
        url: `${config.apiUrl}/workspaces/${encodeURIComponent(claim.workspaceSlug)}/mcp`,
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          [DELIVERY_RUN_HEADER]: String(claim.runId),
        },
      },
    },
  };
}

/**
 * Réglages imposés à la session : pas d'attribution (sauf choix contraire), et deux hooks vers le serveur local du
 * runner : les règles avant chaque action, la décision humaine pour ce qu'elles demandent. Le délai du second dépasse
 * l'attente du serveur : c'est le serveur qui répond « refusé ».
 */
export function agentSettings(config: RunnerConfig, hookUrl: string, preToolUseUrl: string): Record<string, unknown> {
  return {
    // Les deux clés, l'ancienne et la nouvelle, pour couvrir les versions de Claude Code.
    ...(config.agent.attribution ? {} : { includeCoAuthoredBy: false, attribution: { commit: "", pr: "" } }),
    hooks: {
      // Avant CHAQUE action, autorisée d'avance ou non : les règles de la mission, jugées sur place. Garde fermée : un
      // serveur local injoignable bloque l'action au lieu de la laisser passer (onFailure, Claude Code 2.1.295,
      // d'après son journal des versions).
      PreToolUse: [{
        matcher: ".*",
        hooks: [{
          type: "http",
          url: preToolUseUrl,
          headers: { Authorization: `Bearer $${HOOK_TOKEN_ENV}` },
          allowedEnvVars: [HOOK_TOKEN_ENV],
          timeout: 30,
          onFailure: "block",
        }],
      }],
      PermissionRequest: [{
        matcher: ".*",
        hooks: [{
          type: "http",
          url: hookUrl,
          headers: { Authorization: `Bearer $${HOOK_TOKEN_ENV}` },
          allowedEnvVars: [HOOK_TOKEN_ENV],
          timeout: config.agent.approvalTimeoutMinutes * 60 + 60,
          onFailure: "block",
        }],
      }],
    },
  };
}

export interface AgentRunOptions {
  mode: AgentMode;
  /** Les règles de la mission, déjà vérifiées par leur empreinte. */
  rules: RulesBundle;
  /** Nom de la branche git (mode `repo`) ; absent en mode `repoless`. */
  branch?: string;
  /** Arrêt du runner : Claude Code est arrêté tout de suite, le run finit en échec. */
  signal?: AbortSignal;
}

/**
 * Lance Claude Code sans interface dans le dossier de travail (worktree git en mode `repo`, dossier
 * temporaire jetable en mode `repoless`), branché sur le serveur MCP de l'instance avec la session déléguée du run.
 *
 * Le jeton de session est de COURTE durée (jamais le secret du runner) et ne vaut que dans le périmètre de ce
 * run. Les fichiers qui le portent vivent hors du dossier de travail et sont supprimés à la fin.
 */
export async function runAgent(
  config: RunnerConfig, claim: Claim, workDir: string, sessionToken: string, opts: AgentRunOptions,
  api: ApprovalApi & EventSink,
): Promise<AgentOutcome> {
  const tmp = join(config.home, "tmp");
  mkdirSync(tmp, { recursive: true });
  const mcpConfigPath = join(tmp, `run-${claim.runId}-mcp.json`);
  const settingsPath = join(tmp, `run-${claim.runId}-settings.json`);

  const approvals = new ApprovalServer(api, claim.runId, workDir, {
    waitMs: config.agent.approvalTimeoutMinutes * 60_000,
    rules: opts.rules,
    onDecision: (tool, d) => log.info(`Rule decision: ${tool} ${d.effect}${d.rule ? ` (${d.rule.id})` : ""}`),
  });
  const relay = new EventRelay(api, claim.runId);
  const hookUrl = await approvals.start();

  writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig(config, claim, sessionToken)), { encoding: "utf8", mode: 0o600 });
  writeFileSync(settingsPath, JSON.stringify(agentSettings(config, hookUrl, approvals.preToolUseUrl)), { encoding: "utf8", mode: 0o600 });

  try {
    const result = await run(config.agent.command, agentArgs(config, claim, mcpConfigPath, settingsPath), {
      cwd: workDir,
      env: agentEnv(config, process.env, approvals.token),
      input: opts.mode === "repoless" ? buildReplyPrompt(claim) : buildPrompt(claim, opts.branch ?? ""),
      timeoutMs: config.agent.timeoutMinutes * 60_000,
      signal: opts.signal,
      onStdoutLine: (line) => {
        try {
          relay.push(toEvents(JSON.parse(line), workDir));
        } catch {
          // ligne non JSON (avertissement de la CLI) : rien pour la chronologie
        }
      },
    });
    if (result.aborted) {
      return { ok: false, text: "The runner stopped while Claude Code was working (TaskForce was closed). Delegate the task again.", costUsd: null, turns: null };
    }
    if (result.timedOut) {
      return { ok: false, text: `The agent was stopped after ${config.agent.timeoutMinutes} min (timeout).`, costUsd: null, turns: null };
    }
    return parseAgentOutput(result.code, result.stdout, result.stderr);
  } finally {
    await relay.close().catch((e: unknown) => log.warn(`Live timeline: ${(e as Error).message}`));
    await approvals.stop();
    rmSync(mcpConfigPath, { force: true });
    rmSync(settingsPath, { force: true });
  }
}
