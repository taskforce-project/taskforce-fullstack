import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Approval, RunnerEvent } from "../src/api.js";
import { ApprovalServer, hookDecision, type ApprovalApi } from "../src/approvals.js";
import { EventRelay } from "../src/events.js";
import { describeToolInput, toEvents, toolLabel } from "../src/stream.js";
import { supportsApprovals } from "../src/version.js";

const WORK = process.platform === "win32" ? "C:\\work\\run-42" : "/work/run-42";
const inWork = (file: string): string => (process.platform === "win32" ? `C:\\work\\run-42\\${file.replaceAll("/", "\\")}` : `/work/run-42/${file}`);

describe("chronologie : lignes stream-json -> événements", () => {
  it("démarrage : version et modèle", () => {
    assert.deepEqual(toEvents({ type: "system", subtype: "init", model: "claude-haiku-4-5", claude_code_version: "2.1.293" }, WORK),
      [{ kind: "start", text: "Claude Code 2.1.293 started with claude-haiku-4-5" }]);
  });

  it("texte de l'agent, borné", () => {
    const [event] = toEvents({ type: "assistant", message: { content: [{ type: "text", text: "x".repeat(2000) }] } }, WORK);
    assert.equal(event?.kind, "text");
    assert.ok((event?.text.length ?? 0) <= 600);
  });

  it("appels d'outils : commande, chemin relatif au dossier de travail, outil MCP lisible", () => {
    const events = toEvents({ type: "assistant", message: { content: [
      { type: "tool_use", name: "Bash", input: { command: "npm test" } },
      { type: "tool_use", name: "Edit", input: { file_path: inWork("src/app.ts") } },
      { type: "tool_use", name: "mcp__taskforce__get_issue", input: { projectId: 12, issueId: 55 } },
      { type: "tool_use", name: "ToolSearch", input: { query: "select:x" } },
    ] } }, WORK);
    assert.deepEqual(events, [
      { kind: "tool", tool: "Bash", text: "npm test" },
      { kind: "tool", tool: "Edit", text: "src/app.ts" },
      { kind: "tool", tool: "taskforce: get_issue", text: '{"projectId":12,"issueId":55}' },
    ]);
  });

  it("un chemin hors du dossier de travail ne montre que le nom du fichier", () => {
    const outside = process.platform === "win32" ? "C:\\Users\\ada\\secret\\notes.txt" : "/home/ada/secret/notes.txt";
    assert.equal(describeToolInput("Read", { file_path: outside }, WORK), "notes.txt");
  });

  it("échec d'outil gardé, résultat réussi ignoré, refus de TaskForce non doublé", () => {
    const events = toEvents({ type: "user", message: { content: [
      { type: "tool_result", is_error: true, content: "npm ERR! missing script: lint" },
      { type: "tool_result", is_error: false, content: "ok" },
      { type: "tool_result", is_error: true, content: "Denied in TaskForce: the person who delegated..." },
    ] } }, WORK);
    assert.deepEqual(events, [{ kind: "error", text: "npm ERR! missing script: lint" }]);
  });

  it("refus d'autorisation", () => {
    assert.deepEqual(toEvents({ type: "system", subtype: "permission_denied", tool_name: "WebFetch", message: "Denied in TaskForce" }, WORK),
      [{ kind: "denied", tool: "WebFetch", text: "Denied in TaskForce" }]);
  });

  it("lignes sans intérêt pour la chronologie", () => {
    for (const line of [null, "texte", { type: "rate_limit_event" }, { type: "system", subtype: "task_summary" }]) {
      assert.deepEqual(toEvents(line, WORK), []);
    }
  });

  it("libellé d'outil", () => {
    assert.equal(toolLabel("mcp__taskforce__add_comment"), "taskforce: add_comment");
    assert.equal(toolLabel("Bash"), "Bash");
  });
});

describe("relais de la chronologie", () => {
  it("envoie par lots, dans l'ordre, jusqu'au plafond du run", async () => {
    const sent: RunnerEvent[][] = [];
    const relay = new EventRelay({ events: async (_runId, batch) => { sent.push(batch); } }, 42,
      { flushMs: 10_000, maxBatch: 2, maxEvents: 5 });
    relay.push([1, 2, 3, 4, 5, 6, 7].map((n) => ({ kind: "text", text: String(n) })));
    await relay.close();
    assert.deepEqual(sent.map((batch) => batch.map((e) => e.text)), [["1", "2"], ["3", "4"], ["5"]]);
  });

  it("un échec d'envoi n'interrompt rien", async () => {
    const relay = new EventRelay({ events: async () => { throw new Error("down"); } }, 42, { flushMs: 10_000 });
    relay.push([{ kind: "text", text: "a" }]);
    await relay.close();
  });
});

/** Faux TaskForce : la demande reçoit ses statuts successifs. */
function fakeApi(statuses: Approval["status"][], fail = false): ApprovalApi & { requests: Array<{ tool: string; summary: string }> } {
  const requests: Array<{ tool: string; summary: string }> = [];
  let index = 0;
  const next = (): Approval => ({ approvalId: 9, status: statuses[Math.min(index++, statuses.length - 1)] ?? "PENDING", expiresAt: "" });
  return {
    requests,
    requestApproval: async (_runId, tool, summary) => {
      if (fail) throw new Error("TaskForce unreachable");
      requests.push({ tool, summary });
      return next();
    },
    approvalStatus: async () => next(),
  };
}

async function askHook(url: string, token: string | null, body: Record<string, unknown>): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

const BASH_REQUEST = { hook_event_name: "PermissionRequest", tool_name: "Bash", tool_input: { command: "npm install lodash" } };

describe("serveur local des validations", () => {
  const cases: Array<[string, Approval["status"][], boolean]> = [
    ["autorisée dans TaskForce", ["PENDING", "ALLOWED"], true],
    ["refusée dans TaskForce", ["PENDING", "DENIED"], false],
    ["expirée", ["PENDING", "EXPIRED"], false],
    ["sans réponse dans le délai", ["PENDING"], false],
  ];
  for (const [label, statuses, allowed] of cases) {
    it(`demande ${label} -> ${allowed ? "allow" : "deny"}`, async () => {
      const api = fakeApi(statuses);
      const server = new ApprovalServer(api, 42, WORK, { waitMs: 150, pollMs: 10 });
      const url = await server.start();
      try {
        const { status, json } = await askHook(url, server.token, BASH_REQUEST);
        assert.equal(status, 200);
        const decision = (json.hookSpecificOutput as { decision: { behavior: string } }).decision;
        assert.equal(decision.behavior, allowed ? "allow" : "deny");
        assert.deepEqual(api.requests, [{ tool: "Bash", summary: "npm install lodash" }]);
      } finally {
        await server.stop();
      }
    });
  }

  it("TaskForce injoignable : refus", async () => {
    const server = new ApprovalServer(fakeApi([], true), 42, WORK, { waitMs: 100, pollMs: 10 });
    const url = await server.start();
    try {
      const { json } = await askHook(url, server.token, BASH_REQUEST);
      assert.equal((json.hookSpecificOutput as { decision: { behavior: string } }).decision.behavior, "deny");
    } finally {
      await server.stop();
    }
  });

  for (const token of [null, "wrong"]) {
    it(`jeton ${token === null ? "absent" : "faux"} : 401, rien n'est demandé`, async () => {
      const api = fakeApi(["ALLOWED"]);
      const server = new ApprovalServer(api, 42, WORK, { waitMs: 100, pollMs: 10 });
      const url = await server.start();
      try {
        assert.equal((await askHook(url, token, BASH_REQUEST)).status, 401);
        assert.deepEqual(api.requests, []);
      } finally {
        await server.stop();
      }
    });
  }

  it("n'écoute que sur 127.0.0.1", async () => {
    const server = new ApprovalServer(fakeApi(["ALLOWED"]), 42, WORK, { waitMs: 100 });
    const url = await server.start();
    await server.stop();
    assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/permission$/);
  });

  it("réponse au format du hook PermissionRequest", () => {
    assert.deepEqual(hookDecision(true), { hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "allow" } } });
    assert.deepEqual(hookDecision(false, "no"), { hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "deny", message: "no" } } });
  });
});

describe("version minimale de Claude Code", () => {
  const cases: Array<[string, boolean]> = [
    ["2.1.293 (Claude Code)", true],
    ["2.1.300 (Claude Code)", true],
    ["2.2.0", true],
    ["3.0.0", true],
    ["2.1.292 (Claude Code)", false],
    ["2.0.999", false],
    ["1.9.0", false],
    ["stub-agent 0.1.0", false],
    ["", false],
  ];
  for (const [line, expected] of cases) {
    it(`${JSON.stringify(line)} -> ${expected}`, () => assert.equal(supportsApprovals(line), expected));
  }
});
