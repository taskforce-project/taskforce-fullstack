import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { RunnerConfig } from "../src/config.js";
import type { ProcResult } from "../src/proc.js";
import { agentProblem, parseSignedIn, Readiness, type AgentProblem } from "../src/readiness.js";

const ok = (stdout: string): ProcResult => ({ code: 0, stdout, stderr: "", timedOut: false, aborted: false });

const config = (auth: "subscription" | "api-key"): RunnerConfig =>
  ({ agent: { command: "claude", auth } }) as unknown as RunnerConfig;

describe("parseSignedIn : la sortie JSON de claude auth status", () => {
  const cases: [string, boolean | null][] = [
    ['{"loggedIn": true, "authMethod": "claude.ai"}', true],
    ['{"loggedIn": false, "authMethod": "none"}\n', false],
    ['{"authMethod": "none"}', null],
    ["Not logged in", null],
    ["", null],
  ];
  for (const [stdout, expected] of cases) {
    it(`${JSON.stringify(stdout)} : ${expected}`, () => assert.equal(parseSignedIn(stdout), expected));
  }
});

describe("agentProblem : ce qui empêcherait la mission de partir", () => {
  const cases: [string, "subscription" | "api-key", ProcResult | null, string, AgentProblem | null][] = [
    ["prêt", "subscription", ok("2.1.312 (Claude Code)"), '{"loggedIn": true}', null],
    ["déconnecté (recette du 29/10)", "subscription", ok("2.1.312 (Claude Code)"), '{"loggedIn": false}', "claude-signed-out"],
    ["état illisible : on ne bloque pas", "subscription", ok("2.1.312 (Claude Code)"), "garbage", null],
    ["trop ancien", "subscription", ok("2.1.200 (Claude Code)"), '{"loggedIn": true}', "claude-outdated"],
    ["absent", "subscription", null, "", "claude-missing"],
    ["clé d'API : pas de connexion demandée", "api-key", ok("2.1.312 (Claude Code)"), '{"loggedIn": false}', null],
  ];
  for (const [label, auth, version, status, expected] of cases) {
    it(label, async () => {
      const calls: string[][] = [];
      const exec = async (_command: string, args: string[]): Promise<ProcResult> => {
        calls.push(args);
        if (args[0] === "--version") {
          if (!version) throw new Error("not found");
          return version;
        }
        return ok(status);
      };
      assert.equal(await agentProblem(config(auth), exec as never), expected);
      if (auth === "api-key") assert.ok(!calls.some((a) => a[0] === "auth"), "no sign-in check with an API key");
    });
  }
});

describe("Readiness : l'état lu une fois par minute au plus", () => {
  it("relit après le délai, ou tout de suite après invalidate", async () => {
    let now = 0;
    let reads = 0;
    const answers: (AgentProblem | null)[] = ["claude-signed-out", null, null];
    const readiness = new Readiness(async () => answers[reads++] ?? null, 60_000, () => now);

    assert.equal(await readiness.current(), "claude-signed-out");
    now = 30_000;
    assert.equal(await readiness.current(), "claude-signed-out", "within the minute, no new read");
    now = 60_000;
    assert.equal(await readiness.current(), null, "after the minute, read again");
    readiness.invalidate();
    await readiness.current();
    assert.equal(reads, 3);
  });
});
