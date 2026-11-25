import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { testDefinitions } from "../src/test-definitions.js";

/**
 * R159 de #551, troisième tour, c-i : ce que la liste L-b ne voyait pas encore, parmi les configurations d'essais. Les
 * fichiers de verrou, tsconfig.json, requirements*.txt et go.mod n'y entrent pas : ils changent trop souvent pour autre
 * chose, et le dossier dit déjà que c'est une liste.
 */

describe("c-i : les configurations d'essais qui manquaient à la liste", () => {
  it("Karma, Cypress (avant et depuis sa version 10), Jasmine et l'environnement des tests", () => {
    const changed = ["karma.conf.js", "web/karma.conf.ts", "cypress.json", "e2e/cypress.config.ts", "spec/support/jasmine.json",
      ".env.test", "api/.env.test.local"];
    assert.deepEqual(testDefinitions(changed, "npm test"), changed);
  });

  it("ni les fichiers de verrou, ni tsconfig.json, requirements.txt, go.mod ou un autre .env", () => {
    const changed = ["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "tsconfig.json", "requirements.txt", "requirements-dev.txt",
      "go.mod", ".env", ".env.local", ".env.testing-notes/readme.md", "src/karma.conf.notes.md"];
    assert.deepEqual(testDefinitions(changed, "npm test"), []);
  });
});
