import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { chain, type Json } from "../src/harness/engine/rules-engine.js";
import { TEST_SETTING } from "../src/harness/verifier/dossier.js";
import { verifyEvidence } from "../src/harness/verify.js";
import { definitionFiles, scriptFiles, testDefinitions } from "../src/test-definitions.js";

/** Un dossier de deux événements : le départ, puis ces tests. */
function record(test: Record<string, Json>): string {
  const events = chain([
    { seq: 1, at: "2026-11-22T08:00:00.000Z", type: "mission.started", actor: { kind: "server", id: "taskforce" }, data: { mission: 1 } },
    { seq: 2, at: "2026-11-22T08:10:00.000Z", type: "test.result", actor: { kind: "runner", id: "r" }, data: { kind: "test", command: "npm test", passed: true, ...test } },
  ]);
  return JSON.stringify({ format: "taskforce-evidence/1", mission: { id: 1 }, events, root: events.at(-1)?.hash });
}

/**
 * R159 de #551, second tour, L-b : la définition des tests ne voyait que des noms de fichiers.
 */

describe("L-b : la définition des tests, ce que lancent les scripts et la liste regardée", () => {
  it("des fichiers de build et de test, ceux que c7e05efb voyait déjà et ceux qu'il ne voyait pas (mvnw, .mvn/, gradle/, *.config.json, vitest.workspace, *.mk), mais pas un test", () => {
    const changed = ["mvnw", ".mvn/wrapper/maven-wrapper.properties", "gradle/wrapper/gradle-wrapper.properties", "gradlew",
      "build.gradle.kts", "settings.gradle", "setup.cfg", "tox.ini", "pytest.ini", "tests/conftest.py", "noxfile.py",
      "jest.config.json", "vitest.config.mts", "vitest.workspace.ts", "playwright.config.ts", "Makefile", "build/rules.mk",
      "src/footer.test.ts"];
    assert.deepEqual(testDefinitions(changed, "npm test"), changed.filter((path) => path !== "src/footer.test.ts"));
  });

  it("le script qu'une commande de package.json lance, relatif à son dossier", () => {
    const scripts = scriptFiles("web/package.json", JSON.stringify({ scripts: { test: "node ../scripts/run-tests.mjs && vitest run", lint: "eslint ." } }));
    assert.deepEqual(scripts, ["scripts/run-tests.mjs"]);
    assert.deepEqual(testDefinitions(["scripts/run-tests.mjs", "src/a.ts"], "npm test", scripts), ["scripts/run-tests.mjs"]);
    assert.deepEqual(scriptFiles("package.json", "{not json"), []);
    assert.deepEqual(scriptFiles("package.json", JSON.stringify({ scripts: { test: "node ../../out.js" } })), []);
  });

  it("la liste de ce que le runner a regardé, changé ou non", () => {
    const files = ["package.json", "vitest.config.ts", "src/a.ts", "src/a.test.ts", "scripts/run-tests.mjs"];
    assert.deepEqual(definitionFiles(files, "npm test", ["scripts/run-tests.mjs"]), ["package.json", "vitest.config.ts", "scripts/run-tests.mjs"]);
  });
});

describe("L-b : le dossier dit ce que le runner a regardé, et le réglage de test du projet", () => {
  it("rien de changé : une liste, pas la preuve que les tests sont les mêmes", async () => {
    const verdict = await verifyEvidence(record({ definitions: ["package.json", "vitest.config.ts"] }));
    assert.ok(verdict.message.includes("[--] Event 2: none of these files, which define how the tests run, changed: package.json, "
      + "vitest.config.ts. It is the list TaskForce looks for, not a proof that the tests are the same."), verdict.message);
  });

  it("le réglage de test du projet, changé pendant la mission, se dit en mots", async () => {
    const verdict = await verifyEvidence(record({ definitionChanged: ["package.json", TEST_SETTING], definitions: ["package.json"] }));
    assert.ok(verdict.message.includes("[!!] Event 2: what defines how its tests run changed during the mission (package.json, "
      + "the project's test command in TaskForce)"), verdict.message);
    assert.doesNotMatch(verdict.message, /none of these files/);
  });
});
