import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";

import type { Approval, AskedBy, Ruling } from "./api.js";
import { toolFacts } from "./harness/facts.js";
import { decide, decideAll, type Decision, type Facts, type Rule, type RulesBundle } from "./harness/rules.js";
import { log } from "./log.js";
import { describeToolInput, toolLabel } from "./stream.js";

/**
 * La porte locale de Claude Code (spécification de la v2, §7.1), deux hooks HTTP servis par ce serveur local :
 * - `PreToolUse`, avant chaque action : les règles de la mission la jugent sur place. Ce qu'elles autorisent ou refusent
 *   se tranche aussitôt ; ce qu'elles demandent est demandé ici même : le serveur ouvre la demande dans TaskForce, attend
 *   la décision de la personne qui a délégué, puis répond autoriser ou refuser. Aucune action ne repart sans décision :
 *   ce que les règles demandent, la personne le décide avant que l'action parte, quelles que soient les permissions
 *   propres de Claude Code ;
 * - `PermissionRequest` (OSS-5.4), en secours : ce que Claude Code demande encore (un outil que la personne a autorisé
 *   d'avance sur son poste, `allowedInAdvance`, dont les demandes lui reviennent) est demandé de la même façon.
 *
 * Refus par défaut, à chaque maillon : TaskForce injoignable, demande expirée, réponse illisible, ou délai du hook
 * dépassé (Claude Code refuse alors de lui-même, vérifié sur la CLI 2.1.293).
 *
 * Le serveur n'écoute que sur 127.0.0.1, sur un port libre, et exige un jeton aléatoire propre au run, transmis à
 * Claude Code par une variable d'environnement (jamais écrit dans un fichier).
 */

/** Ce que le serveur attend de l'API TaskForce (le client réel, ou un faux dans les tests). */
export interface ApprovalApi {
  requestApproval(runId: number, tool: string, summary: string, askedBy?: AskedBy, ruling?: Ruling): Promise<Approval>;
  approvalStatus(runId: number, approvalId: number): Promise<Approval>;
}

export interface ApprovalServerOptions {
  /** Les règles de la mission : le hook `PreToolUse` juge chaque action avec elles, sur place. */
  rules?: RulesBundle;
  /** Chaque décision prise sur place, avec l'entrée de l'outil, pour la trace. */
  onDecision?: (tool: string, decision: Decision, input: unknown) => void;
  /** Avant d'ouvrir une demande dans TaskForce : la trace en attente part d'abord, le dossier garde l'ordre réel. */
  beforeAsk?: () => Promise<void>;
  /** Une action que la personne a déjà autorisée pour toute la mission (R46) passe sans redemander : la trace le dit. */
  onMissionAllowed?: (tool: string, rule: string, input: unknown) => void;
  /**
   * Les outils que la personne autorise d'avance sur son poste (`agent.extraAllowedTools`, forme de Claude Code :
   * `Bash(mvn test *)`). Ce que les règles demandent pour ces outils revient aux permissions de Claude Code : autorisé
   * d'avance, l'appel passe ; sinon il arrive au hook `PermissionRequest`. Un refus des règles tient toujours.
   */
  allowedInAdvance?: string[];
  /** Attente maximale d'une décision ; au-delà, refus. */
  waitMs: number;
  /** Intervalle de lecture de la décision. */
  pollMs?: number;
}

const DENIED_BY_PERSON = "Denied in TaskForce: the person who delegated this task did not allow this action. Do not retry "
  + "it; find another way or explain in your summary what you needed.";

/**
 * Réponse du hook `PreToolUse` à une décision des règles qui autorise ou refuse. Ce qu'elles demandent ne passe pas
 * par ici : la personne décide d'abord ({@link preToolUseAnswer}). Un « ask » rendu à Claude Code finirait en refus
 * sans interface ; une action laissée sans décision suivrait les permissions de Claude Code au lieu des règles.
 */
export function preToolUseDecision(decision: { effect: "allow" | "deny"; rule: Rule | null }): Record<string, unknown> {
  const reason = decision.rule
    ? `${decision.effect === "deny" ? "Denied" : "Allowed"} by the TaskForce rule ${decision.rule.id}: ${decision.rule.reason}`
    : decision.effect === "deny"
      ? "Denied: the runner could not judge this action."
      : "Internal tool of the agent, with no effect outside the session.";
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: decision.effect,
      permissionDecisionReason: decision.effect === "deny"
        ? `${reason} Do not retry it; find another way or explain in your summary what you needed.`
        : reason,
    },
  };
}

/** Réponse du hook `PreToolUse` après la décision de la personne, pour une action que les règles demandent. */
export function preToolUseAnswer(allow: boolean): Record<string, unknown> {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: allow ? "allow" : "deny",
      permissionDecisionReason: allow ? "Allowed in TaskForce by the person who delegated this task." : DENIED_BY_PERSON,
    },
  };
}

/** Le programme d'une commande simple, sans son chemin. */
function program(command: string | undefined): string | null {
  return command?.trim().split(/\s+/)[0]?.split(/[\\/]/).pop() || null;
}

/**
 * La portée d'un morceau qui demande : la règle qui demande ; sans règle, l'action, et pour une commande son programme.
 * Un morceau qu'on ne sait pas borner (hors de la copie, ou que le shell change) a perdu son action (facts.ts) : il
 * garde une portée à lui, qui ne couvre pas le même programme dans la copie.
 */
function partScope(decision: Decision, facts: Facts, tool: string): string {
  if (decision.rule) return decision.rule.id;
  const name = program(facts.command);
  if (facts.action === "shell") return name ? `shell:${name}` : "shell";
  if (facts.action) return facts.action;
  if (facts.command !== undefined) return name ? `shell:${name}:unbounded` : "shell:unbounded";
  if (facts.path !== undefined) return `${facts.tool ?? tool}:unbounded`;
  return facts.tool ?? tool;
}

/**
 * Ce qu'un accord « pour cette mission » couvre ensuite (R46), morceau par morceau : pour chaque morceau qui demande, la
 * règle qui demande ; sans règle, la même action, et pour une commande le même programme (autoriser `npm install`
 * laisse passer `npm`, pas `curl`). Une commande composée porte la portée de chacun des morceaux qui demandent : un
 * accord pour la mission couvre chacun d'eux, et une commande ne passe ensuite sans demande que si chacun de ses
 * morceaux qui demandent l'est déjà. Sans morceau qui demande (Claude Code demande une action que les règles
 * autorisent) : l'outil.
 */
export function missionScopes(rules: RulesBundle | undefined, factsList: Facts[], tool: string): string[] {
  const scopes = new Set<string>();
  for (const facts of factsList) {
    const decision: Decision = rules ? decide(rules, facts) : { effect: "ask", rule: null };
    if (decision.effect === "ask") scopes.add(partScope(decision, facts, tool));
  }
  return scopes.size > 0 ? [...scopes] : [tool];
}

/** Réponse du hook `PermissionRequest`, au format de Claude Code. */
export function hookDecision(allow: boolean, message?: string): Record<string, unknown> {
  return {
    hookSpecificOutput: {
      hookEventName: "PermissionRequest",
      decision: allow ? { behavior: "allow" } : { behavior: "deny", message: message ?? "Denied in TaskForce." },
    },
  };
}

/**
 * Ouvre une demande dans TaskForce, auprès de la personne qui a délégué, puis attend sa décision : vrai seulement si
 * elle autorise. Sert aux actions de l'agent comme aux sorties que le runner fait après lui.
 */
export async function askInTaskForce(
  api: ApprovalApi, runId: number, tool: string, summary: string, waitMs: number, pollMs = 2_000, askedBy: AskedBy = "agent",
  ruling: Ruling = {},
): Promise<boolean> {
  return (await requestDecision(api, runId, tool, summary, waitMs, pollMs, askedBy, ruling))?.status === "ALLOWED";
}

/**
 * Comme {@link askInTaskForce}, mais rend la demande telle qu'elle a fini, avec la portée d'un accord (R46) ; nulle
 * quand TaskForce n'a pas ouvert la demande. La demande porte ce que les règles ont jugé, pour se dire en mots (R78).
 */
export async function requestDecision(
  api: ApprovalApi, runId: number, tool: string, summary: string, waitMs: number, pollMs = 2_000, askedBy: AskedBy = "agent",
  ruling: Ruling = {},
): Promise<Approval | null> {
  const deadline = Date.now() + waitMs;
  let approval: Approval;
  try {
    approval = await api.requestApproval(runId, tool, summary, askedBy, ruling);
    log.info(`Approval requested in TaskForce: ${tool} ${summary.slice(0, 80)}`);
  } catch (e) {
    log.warn(`Approval request refused by TaskForce, action denied: ${(e as Error).message}`);
    return null;
  }
  while (approval.status === "PENDING" && Date.now() < deadline) {
    await sleep(pollMs);
    try {
      approval = await api.approvalStatus(runId, approval.approvalId);
    } catch (e) {
      log.warn(`Approval status unavailable: ${(e as Error).message}`);
    }
  }
  log.info(`Approval ${approval.approvalId}: ${approval.status === "PENDING" ? "no answer in time" : approval.status.toLowerCase()}`
    + (approval.status === "ALLOWED" && approval.scope === "MISSION" ? ", for this mission" : ""));
  return approval;
}

const MAX_BODY = 1_000_000;

export class ApprovalServer {
  private server: Server | null = null;
  private baseUrl = "";
  readonly token = randomBytes(32).toString("hex");
  private readonly pollMs: number;
  /** Ce que la personne a autorisé pour toute la mission (R46) : la portée de chaque morceau qui demandait. */
  private readonly allowedForMission = new Set<string>();

  constructor(
    private readonly api: ApprovalApi,
    private readonly runId: number,
    private readonly workDir: string,
    private readonly options: ApprovalServerOptions,
  ) {
    this.pollMs = options.pollMs ?? 2_000;
  }

  /** Démarre l'écoute et rend l'URL du hook. */
  async start(): Promise<string> {
    const server = createServer((req, res) => {
      this.handle(req, res).catch((e: unknown) => {
        log.warn(`Hook request failed, action denied: ${(e as Error).message}`);
        this.reply(res, 200, req.url === "/pre-tool-use"
          ? preToolUseDecision({ effect: "deny", rule: null })
          : hookDecision(false, "Denied: the runner could not process the approval request."));
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });
    this.server = server;
    const { port } = server.address() as AddressInfo;
    this.baseUrl = `http://127.0.0.1:${port}`;
    return `${this.baseUrl}/permission`;
  }

  /** URL du hook `PreToolUse`, une fois le serveur démarré. */
  get preToolUseUrl(): string {
    return `${this.baseUrl}/pre-tool-use`;
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const route = req.url === "/permission" || req.url === "/pre-tool-use" ? req.url : null;
    if (req.method !== "POST" || !route) {
      this.reply(res, 404, { error: "not found" });
      return;
    }
    if (!this.authorized(req.headers.authorization)) {
      this.reply(res, 401, { error: "unauthorized" });
      return;
    }
    const input = await readJson(req);
    const tool = typeof input.tool_name === "string" ? input.tool_name : "unknown tool";
    if (route === "/pre-tool-use") {
      const decision = this.judge(input);
      if (decision.effect !== "ask") {
        this.reply(res, 200, preToolUseDecision({ effect: decision.effect, rule: decision.rule }));
      } else if (this.inAdvance(tool)) {
        this.reply(res, 200, {}); // aux permissions de Claude Code : autorisé d'avance, ou le hook PermissionRequest
      } else {
        this.reply(res, 200, preToolUseAnswer(await this.askPerson(tool, input.tool_input)));
      }
      return;
    }
    const allow = await this.askPerson(tool, input.tool_input);
    this.reply(res, 200, allow ? hookDecision(true) : hookDecision(false, DENIED_BY_PERSON));
  }

  /** Un outil que la personne autorise d'avance sur son poste, en tout ou en partie (`Bash`, `Bash(mvn test *)`). */
  private inAdvance(tool: string): boolean {
    return (this.options.allowedInAdvance ?? []).some((entry) => entry === tool || entry.startsWith(`${tool}(`)
      || (entry.startsWith("mcp__") && tool.startsWith(`${entry}__`)));
  }

  /**
   * Demande à la personne qui a délégué, sauf si elle a déjà autorisé pour toute la mission chacun des morceaux qui
   * demandent (R46) ; vrai seulement si elle autorise.
   */
  private async askPerson(tool: string, toolInput: unknown): Promise<boolean> {
    const summary = describeToolInput(tool, toolInput, this.workDir) || "(no details)";
    const { scopes, ...ruling } = this.ruling(tool, toolInput);
    if (scopes.every((s) => this.allowedForMission.has(s))) {
      const scope = scopes.join(", ");
      log.info(`Allowed for this mission earlier: ${tool} (${scope})`);
      this.options.onMissionAllowed?.(tool, scope, toolInput);
      return true;
    }
    await this.options.beforeAsk?.().catch(() => undefined);
    const approval = await requestDecision(this.api, this.runId, toolLabel(tool), summary, this.options.waitMs, this.pollMs,
      "agent", ruling);
    const allow = approval?.status === "ALLOWED";
    if (allow && approval?.scope === "MISSION") for (const s of scopes) this.allowedForMission.add(s);
    return allow;
  }

  /** Juge une action avec les règles de la mission ; sans règles, on demande (rien n'est autorisé d'office). */
  judge(input: Record<string, unknown>): Decision {
    const tool = typeof input.tool_name === "string" ? input.tool_name : "unknown tool";
    const rules = this.options.rules;
    const decision: Decision = rules
      ? decideAll(rules, toolFacts(tool, input.tool_input, this.workDir))
      : { effect: "ask", rule: null };
    this.options.onDecision?.(tool, decision, input.tool_input);
    return decision;
  }

  /**
   * Ce que les règles disent d'une action demandée, sans la trace (le hook `PreToolUse` l'a déjà écrite) : l'action, la
   * règle qui demande et sa raison, et les portées d'un accord pour la mission ({@link missionScopes}).
   */
  ruling(tool: string, toolInput: unknown): Ruling & { scopes: string[] } {
    const facts = toolFacts(tool, toolInput, this.workDir);
    const rules = this.options.rules;
    const decision: Decision = rules ? decideAll(rules, facts) : { effect: "ask", rule: null };
    const action = facts.find((f) => f.action)?.action;
    return {
      ...(action ? { action } : {}),
      ...(decision.rule ? { rule: decision.rule.id, reason: decision.rule.reason } : {}),
      scopes: missionScopes(rules, facts, tool),
    };
  }

  /** Ouvre la demande dans TaskForce puis attend la décision ; tout ce qui n'est pas une autorisation est un refus. */
  decide(tool: string, summary: string): Promise<boolean> {
    return askInTaskForce(this.api, this.runId, tool, summary, this.options.waitMs, this.pollMs);
  }

  private authorized(header: string | undefined): boolean {
    const expected = Buffer.from(`Bearer ${this.token}`);
    const actual = Buffer.from(header ?? "");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  private reply(res: ServerResponse, status: number, body: Record<string, unknown>): void {
    if (res.headersSent) return;
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  }
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new Error("hook input too large");
    chunks.push(chunk as Buffer);
  }
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
}
