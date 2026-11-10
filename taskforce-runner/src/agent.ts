import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { Claim } from "./api.js";
import { ApprovalServer, type ApprovalApi } from "./approvals.js";
import type { RunnerConfig } from "./config.js";
import { EventRelay, type EventSink } from "./events.js";
import type { RulesBundle } from "./harness/engine/rules-engine.js";
import { log } from "./log.js";
import { run, type StdinChannel } from "./proc.js";
import { buildFollowUpPrompt, buildPrompt, buildReplyPrompt } from "./prompt.js";
import { describeToolInput, parseAgentOutput, toEvents, toolLabel, WriteWatcher, type AgentOutcome } from "./stream.js";

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

/** Identifiant de session de Claude Code sûr à poser sur une ligne de commande, ou null. Il revient du serveur. */
export function safeSession(session: string | null | undefined): string | null {
  return typeof session === "string" && /^[0-9a-fA-F-]{8,64}$/.test(session) ? session : null;
}

/** Une ligne de l'entrée `stream-json` : un message de la personne. */
export function userMessage(text: string): string {
  return `${JSON.stringify({ type: "user", message: { role: "user", content: text } })}\n`;
}

/** Sans nouvelle de l'agent après un résultat alors qu'une correction attend, l'entrée se ferme quand même. */
const CORRECTION_GRACE_MS = 120_000;

/**
 * La conversation avec l'agent pendant la mission (R140) : le brief, puis les corrections de la personne, qu'il lit à sa
 * prochaine étape. Claude Code attend sur son entrée tant qu'elle est ouverte : elle se ferme à son résultat. Une
 * correction restée sans réponse à ce résultat ouvre un dernier tour, qui finit par le sien.
 */
export class AgentConversation {
  private unanswered = 0;
  private grace: NodeJS.Timeout | null = null;
  private closed = false;

  constructor(private readonly stdin: StdinChannel, private readonly graceMs = CORRECTION_GRACE_MS) {}

  start(prompt: string): void {
    this.stdin.write(userMessage(prompt));
  }

  /** Vrai si le texte est parti ; faux si l'agent a déjà fini. */
  tell(text: string): boolean {
    if (this.closed) return false;
    const sent = this.stdin.write(userMessage(text));
    if (sent) this.unanswered++;
    return sent;
  }

  /** Chaque ligne de la sortie, déjà lue en JSON. */
  heard(message: unknown): void {
    if (this.grace) clearTimeout(this.grace);
    this.grace = null;
    const type = message && typeof message === "object" ? (message as { type?: unknown }).type : undefined;
    if (type === "assistant") {
      this.unanswered = 0;
    } else if (type === "result") {
      if (this.unanswered === 0) {
        this.close();
      } else {
        this.unanswered = 0;
        this.grace = setTimeout(() => this.close(), this.graceMs);
        this.grace.unref();
      }
    }
  }

  close(): void {
    if (this.grace) clearTimeout(this.grace);
    this.grace = null;
    this.closed = true;
    this.stdin.end();
  }
}

/** Arguments de `claude -p`. Exporté pour les tests : c'est la frontière de sécurité de l'exécution locale. */
export function agentArgs(config: RunnerConfig, claim: Claim, mcpConfigPath: string, settingsPath: string, resume: string | null = null): string[] {
  const args = [
    "-p",
    // Suivi en direct : une ligne JSON par message, relayée à la chronologie du run dans TaskForce.
    "--output-format", "stream-json",
    "--verbose",
    // Le brief et les corrections de la personne passent par l'entrée, jamais par la ligne de commande (R140).
    "--input-format", "stream-json",
    // Les règles de la mission jugent chaque action (hook PreToolUse du fichier --settings). Une action qu'elles
    // demandent attend, dans ce même hook, la décision de la personne qui a délégué ; sans décision, refus.
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
  // Une reprise continue la conversation de l'agent : il sait déjà ce qu'il a fait et pourquoi (R139).
  const session = safeSession(resume);
  if (session) args.push("--resume", session);
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
 * runner : les règles avant chaque action, avec la décision humaine pour ce qu'elles demandent, puis, en secours, ce
 * que Claude Code demande encore. Le délai de chacun dépasse l'attente du serveur : c'est le serveur qui répond
 * « refusé ».
 */
export function agentSettings(config: RunnerConfig, hookUrl: string, preToolUseUrl: string): Record<string, unknown> {
  return {
    // Les deux clés, l'ancienne et la nouvelle, pour couvrir les versions de Claude Code.
    ...(config.agent.attribution ? {} : { includeCoAuthoredBy: false, attribution: { commit: "", pr: "" } }),
    hooks: {
      // Avant CHAQUE action, autorisée d'avance ou non : les règles de la mission, jugées sur place, et la personne pour
      // ce qu'elles demandent. Garde fermée : un serveur local injoignable bloque l'action au lieu de la laisser passer
      // (onFailure, Claude Code 2.1.295, d'après son journal des versions).
      PreToolUse: [{
        matcher: ".*",
        hooks: [{
          type: "http",
          url: preToolUseUrl,
          headers: { Authorization: `Bearer $${HOOK_TOKEN_ENV}` },
          allowedEnvVars: [HOOK_TOKEN_ENV],
          timeout: config.agent.approvalTimeoutMinutes * 60 + 60,
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
  /** Un outil qui a pu écrire vient de finir : le relevé des changements repart (R139). */
  onWrite?: () => void;
  /** Le moyen de parler à l'agent pendant son travail, le temps qu'il tourne (R140). */
  onConversation?: (tell: ((text: string) => boolean) | null) => void;
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

  const relay = new EventRelay(api, claim.runId);
  const approvals = new ApprovalServer(api, claim.runId, workDir, {
    waitMs: config.agent.approvalTimeoutMinutes * 60_000,
    rules: opts.rules,
    allowedInAdvance: config.agent.extraAllowedTools,
    // Au-delà de ce nombre de changements dans TaskForce sur la mission, chacun se demande (R110).
    maxTaskForceChanges: config.agent.maxTaskForceChanges,
    // Chaque décision des règles va au dossier de preuve de la mission (le serveur ne l'affiche pas dans la chronologie).
    onDecision: (tool, d, input) => {
      log.info(`Rule decision: ${tool} ${d.effect}${d.rule ? ` (${d.rule.id})` : ""}`);
      relay.push([{
        kind: "decision", tool: toolLabel(tool), text: describeToolInput(tool, input, workDir) || "(no details)",
        effect: d.effect, ...(d.rule ? { rule: d.rule.id } : {}),
      }]);
    },
    beforeAsk: () => relay.flush(),
    // Déjà autorisée pour toute la mission (R46) : la décision de la personne s'applique encore, et le dossier le garde.
    onMissionAllowed: (tool, scope, input) => {
      relay.push([{
        kind: "decision", tool: toolLabel(tool), text: describeToolInput(tool, input, workDir) || "(no details)",
        effect: "allow", rule: `allowed for this mission (${scope})`,
      }]);
    },
  });
  const hookUrl = await approvals.start();

  writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig(config, claim, sessionToken)), { encoding: "utf8", mode: 0o600 });
  writeFileSync(settingsPath, JSON.stringify(agentSettings(config, hookUrl, approvals.preToolUseUrl)), { encoding: "utf8", mode: 0o600 });

  const prompt = opts.mode === "repoless" ? buildReplyPrompt(claim)
    : claim.followUp ? buildFollowUpPrompt(claim, opts.branch ?? "", claim.followUp.comments)
    : buildPrompt(claim, opts.branch ?? "");

  /** Un passage de l'agent ; `resume` : la session à continuer. */
  const attempt = async (resume: string | null): Promise<AgentOutcome> => {
    let conversation: AgentConversation | null = null;
    const watcher = new WriteWatcher();
    try {
      const result = await run(config.agent.command, agentArgs(config, claim, mcpConfigPath, settingsPath, resume), {
        cwd: workDir,
        env: agentEnv(config, process.env, approvals.token),
        timeoutMs: config.agent.timeoutMinutes * 60_000,
        signal: opts.signal,
        onStdin: (stdin) => {
          conversation = new AgentConversation(stdin);
          conversation.start(prompt);
          opts.onConversation?.((text) => conversation?.tell(text) ?? false);
        },
        onStdoutLine: (line) => {
          try {
            const message: unknown = JSON.parse(line);
            relay.push(toEvents(message, workDir));
            if (watcher.wrote(message)) opts.onWrite?.();
            (conversation as AgentConversation | null)?.heard(message);
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
      opts.onConversation?.(null);
      (conversation as AgentConversation | null)?.close();
    }
  };

  try {
    const session = claim.followUp?.sessionId ?? null;
    const outcome = await attempt(session);
    if (session && outcome.sessionLost) {
      // Le brief d'une reprise se suffit à lui-même : l'agent repart de lui, sans sa conversation d'avant.
      log.warn("The agent's session is no longer on this computer: it starts again from the comments alone.");
      return await attempt(null);
    }
    return outcome;
  } finally {
    await relay.close().catch((e: unknown) => log.warn(`Live timeline: ${(e as Error).message}`));
    await approvals.stop();
    rmSync(mcpConfigPath, { force: true });
    rmSync(settingsPath, { force: true });
  }
}
