import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { launchEnv, providerOf } from "../src/agent.js";

/**
 * R159 de #551, second tour, L-c : le fournisseur ne lisait que l'environnement du runner, pas les réglages que Claude
 * Code charge au lancement.
 */

describe("L-c : le fournisseur se lit aussi dans les réglages que Claude Code charge au lancement", () => {
  it("l'env des réglages de l'utilisateur, puis ceux de l'organisation, l'emportent sur l'environnement du runner", () => {
    const home = mkdtempSync(join(tmpdir(), "tf-l-c-"));
    try {
      mkdirSync(join(home, ".claude"));
      writeFileSync(join(home, ".claude", "settings.json"), JSON.stringify({ env: { ANTHROPIC_BASE_URL: "http://localhost:4000" } }));
      const managed = join(home, "managed-settings.json");
      assert.equal(providerOf(launchEnv({}, home, managed)), "another-endpoint");
      writeFileSync(managed, JSON.stringify({ env: { CLAUDE_CODE_USE_BEDROCK: "1" } }));
      assert.equal(providerOf(launchEnv({}, home, managed)), "amazon-bedrock");
      // CLAUDE_CONFIG_DIR désigne un autre dossier de réglages ; un fichier illisible ne compte pas.
      writeFileSync(join(home, "settings.json"), "{not json");
      assert.equal(providerOf(launchEnv({ CLAUDE_CONFIG_DIR: home }, home, join(home, "none.json"))), "anthropic");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
