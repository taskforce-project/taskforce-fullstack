import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { firstLine, isPersonalToken, isWorkspaceSlug, mcpServerName, mcpServerUrl, parseMcpUrl } from "../src/claude";

const TOKEN = "tfp_" + "a".repeat(43);

describe("isWorkspaceSlug", () => {
  const cases: [unknown, boolean][] = [
    ["acme", true],
    ["acme-team_2", true],
    ["", false],
    ["acme/other", false],
    ["acme team", false],
    ["a".repeat(101), false],
    [null, false],
  ];
  for (const [value, expected] of cases) {
    it(`${JSON.stringify(value)?.slice(0, 30)} -> ${expected}`, () => assert.equal(isWorkspaceSlug(value), expected));
  }
});

describe("isPersonalToken", () => {
  const cases: [unknown, boolean][] = [
    [TOKEN, true],
    ["tfp_short", false],
    ["tfd_" + "a".repeat(43), false],
    [TOKEN + " --scope project", false],
    [42, false],
  ];
  for (const [value, expected] of cases) {
    it(`${JSON.stringify(value)?.slice(0, 20)}... -> ${expected}`, () => assert.equal(isPersonalToken(value), expected));
  }
});

describe("MCP server of a workspace", () => {
  it("is named after the workspace in Claude Code", () => {
    assert.equal(mcpServerName("Acme"), "taskforce-acme");
  });

  it("lives behind the origin of the app window", () => {
    assert.equal(mcpServerUrl("http://127.0.0.1:61240/", "acme"), "http://127.0.0.1:61240/api/workspaces/acme/mcp");
  });
});

describe("parseMcpUrl", () => {
  it("reads the address and nothing else from claude mcp get", () => {
    const output = [
      "taskforce-acme:",
      "  Scope: User config (available in all your projects)",
      "  Status: ✓ Connected",
      "  Type: http",
      "  URL: http://127.0.0.1:61240/api/workspaces/acme/mcp",
      "  Headers:",
      `    Authorization: Bearer ${TOKEN}`,
    ].join("\n");
    assert.equal(parseMcpUrl(output), "http://127.0.0.1:61240/api/workspaces/acme/mcp");
  });

  it("returns null without an address", () => {
    assert.equal(parseMcpUrl("claude.ai Linear:\n  Scope: claude.ai config\n"), null);
  });
});

describe("firstLine", () => {
  it("keeps the first useful line, without the token", () => {
    assert.equal(firstLine(`\nInvalid header: Authorization: Bearer ${TOKEN}\nmore`), "Invalid header: Authorization: Bearer tfp_...");
  });

  it("returns null for an empty error", () => {
    assert.equal(firstLine("  \n"), null);
  });
});
