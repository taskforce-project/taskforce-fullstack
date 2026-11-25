import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { agentEvent, providerOf, providerUnread, servedModel } from "../src/agent.js";

/**
 * R159 de #551, L5 : le fournisseur était écrit en dur (`anthropic`), même avec Bedrock ou une autre adresse d'API, et le
 * modèle venait de la ligne de démarrage, pas des réponses.
 */

describe("L5. le fournisseur de la configuration réelle, et le modèle réellement servi", () => {
  it("le fournisseur se lit dans l'environnement de l'agent, jamais écrit d'avance", () => {
    assert.equal(providerOf({}), "anthropic");
    assert.equal(providerOf({ CLAUDE_CODE_USE_BEDROCK: "1" }), "amazon-bedrock");
    assert.equal(providerOf({ CLAUDE_CODE_USE_VERTEX: "true" }), "google-vertex");
    assert.equal(providerOf({ ANTHROPIC_BASE_URL: "http://localhost:4000" }), "another-endpoint");
    assert.equal(providerOf({ ANTHROPIC_BASE_URL: "https://api.anthropic.com/" }), "anthropic");
    assert.equal(providerOf({ CLAUDE_CODE_USE_BEDROCK: "0" }), "anthropic");
  });

  it("le modèle servi se lit dans chaque réponse de l'agent, pas dans sa ligne de démarrage", () => {
    assert.equal(servedModel({ type: "assistant", message: { model: "claude-sonnet-5-20261001", content: [] } }), "claude-sonnet-5-20261001");
    assert.equal(servedModel({ type: "assistant", message: { model: "<synthetic>" } }), null);
    assert.equal(servedModel({ type: "system", subtype: "init", model: "claude-sonnet-5" }), null);
  });

  it("le dernier mot sur l'agent : le modèle servi, celui de la configuration, le fournisseur", () => {
    const event = agentEvent({ version: "2.1.300", model: "sonnet", session: "s-1" }, ["claude-sonnet-5-20261001", "claude-haiku-4-5"], "amazon-bedrock");
    assert.deepEqual(event.agent, { version: "2.1.300", model: "claude-sonnet-5-20261001", configured: "sonnet",
      served: ["claude-sonnet-5-20261001", "claude-haiku-4-5"], session: "s-1", provider: "amazon-bedrock",
      providerFrom: "launch-configuration", providerUnread: providerUnread() });
    assert.match(event.text, /claude-sonnet-5-20261001/);
    const unknown = agentEvent({ version: "2.1.300", model: "sonnet" }, [], "anthropic");
    assert.equal(unknown.agent?.model, "sonnet");
    assert.deepEqual(unknown.agent?.served, []);
  });
});
