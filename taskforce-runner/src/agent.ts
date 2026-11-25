import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import type { Claim, RunnerEvent } from "./api.js";
import { ApprovalServer, exactAction, type ApprovalApi } from "./approvals.js";
import type { RunnerConfig } from "./config.js";
import { EventRelay, type EventSink } from "./events.js";
import type { RulesBundle } from "./harness/engine/rules-engine.js";
import type { Exposure } from "./harness/exposure.js";
import { log } from "./log.js";
import { run, type StdinChannel } from "./proc.js";
import { buildFollowUpPrompt, buildPrompt, buildReplyPrompt } from "./prompt.js";
import { agentInfo, describeToolInput, parseAgentOutput, toEvents, toolLabel, WriteWatcher, type AgentOutcome } from "./stream.js";
import { cut } from "./text.js";

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
  // Rien du runner ne descend dans le processus de l'agent : ni ses identifiants machine, ni son dossier (R159, L9).
  for (const name of Object.keys(env)) {
    if (name.startsWith("TASKFORCE_RUNNER_")) delete env[name];
  }
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
  /** Ce que la mission a en main pour le socle (R158) : partagé avec les sorties qui suivent le travail de l'agent. */
  exposure?: Exposure;
  /** Nom de la branche git (mode `repo`) ; absent en mode `repoless`. */
  branch?: string;
  /** Arrêt du runner : Claude Code est arrêté tout de suite, le run finit en échec. */
  signal?: AbortSignal;
  /** Un outil qui a pu écrire vient de finir : le relevé des changements repart (R139). */
  onWrite?: () => void;
  /** Le moyen de parler à l'agent pendant son travail, le temps qu'il tourne (R140). */
  onConversation?: (tell: ((text: string) => boolean) | null) => void;
  /**
   * La chronologie de la mission, numérotée d'un bout à l'autre du run (TF-J2-7) : le runner la tient, l'agent y ajoute.
   * Absente, l'agent a la sienne, fermée à sa fin.
   */
  relay?: EventRelay;
  /** Où garder la session brute de l'agent sur ce poste ; le dossier la référence par son empreinte (R212). */
  sessionFile?: string;
}

/** Le plus long brief que le dossier garde à côté de sa chaîne. */
const MAX_BRIEF = 200_000;

const truthy = (value: string | undefined): boolean => value !== undefined && /^(1|true|yes|on)$/i.test(value.trim());

/**
 * Qui sert le modèle, lu dans l'environnement que Claude Code reçoit (R159, L5) : Amazon Bedrock, Google Vertex, une
 * autre adresse que celle d'Anthropic (une passerelle, un modèle local : son adresse n'entre pas au dossier), ou
 * Anthropic.
 */
export function providerOf(env: NodeJS.ProcessEnv): string {
  if (truthy(env.CLAUDE_CODE_USE_BEDROCK)) return "amazon-bedrock";
  if (truthy(env.CLAUDE_CODE_USE_VERTEX)) return "google-vertex";
  const base = env.ANTHROPIC_BASE_URL?.trim();
  if (base) {
    try {
      if (new URL(base).hostname !== "api.anthropic.com") return "another-endpoint";
    } catch {
      return "another-endpoint";
    }
  }
  return "anthropic";
}

/**
 * Le dossier des réglages gérés par l'organisation, que Claude Code lit toujours, selon le système (R159 de #551,
 * troisième tour, c-a), d'après https://code.claude.com/docs/en/managed-settings : `managed-settings.json` et les
 * `*.json` de `managed-settings.d/` à côté. Sous Windows, Claude Code ne lit plus l'ancien chemin sous `ProgramData`.
 */
export function managedSettingsDir(platform: NodeJS.Platform = process.platform): string {
  if (platform === "win32") return "C:\\Program Files\\ClaudeCode";
  if (platform === "darwin") return "/Library/Application Support/ClaudeCode";
  return "/etc/claude-code";
}

/**
 * Ce que le runner ne lit pas des réglages gérés, et que le dossier dit (c-a) : les réglages poussés par le serveur
 * d'Anthropic, et ceux du système, le registre de Windows ou le profil géré de macOS.
 */
export function providerUnread(platform: NodeJS.Platform = process.platform): string[] {
  if (platform === "win32") return ["windows-registry", "server-managed-settings"];
  if (platform === "darwin") return ["macos-managed-preferences", "server-managed-settings"];
  return ["server-managed-settings"];
}

/** L'`env` d'un fichier de réglages de Claude Code ; vide s'il manque ou ne se lit pas. */
function settingsEnv(path: string): Record<string, string> {
  try {
    const env = (JSON.parse(readFileSync(path, "utf8")) as { env?: unknown }).env;
    if (!env || typeof env !== "object" || Array.isArray(env)) return {};
    return Object.fromEntries(Object.entries(env as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  } catch {
    return {};
  }
}

/**
 * L'`env` des réglages gérés, comme Claude Code le fusionne : `managed-settings.json` d'abord, puis chaque `*.json` de
 * `managed-settings.d/` par ordre alphabétique, les fichiers cachés écartés ; variable par variable, le dernier l'emporte.
 */
function managedEnv(dir: string): Record<string, string> {
  let dropIns: string[] = [];
  try {
    dropIns = readdirSync(join(dir, "managed-settings.d")).filter((name) => name.endsWith(".json") && !name.startsWith(".")).sort();
  } catch {
    dropIns = [];
  }
  return Object.assign({}, settingsEnv(join(dir, "managed-settings.json")),
    ...dropIns.map((name) => settingsEnv(join(dir, "managed-settings.d", name))));
}

/**
 * L'environnement qui choisit le fournisseur au lancement de Claude Code (R159, second tour, L-c) : celui que le runner
 * lui passe, puis l'`env` des réglages qu'il charge, dans l'ordre où ils l'emportent : ceux de l'utilisateur
 * (`CLAUDE_CONFIG_DIR`, sinon `~/.claude`), puis ceux de l'organisation. Ceux du dépôt n'y sont pas : le runner lance
 * Claude Code avec `--setting-sources user` (voir {@link agentArgs}), qui ne les lit pas. Un script de l'agent peut récrire
 * les réglages de l'utilisateur pour les missions suivantes : le dossier dit que c'est la configuration du lancement.
 */
export function launchEnv(env: NodeJS.ProcessEnv, home: string = homedir(), managed: string = managedSettingsDir()): NodeJS.ProcessEnv {
  const configDir = env.CLAUDE_CONFIG_DIR?.trim() || join(home, ".claude");
  return { ...env, ...settingsEnv(join(configDir, "settings.json")), ...managedEnv(managed) };
}

/** Le modèle qui a réellement répondu, tel qu'une réponse de l'agent le nomme ; null pour les autres lignes. */
export function servedModel(message: unknown): string | null {
  if (!message || typeof message !== "object") return null;
  const line = message as { type?: unknown; message?: { model?: unknown } };
  const model = line.type === "assistant" ? line.message?.model : undefined;
  return typeof model === "string" && model.trim() && !model.startsWith("<") ? model.trim().slice(0, 120) : null;
}

/**
 * Le dernier mot du runner sur l'agent : sa version, le modèle de la configuration, ceux que les réponses ont nommés, le
 * premier d'entre eux comme modèle de la mission, et qui l'a servi. Le dernier événement `agent` fait l'en-tête du dossier.
 */
export function agentEvent(info: { version?: string; model?: string; session?: string }, served: readonly string[],
  provider: string): RunnerEvent {
  const model = served[0] ?? info.model;
  return {
    kind: "agent",
    text: `Claude Code ${info.version ?? ""} with ${model ?? "its default model"}`.replace(/\s+/g, " "),
    agent: {
      ...(info.version ? { version: info.version } : {}),
      ...(model ? { model } : {}),
      ...(info.model ? { configured: info.model } : {}),
      served: [...served],
      ...(info.session ? { session: info.session } : {}),
      provider,
      // Le fournisseur tel que la configuration le disait au lancement (R159, second tour, L-c), et ce qui n'en est pas
      // lu : le registre ou le profil géré du système, les réglages du serveur (troisième tour, c-a).
      providerFrom: "launch-configuration",
      providerUnread: providerUnread(),
    },
  };
}

/**
 * La session brute de l'agent telle que le runner la lit (sa sortie `stream-json`, ligne à ligne) : gardée sur ce poste,
 * à part, et référencée au dossier par son empreinte (R212). Elle sert à l'enquête, pas à la lecture.
 */
export class SessionRecord {
  private readonly hash = createHash("sha256");
  private bytes = 0;

  constructor(private readonly file?: string) {
    if (file) {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, "", { encoding: "utf8", mode: 0o600 });
    }
  }

  line(text: string): void {
    const data = `${text}\n`;
    this.hash.update(data, "utf8");
    this.bytes += Buffer.byteLength(data, "utf8");
    if (this.file) {
      try {
        appendFileSync(this.file, data, "utf8");
      } catch {
        // le disque plein ne coûte pas la mission : l'empreinte dit encore ce qui a été lu
      }
    }
  }

  digest(): { sha256: string; bytes: number } {
    return { sha256: `sha256:${this.hash.copy().digest("hex")}`, bytes: this.bytes };
  }
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

  const relay = opts.relay ?? new EventRelay(api, claim.runId);
  const approvals = new ApprovalServer(api, claim.runId, workDir, {
    waitMs: config.agent.approvalTimeoutMinutes * 60_000,
    rules: opts.rules,
    exposure: opts.exposure,
    allowedInAdvance: config.agent.extraAllowedTools,
    // Au-delà de ce nombre de changements dans TaskForce sur la mission, chacun se demande (R110).
    maxTaskForceChanges: config.agent.maxTaskForceChanges,
    // Chaque décision des règles va au dossier de preuve de la mission (le serveur ne l'affiche pas dans la chronologie),
    // avec les faits jugés et l'action exacte : un tiers la rejuge avec le paquet exporté (TF-J2-7).
    onDecision: (tool, d, input, facts) => {
      log.info(`Rule decision: ${tool} ${d.effect}${d.rule ? ` (${d.rule.id})` : ""}`);
      relay.push([{
        kind: "decision", tool: toolLabel(tool), text: describeToolInput(tool, input, workDir) || "(no details)",
        effect: d.effect, ...(d.rule ? { rule: d.rule.id } : {}),
        ...(facts.length > 0 ? { facts } : {}), ...exactAction(tool, input, workDir),
      }]);
    },
    beforeAsk: () => relay.flush(),
    // Déjà autorisée pour toute la mission (R46) : la décision de la personne s'applique encore, et le dossier le garde.
    onMissionAllowed: (tool, scope, input) => {
      const rule = `allowed for this mission (${scope})`;
      relay.push([{
        kind: "decision", tool: toolLabel(tool), text: describeToolInput(tool, input, workDir) || "(no details)",
        effect: "allow", rule: rule.length > 80 ? `${rule.slice(0, 78)}.)` : rule, ...exactAction(tool, input, workDir),
      }]);
    },
  });
  const hookUrl = await approvals.start();

  writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig(config, claim, sessionToken)), { encoding: "utf8", mode: 0o600 });
  writeFileSync(settingsPath, JSON.stringify(agentSettings(config, hookUrl, approvals.preToolUseUrl)), { encoding: "utf8", mode: 0o600 });

  const prompt = opts.mode === "repoless" ? buildReplyPrompt(claim)
    : claim.followUp ? buildFollowUpPrompt(claim, opts.branch ?? "", claim.followUp.comments)
    : buildPrompt(claim, opts.branch ?? "");
  // Le brief tel qu'il part à l'agent entre au dossier par son empreinte, son texte à côté de la chaîne (R198) ; trop
  // long, il est coupé entre deux caractères, et la coupe se dit (R159, L4).
  relay.push([{ kind: "brief", text: "The brief given to Claude Code", body: cut(prompt, MAX_BRIEF) }]);
  const session = new SessionRecord(opts.sessionFile);
  // agentEnv ne touche pas à ce qui choisit le fournisseur (Bedrock, Vertex, l'adresse de l'API) : il se lit ici, avec
  // les réglages que Claude Code charge au lancement (R159, second tour, L-c).
  const provider = providerOf(launchEnv(process.env));
  // Ce que Claude Code dit de lui au démarrage, et chaque modèle que ses réponses nomment (R159, L5).
  let started: { version?: string; model?: string; session?: string } | null = null;
  const served: string[] = [];

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
          session.line(line);
          try {
            const message: unknown = JSON.parse(line);
            // L'agent réellement lancé, tel qu'il se présente : sa version, son modèle, sa session (R198) ; puis chaque
            // modèle qui a réellement répondu.
            const info = agentInfo(message);
            if (info) {
              started = { ...(started ?? {}), ...info };
              relay.push([agentEvent(started, served, provider)]);
            }
            const model = servedModel(message);
            if (model && !served.includes(model)) served.push(model);
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
    const resumed = claim.followUp?.sessionId ?? null;
    let outcome = await attempt(resumed);
    if (resumed && outcome.sessionLost) {
      // Le brief d'une reprise se suffit à lui-même : l'agent repart de lui, sans sa conversation d'avant.
      log.warn("The agent's session is no longer on this computer: it starts again from the comments alone.");
      outcome = await attempt(null);
    }
    if (!started && served.length === 0) {
      log.warn("Claude Code did not say which model it ran: the evidence will say so.");
    } else {
      // Le dernier mot sur l'agent : le modèle que ses réponses ont nommé, plus seulement celui de sa configuration.
      relay.push([agentEvent(started ?? {}, served, provider)]);
    }
    return { ...outcome, session: { ...(outcome.sessionId ? { id: outcome.sessionId } : {}), ...session.digest() } };
  } finally {
    // La chronologie du runner continue après l'agent (les sorties, les tests) : il la ferme lui-même.
    const done = opts.relay ? relay.flush() : relay.close();
    await done.catch((e: unknown) => log.warn(`Live timeline: ${(e as Error).message}`));
    await approvals.stop();
    rmSync(mcpConfigPath, { force: true });
    rmSync(settingsPath, { force: true });
  }
}
