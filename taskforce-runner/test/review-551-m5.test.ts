import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { testDefinitions } from "../src/test-definitions.js";

/**
 * R159 de #551, M5 : l'agent réécrit le script `test` de package.json dans sa branche, le runner enregistre « passed »,
 * et rien ne dit que les tests qui ont tourné sont ceux de l'agent.
 */

describe("M5. une branche qui change la définition de ses tests se note", () => {
  it("les fichiers qui disent comment les tests tournent, et ceux que la commande nomme", () => {
    const paths = ["src/app.ts", "package.json", "frontend/vitest.config.ts", "backend/pom.xml", "api/conftest.py",
      "scripts/test.sh", "README.md", "src/app.test.ts", "Makefile"];
    assert.deepEqual(testDefinitions(paths, "npm test && bash scripts/test.sh"),
      ["package.json", "frontend/vitest.config.ts", "backend/pom.xml", "api/conftest.py", "scripts/test.sh", "Makefile"]);
    assert.deepEqual(testDefinitions(["src/a.ts", "docs/x.md"], "npm test"), []);
    assert.deepEqual(testDefinitions(["tools/run-tests.ps1"], "pwsh ./tools/run-tests.ps1"), ["tools/run-tests.ps1"]);
  });

  it("la liste reste courte : au plus vingt chemins", () => {
    const many = Array.from({ length: 40 }, (_, i) => `pkg${i}/package.json`);
    assert.equal(testDefinitions(many, "npm test").length, 20);
  });
});
