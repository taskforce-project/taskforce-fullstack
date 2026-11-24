import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { MAX_FACT, reportedFacts, type Approval, type Ruling } from "../src/api.js";
import { ApprovalServer, requestDecision, TOO_LONG_TO_ASK, type ApprovalApi } from "../src/approvals.js";
import type { Decision, Facts, Rule, RulesBundle } from "../src/harness/engine/rules-engine.js";

/**
 * R159 de #551, troisième tour, C1 : une demande d'accord ne part jamais sur un fait coupé. Une règle de l'entreprise
 * demande l'accord de la personne 42 pour toute commande qui vise `prod-db` ; l'agent place `prod-db` après le 4 000e
 * caractère d'une commande simple. Le runner juge la commande entière, mais le serveur rejugerait la demande sur le fait
 * coupé pour le dossier, qui ne dit plus `prod-db`. Sur `936ef711`, la demande partait ; elle ne part plus, et l'agent
 * apprend qu'il doit découper sa commande. Le dossier garde le refus, avec le fait coupé.
 */

const contract = <T>(path: string): T => JSON.parse(readFileSync(new URL(`../../contracts/${path}`, import.meta.url), "utf8")) as T;
const defaults = contract<RulesBundle>("rules/default.rules.json");
const WORK = process.platform === "win32" ? "C:\\work\\run-42" : "/work/run-42";

const prodDb: Rule = {
  id: "ws-prod-db", layer: "workspace", text: "A command on the production database needs the database administrator.",
  when: { action: "shell", command: "**prod-db**" }, class: "irreversible", effect: "ask", inverse: null,
  owner: "admin@example.com", reason: "A command on the production database needs the database administrator.",
  review: "2027-05-11", require: { approvers: ["person:42"] },
};
const rules: RulesBundle = { ...defaults, rules: [prodDb, ...defaults.rules] };

function fakeApi(): { api: ApprovalApi; asked: Ruling[] } {
  const asked: Ruling[] = [];
  return {
    asked,
    api: {
      requestApproval: async (_runId, _tool, _summary, _askedBy, ruling) => {
        asked.push(ruling ?? {});
        return { approvalId: asked.length, status: "PENDING", expiresAt: "" } satisfies Approval;
      },
      approvalStatus: async (_runId, id) => ({ approvalId: id, status: "ALLOWED", expiresAt: "", scope: "ONCE" }),
    },
  };
}

async function hook(server: ApprovalServer, command: string): Promise<{ permissionDecision?: string; permissionDecisionReason?: string }> {
  const res = await fetch(server.preToolUseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${server.token}` },
    body: JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command } }),
  });
  return ((await res.json()) as { hookSpecificOutput?: { permissionDecision?: string; permissionDecisionReason?: string } })
    .hookSpecificOutput ?? {};
}

describe("C1 : une demande d'accord ne part jamais sur un fait coupé", () => {
  const padded = `psql -v pad=${"a".repeat(4100)} -h prod-db -c "drop table ledger"`;

  it("une commande courte qui vise prod-db part en demande, avec la règle de l'entreprise", async () => {
    const { api, asked } = fakeApi();
    const server = new ApprovalServer(api, 42, WORK, { waitMs: 200, pollMs: 5, rules });
    await server.start();
    try {
      const out = await hook(server, 'psql -h prod-db -c "drop table ledger"');
      assert.equal(out.permissionDecision, "allow");
      assert.equal(asked.length, 1);
      assert.equal(asked[0]?.rule, "ws-prod-db");
    } finally {
      await server.stop();
    }
  });

  it("prod-db au-delà du 4 000e caractère : refusée sans rien demander, l'agent doit découper sa commande", async () => {
    assert.equal(padded.length, 4146);
    const { api, asked } = fakeApi();
    const decisions: Array<{ decision: Decision; facts: Facts[] }> = [];
    const server = new ApprovalServer(api, 42, WORK, { waitMs: 200, pollMs: 5, rules,
      onDecision: (_tool, decision, _input, facts) => decisions.push({ decision, facts }) });
    await server.start();
    try {
      const out = await hook(server, padded);
      assert.equal(out.permissionDecision, "deny");
      assert.match(out.permissionDecisionReason ?? "", /too long for TaskForce to have it approved/);
      assert.match(out.permissionDecisionReason ?? "", /Split it into shorter commands/);
      assert.equal(asked.length, 0, "no approval request leaves the runner");
    } finally {
      await server.stop();
    }
    // Le runner a jugé la commande entière (la règle de l'entreprise demande), puis l'a refusée sans demander.
    assert.deepEqual(decisions.map((d) => [d.decision.effect, d.decision.rule?.id]), [["ask", "ws-prod-db"], ["deny", TOO_LONG_TO_ASK]]);
    // Le dossier garde le fait coupé, marqué, dans la limite.
    const kept = reportedFacts(decisions[1]?.facts ?? [])[0]?.command ?? "";
    assert.ok(kept.length <= MAX_FACT, `${kept.length}`);
    assert.match(kept, /\n\[TaskForce cut this text here: 4146 characters in all\]$/);
  });

  it("aucune demande ne part sur un fait trop long, d'où qu'elle vienne", async () => {
    const { api, asked } = fakeApi();
    const approval = await requestDecision(api, 42, "Bash", padded.slice(0, 80), 50, 5, "agent",
      { action: "shell", rule: "ws-prod-db", facts: [{ action: "shell", tool: "Bash", command: padded, actor: "agent" }] });
    assert.equal(approval, null);
    assert.equal(asked.length, 0);
  });
});
