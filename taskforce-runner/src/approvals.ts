import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";

import type { Approval } from "./api.js";
import { log } from "./log.js";
import { describeToolInput, toolLabel } from "./stream.js";

/**
 * Validations dans l'app (OSS-5.4). Claude Code tourne en `--permission-mode manual --permission-prompts none` : une
 * action hors de la liste pré-autorisée déclenche le hook `PermissionRequest`, déclaré en HTTP vers ce serveur local.
 * Le serveur ouvre la demande dans TaskForce, attend la décision de la personne qui a délégué, puis répond au hook.
 *
 * Refus par défaut, à chaque maillon : TaskForce injoignable, demande expirée, réponse illisible, ou délai du hook
 * dépassé (Claude Code refuse alors de lui-même, vérifié sur la CLI 2.1.293).
 *
 * Le serveur n'écoute que sur 127.0.0.1, sur un port libre, et exige un jeton aléatoire propre au run, transmis à
 * Claude Code par une variable d'environnement (jamais écrit dans un fichier).
 */

/** Ce que le serveur attend de l'API TaskForce (le client réel, ou un faux dans les tests). */
export interface ApprovalApi {
  requestApproval(runId: number, tool: string, summary: string): Promise<Approval>;
  approvalStatus(runId: number, approvalId: number): Promise<Approval>;
}

export interface ApprovalServerOptions {
  /** Attente maximale d'une décision ; au-delà, refus. */
  waitMs: number;
  /** Intervalle de lecture de la décision. */
  pollMs?: number;
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

const MAX_BODY = 1_000_000;

export class ApprovalServer {
  private server: Server | null = null;
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
        log.warn(`Approval request failed: ${(e as Error).message}`);
        this.reply(res, 200, hookDecision(false, "Denied: the runner could not process the approval request."));
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });
    this.server = server;
    const { port } = server.address() as AddressInfo;
    return `http://127.0.0.1:${port}/permission`;
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== "POST" || req.url !== "/permission") {
      this.reply(res, 404, { error: "not found" });
      return;
    }
    if (!this.authorized(req.headers.authorization)) {
      this.reply(res, 401, { error: "unauthorized" });
      return;
    }
    const input = await readJson(req);
    const tool = typeof input.tool_name === "string" ? input.tool_name : "unknown tool";
    const summary = describeToolInput(tool, input.tool_input, this.workDir) || "(no details)";
    const allow = await this.decide(toolLabel(tool), summary);
    this.reply(res, 200, allow
      ? hookDecision(true)
      : hookDecision(false, "Denied in TaskForce: the person who delegated this task did not allow this action. Do not "
        + "retry it; find another way or explain in your summary what you needed."));
  }

  /** Ouvre la demande dans TaskForce puis attend la décision ; tout ce qui n'est pas une autorisation est un refus. */
  async decide(tool: string, summary: string): Promise<boolean> {
    const deadline = Date.now() + this.options.waitMs;
    let approval: Approval;
    try {
      approval = await this.api.requestApproval(this.runId, tool, summary);
      log.info(`Approval requested in TaskForce: ${tool} ${summary.slice(0, 80)}`);
    } catch (e) {
      log.warn(`Approval request refused by TaskForce, action denied: ${(e as Error).message}`);
      return false;
    }
    while (approval.status === "PENDING" && Date.now() < deadline) {
      await sleep(this.pollMs);
      try {
        approval = await this.api.approvalStatus(this.runId, approval.approvalId);
      } catch (e) {
        log.warn(`Approval status unavailable: ${(e as Error).message}`);
      }
    }
    log.info(`Approval ${approval.approvalId}: ${approval.status === "PENDING" ? "no answer in time" : approval.status.toLowerCase()}`);
    return approval.status === "ALLOWED";
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
