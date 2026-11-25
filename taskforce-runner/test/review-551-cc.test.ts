import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError, TaskforceApi, type Approval, type RunnerEvent } from "../src/api.js";
import { ApprovalServer, type ApprovalApi } from "../src/approvals.js";
import { EventRelay } from "../src/events.js";

/**
 * R159 de #551, troisième tour, c-c : rien ne tourne après le plafond sans être dit. Le serveur passait la mission en
 * échec au lot qui atteignait le plafond, mais lui répondait 200 ; les lots suivants recevaient 403 et le runner les
 * laissait ; seul le signe de vie suivant arrêtait Claude Code, et les actions permises passaient entre-temps sans trace.
 */

const WORK = process.platform === "win32" ? "C:\\work\\run-42" : "/work/run-42";
const event = (n: number): RunnerEvent => ({ kind: "tool", tool: "Bash", text: `step ${n}` });

describe("c-c : TaskForce arrête la mission par la réponse à ses événements", () => {
  it("la réponse au lot qui atteint le plafond porte la consigne d'arrêt, et le client la lit", async () => {
    const realFetch = globalThis.fetch;
    const answers = [{ stop: false }, { stop: true }];
    globalThis.fetch = (async (url: string | URL | Request) => {
      if (String(url).endsWith("/auth/runner/token")) {
        return new Response(JSON.stringify({ data: { accessToken: "t", expiresIn: 3600 } }), { status: 200 });
      }
      return new Response(JSON.stringify({ success: true, data: answers.shift() ?? null }), { status: 200 });
    }) as typeof fetch;
    try {
      const api = new TaskforceApi({ apiUrl: "http://tf.test/api", clientId: "c", clientSecret: "s" });
      assert.deepEqual(await api.events(7, [event(1)]), { stop: false });
      assert.deepEqual(await api.events(7, [event(2)]), { stop: true });
      // Un serveur plus ancien ne répond rien : pas d'arrêt.
      assert.deepEqual(await api.events(7, [event(3)]), { stop: false });
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("la consigne d'arrêt, ou un refus 403 des événements, arrête la mission au runner sans attendre le signe de vie", async () => {
    const stops: string[] = [];
    const capped = new EventRelay({ events: async () => ({ stop: true }) }, 7, { flushMs: 5, onStop: (why) => stops.push(why) });
    capped.push([event(1)]);
    await capped.flush();
    const closed = new EventRelay({ events: async () => { throw new ApiError(403, "Run not held by this runner"); } }, 7,
      { flushMs: 5, onStop: (why) => stops.push(why) });
    closed.push([event(1)]);
    await closed.flush();
    assert.deepEqual(stops, ["cap", "closed"]);
    assert.equal(closed.pending, 0, "a refused batch is left, the record marks the gap");
    // Une autre erreur n'arrête rien : le lot repartira.
    const busy = new EventRelay({ events: async () => { throw new ApiError(503, "busy"); } }, 7,
      { flushMs: 5, retryMs: 60_000, closeAttempts: 0, onStop: (why) => stops.push(why) });
    busy.push([event(1)]);
    await busy.flush();
    assert.deepEqual(stops, ["cap", "closed"]);
    assert.equal(busy.pending, 1);
    await busy.close();
  });

  it("dès l'arrêt, le hook refuse toute action, même une que les règles permettent, sans rien demander", async () => {
    const asked: string[] = [];
    const api: ApprovalApi = {
      requestApproval: async (_runId, tool) => {
        asked.push(tool);
        return { approvalId: 1, status: "ALLOWED", expiresAt: "", scope: "ONCE" } satisfies Approval;
      },
      approvalStatus: async (_runId, id) => ({ approvalId: id, status: "ALLOWED", expiresAt: "", scope: "ONCE" }),
    };
    const stop = new AbortController();
    const server = new ApprovalServer(api, 42, WORK, { waitMs: 200, pollMs: 5, stopped: stop.signal });
    await server.start();
    const call = async (path: string): Promise<Record<string, unknown>> => {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${server.token}` },
        body: JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Read", tool_input: { file_path: `${WORK}/README.md` } }),
      });
      return (await res.json()) as Record<string, unknown>;
    };
    try {
      stop.abort();
      const pre = (await call(server.preToolUseUrl)).hookSpecificOutput as { permissionDecision?: string; permissionDecisionReason?: string };
      assert.equal(pre.permissionDecision, "deny");
      assert.match(pre.permissionDecisionReason ?? "", /TaskForce stopped this mission/);
      const permission = await call(server.preToolUseUrl.replace("/pre-tool-use", "/permission"));
      assert.match(JSON.stringify(permission), /TaskForce stopped this mission/);
      assert.deepEqual(asked, []);
    } finally {
      await server.stop();
    }
  });
});
