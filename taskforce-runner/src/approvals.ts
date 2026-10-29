import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";

import type { Approval, AskedBy } from "./api.js";
import { toolFacts } from "./harness/facts.js";
import { decideAll, type Decision, type RulesBundle } from "./harness/rules.js";
import { log } from "./log.js";
import { describeToolInput, toolLabel } from "./stream.js";

/**
 * La porte locale de Claude Code (spécification de la v2, §7.1), deux hooks HTTP servis par ce serveur local :
 * - `PreToolUse`, avant chaque action : les règles de la mission la jugent sur place, autoriser ou refuser ;
 * - `PermissionRequest` (OSS-5.4), pour ce que les règles demandent : Claude Code tourne en `--permission-mode manual
 *   --permission-prompts none` et rien n'est autorisé d'avance, donc une action sans décision des règles arrive ici.
 *   Le serveur ouvre la demande dans TaskForce, attend la décision de la personne qui a délégué, puis répond au hook.
 *
 * Refus par défaut, à chaque maillon : TaskForce injoignable, demande expirée, réponse illisible, ou délai du hook
 * dépassé (Claude Code refuse alors de lui-même, vérifié sur la CLI 2.1.293).
 *
 * Le serveur n'écoute que sur 127.0.0.1, sur un port libre, et exige un jeton aléatoire propre au run, transmis à
 * Claude Code par une variable d'environnement (jamais écrit dans un fichier).
 */

/** Ce que le serveur attend de l'API TaskForce (le client réel, ou un faux dans les tests). */
export interface ApprovalApi {
  requestApproval(runId: number, tool: string, summary: string, askedBy?: AskedBy): Promise<Approval>;
  approvalStatus(runId: number, approvalId: number): Promise<Approval>;
}

export interface ApprovalServerOptions {
  /** Les règles de la mission : le hook `PreToolUse` juge chaque action avec elles, sur place. */
  rules?: RulesBundle;
  /** Chaque décision prise sur place, avec l'entrée de l'outil, pour la trace. */
  onDecision?: (tool: string, decision: Decision, input: unknown) => void;
  /** Avant d'ouvrir une demande dans TaskForce : la trace en attente part d'abord, le dossier garde l'ordre réel. */
  beforeAsk?: () => Promise<void>;
  /** Attente maximale d'une décision ; au-delà, refus. */
  waitMs: number;
  /** Intervalle de lecture de la décision. */
  pollMs?: number;
}

/**
 * Réponse du hook `PreToolUse` à une décision des règles. Autoriser ou refuser se tranchent ici ; « demander » ne rend
 * pas de décision, ce qui laisse l'action, jamais autorisée d'avance, aller au hook `PermissionRequest`, où la personne
 * décide (un « ask » de `PreToolUse` finirait en refus sans interface).
 */
export function preToolUseDecision(decision: Decision): Record<string, unknown> {
  if (decision.effect === "ask") return {};
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
): Promise<boolean> {
  const deadline = Date.now() + waitMs;
  let approval: Approval;
  try {
    approval = await api.requestApproval(runId, tool, summary, askedBy);
    log.info(`Approval requested in TaskForce: ${tool} ${summary.slice(0, 80)}`);
  } catch (e) {
    log.warn(`Approval request refused by TaskForce, action denied: ${(e as Error).message}`);
    return false;
  }
  while (approval.status === "PENDING" && Date.now() < deadline) {
    await sleep(pollMs);
    try {
      approval = await api.approvalStatus(runId, approval.approvalId);
    } catch (e) {
      log.warn(`Approval status unavailable: ${(e as Error).message}`);
    }
  }
  log.info(`Approval ${approval.approvalId}: ${approval.status === "PENDING" ? "no answer in time" : approval.status.toLowerCase()}`);
  return approval.status === "ALLOWED";
}

const MAX_BODY = 1_000_000;

export class ApprovalServer {
  private server: Server | null = null;
  private baseUrl = "";
  readonly token = randomBytes(32).toString("hex");
  private readonly pollMs: number;

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
    if (route === "/pre-tool-use") {
      this.reply(res, 200, preToolUseDecision(this.judge(input)));
      return;
    }
    const tool = typeof input.tool_name === "string" ? input.tool_name : "unknown tool";
    const summary = describeToolInput(tool, input.tool_input, this.workDir) || "(no details)";
    await this.options.beforeAsk?.().catch(() => undefined);
    const allow = await this.decide(toolLabel(tool), summary);
    this.reply(res, 200, allow
      ? hookDecision(true)
      : hookDecision(false, "Denied in TaskForce: the person who delegated this task did not allow this action. Do not "
        + "retry it; find another way or explain in your summary what you needed."));
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
