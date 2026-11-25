import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { agentEvent, launchEnv, managedSettingsDir, providerOf, providerUnread } from "../src/agent.js";

/**
 * R159 de #551, second tour, L-c : le fournisseur ne lisait que l'environnement du runner, pas les réglages que Claude
 * Code charge au lancement. Troisième tour, c-a : sous Windows, le fichier géré lu n'était pas celui que Claude Code
 * charge, et les fichiers de `managed-settings.d/` n'étaient pas lus (https://code.claude.com/docs/en/managed-settings).
 */

describe("L-c : le fournisseur se lit aussi dans les réglages que Claude Code charge au lancement", () => {
  it("l'env des réglages de l'utilisateur, puis ceux de l'organisation, l'emportent sur l'environnement du runner", () => {
    const home = mkdtempSync(join(tmpdir(), "tf-l-c-"));
    try {
      mkdirSync(join(home, ".claude"));
      writeFileSync(join(home, ".claude", "settings.json"), JSON.stringify({ env: { ANTHROPIC_BASE_URL: "http://localhost:4000" } }));
      const managed = join(home, "managed");
      mkdirSync(managed);
      assert.equal(providerOf(launchEnv({}, home, managed)), "another-endpoint");
      writeFileSync(join(managed, "managed-settings.json"), JSON.stringify({ env: { CLAUDE_CODE_USE_BEDROCK: "1" } }));
      assert.equal(providerOf(launchEnv({}, home, managed)), "amazon-bedrock");
      // CLAUDE_CONFIG_DIR désigne un autre dossier de réglages ; un fichier illisible ne compte pas.
      writeFileSync(join(home, "settings.json"), "{not json");
      assert.equal(providerOf(launchEnv({ CLAUDE_CONFIG_DIR: home }, home, join(home, "none"))), "anthropic");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

describe("c-a : les réglages gérés, là où Claude Code les lit, et ce que le dossier dit ne pas lire", () => {
  it("managed-settings.d : chaque *.json par ordre alphabétique après managed-settings.json, variable par variable", () => {
    const home = mkdtempSync(join(tmpdir(), "tf-c-a-"));
    try {
      const managed = join(home, "managed");
      mkdirSync(join(managed, "managed-settings.d"), { recursive: true });
      writeFileSync(join(managed, "managed-settings.json"), JSON.stringify({ env: { CLAUDE_CODE_USE_VERTEX: "1", ANTHROPIC_MODEL: "x" } }));
      // Le fichier d'après l'emporte sur une même variable ; les autres variables restent.
      writeFileSync(join(managed, "managed-settings.d", "20-gateway.json"), JSON.stringify({ env: { CLAUDE_CODE_USE_VERTEX: "0",
        ANTHROPIC_BASE_URL: "https://gateway.example.com" } }));
      writeFileSync(join(managed, "managed-settings.d", "10-bedrock.json"), JSON.stringify({ env: { CLAUDE_CODE_USE_BEDROCK: "0" } }));
      // Un fichier caché, ou qui n'est pas en .json, ne compte pas.
      writeFileSync(join(managed, "managed-settings.d", ".99-hidden.json"), JSON.stringify({ env: { CLAUDE_CODE_USE_BEDROCK: "1" } }));
      writeFileSync(join(managed, "managed-settings.d", "30-notes.txt"), JSON.stringify({ env: { CLAUDE_CODE_USE_BEDROCK: "1" } }));
      const env = launchEnv({}, home, managed);
      assert.equal(env.CLAUDE_CODE_USE_VERTEX, "0");
      assert.equal(env.CLAUDE_CODE_USE_BEDROCK, "0");
      assert.equal(env.ANTHROPIC_MODEL, "x");
      assert.equal(providerOf(env), "another-endpoint");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("sous Windows, C:\\Program Files\\ClaudeCode, jamais l'ancien chemin sous ProgramData ; macOS et Linux selon la même page", () => {
    assert.equal(managedSettingsDir("win32"), "C:\\Program Files\\ClaudeCode");
    assert.doesNotMatch(managedSettingsDir("win32"), /ProgramData/i);
    assert.equal(managedSettingsDir("darwin"), "/Library/Application Support/ClaudeCode");
    assert.equal(managedSettingsDir("linux"), "/etc/claude-code");
  });

  it("le dossier dit ce qui n'est pas lu : le registre ou le profil géré du système, et les réglages du serveur", () => {
    assert.deepEqual(providerUnread("win32"), ["windows-registry", "server-managed-settings"]);
    assert.deepEqual(providerUnread("darwin"), ["macos-managed-preferences", "server-managed-settings"]);
    assert.deepEqual(providerUnread("linux"), ["server-managed-settings"]);
    const event = agentEvent({ version: "2.1.300" }, ["claude-sonnet-5"], "anthropic");
    assert.equal(event.agent?.providerFrom, "launch-configuration");
    assert.deepEqual(event.agent?.providerUnread, providerUnread());
  });
});
