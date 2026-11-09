import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { runAgent } from "../src/agent.js";
import type { Claim } from "../src/api.js";
import type { ApprovalApi } from "../src/approvals.js";
import { parseRunnerConfigFile, type RunnerConfig } from "../src/config.js";
import type { EventSink } from "../src/events.js";
import type { RulesBundle } from "../src/harness/engine/rules-engine.js";
import { run } from "../src/proc.js";

const RULES = JSON.parse(readFileSync(new URL("../../contracts/rules/default.rules.json", import.meta.url), "utf8")) as RulesBundle;

const claim: Claim = {
  runId: 7, issueId: 55, issueKey: "WEB-12", title: "Fix the footer", description: "wait-for-nothing",
  projectId: 12, projectName: "Website", workspaceSlug: "acme", repoFullName: "acme/website", model: null, sessionExpiresAt: "",
};

const api: ApprovalApi & EventSink = {
  requestApproval: async () => { throw new Error("no approval expected"); },
  approvalStatus: async () => { throw new Error("no approval expected"); },
  events: async () => undefined,
};

/** Un lanceur à la place de `claude` : un `.cmd` sous Windows, un script ailleurs, comme ce qu'installe npm. */
function launcher(dir: string): string {
  const script = fileURLToPath(new URL("./fixtures/conversation-agent.mjs", import.meta.url));
  if (process.platform === "win32") {
    const path = join(dir, "agent.cmd");
    writeFileSync(path, `@echo off\r\n"${process.execPath}" "${script}" %*\r\n`);
    return path;
  }
  const path = join(dir, "agent.sh");
  writeFileSync(path, `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`);
  chmodSync(path, 0o755);
  return path;
}

async function withAgent(body: (config: RunnerConfig, work: string) => Promise<void>): Promise<void> {
  const home = mkdtempSync(join(tmpdir(), "tf-conversation-"));
  try {
    const base = parseRunnerConfigFile({});
    await body({
      ...base, apiUrl: "http://localhost:1/api", clientId: "tf-runner-test", clientSecret: "s", home,
      agent: { ...base.agent, command: launcher(home), auth: "api-key" },
    }, home);
  } finally {
    rmSync(home, { recursive: true, force: true, maxRetries: 5 });
  }
}

const env = process.env;

describe("la conversation avec l'agent, par son vrai processus (R140)", () => {
  // `agent.auth: "api-key"` : le faux agent n'a besoin de rien, mais la configuration exige la variable.
  process.env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY ?? "test-key-not-used";

  it("le brief passe par l'entrée stream-json, l'entrée se ferme au résultat, l'écriture est signalée, la session revient", async () => {
    await withAgent(async (config, work) => {
      let writes = 0;
      const outcome = await runAgent(config, claim, work, "token", {
        mode: "repo", branch: "tf/web-12-r7", rules: RULES, onWrite: () => { writes++; },
      }, api);
      assert.equal(outcome.ok, true, outcome.text);
      assert.match(outcome.text, /resume=none; prompt=You are working on a task delegated/);
      assert.equal(writes, 1);
      assert.equal(outcome.sessionId, "22222222-2222-4222-8222-222222222222");
    });
  });

  it("une correction tapée pendant le travail arrive à l'agent, et le canal se referme à la fin", async () => {
    await withAgent(async (config, work) => {
      const told: boolean[] = [];
      let channel: ((text: string) => boolean) | null = null;
      const outcome = await runAgent(config, { ...claim, title: "wait-for-correction" }, work, "token", {
        mode: "repo", branch: "tf/web-12-r7", rules: RULES,
        onWrite: () => { told.push(channel?.("use tabs") ?? false); },
        onConversation: (tell) => { channel = tell; },
      }, api);
      assert.equal(outcome.ok, true, outcome.text);
      assert.deepEqual(told, [true]);
      assert.match(outcome.text, /heard=use tabs/);
      assert.equal(channel, null);
    });
  });

  it("une session qui n'existe plus sur ce poste : l'agent repart du brief, sans elle", async () => {
    await withAgent(async (config, work) => {
      const followUp = {
        parentRunId: 6, worktreeRun: 6, branch: "tf/web-12-r6", base: "a".repeat(40),
        sessionId: "11111111-1111-4111-8111-111111111111", pullRequestUrl: null,
        comments: [{ path: "a.ts", line: 3, side: "new" as const, text: "Rename this" }],
      };
      const outcome = await runAgent(config, { ...claim, followUp }, work, "token", { mode: "repo", branch: followUp.branch, rules: RULES }, api);
      assert.equal(outcome.ok, true, outcome.text);
      assert.match(outcome.text, /resume=none; prompt=The person who delegated WEB-12/);
    });
  });

  it("une session qui existe : l'agent la continue", async () => {
    await withAgent(async (config, work) => {
      const followUp = {
        parentRunId: 6, worktreeRun: 6, branch: "tf/web-12-r6", base: "a".repeat(40),
        sessionId: "33333333-3333-4333-8333-333333333333", pullRequestUrl: null,
        comments: [{ path: "a.ts", line: 3, side: "new" as const, text: "Rename this" }],
      };
      const outcome = await runAgent(config, { ...claim, followUp }, work, "token", { mode: "repo", branch: followUp.branch, rules: RULES }, api);
      assert.match(outcome.text, /resume=33333333-3333-4333-8333-333333333333/);
    });
  });
});

describe("la sortie d'un processus", () => {
  it("un caractère coupé entre deux morceaux de la sortie reste entier", async () => {
    // « é » (2 octets) écrit en deux morceaux séparés dans le temps.
    const split = "process.stdout.write(Buffer.from([0xc3])); setTimeout(() => process.stdout.write(Buffer.from([0xa9, 0x0a])), 100);";
    const result = await run(process.execPath, ["-e", split], { timeoutMs: 30_000 });
    assert.equal(result.stdout, "é\n");
  });
});

describe("l'entrée d'un processus qui travaille encore", () => {
  it("les écritures passent, et la fermeture termine le processus", async () => {
    const echo = "process.stdin.pipe(process.stdout);";
    let stdin: { write(text: string): boolean; end(): void } | null = null;
    const finished = run(process.execPath, ["-e", echo], { onStdin: (channel) => { stdin = channel; }, timeoutMs: 30_000 });
    assert.ok(stdin);
    const channel = stdin as { write(text: string): boolean; end(): void };
    assert.equal(channel.write("first\n"), true);
    assert.equal(channel.write("second\n"), true);
    channel.end();
    assert.equal(channel.write("too late\n"), false);
    channel.end(); // une seconde fermeture ne fait rien
    const result = await finished;
    assert.equal(result.code, 0);
    assert.equal(result.stdout, "first\nsecond\n");
  });
});
