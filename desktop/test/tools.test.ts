import { strict as assert } from "node:assert";
import { win32 } from "node:path";
import { describe, it } from "node:test";

import { parseClaudeSignedIn, parseLogin, parseVersion, quoteForCmd, resolveCommand } from "../src/tools";

describe("resolveCommand", () => {
  const env = { PATH: ["C:\\npm", "C:\\gh"].join(";") };
  const onDisk = (...files: string[]) => (path: string) => files.includes(path);

  it("runs an .exe directly", () => {
    const gh = win32.join("C:\\gh", "gh.exe");
    assert.deepEqual(resolveCommand("gh", env, "win32", onDisk(gh)), { file: gh, viaCmd: false });
  });

  it("runs an npm launcher through cmd.exe", () => {
    const claude = win32.join("C:\\npm", "claude.cmd");
    assert.deepEqual(resolveCommand("claude", env, "win32", onDisk(claude)), { file: claude, viaCmd: true });
  });

  it("prefers the .exe when both exist", () => {
    const exe = win32.join("C:\\gh", "claude.exe");
    const cmd = win32.join("C:\\npm", "claude.cmd");
    assert.deepEqual(resolveCommand("claude", env, "win32", onDisk(cmd, exe)), { file: exe, viaCmd: false });
  });

  it("leaves a missing tool as it is, so that starting it fails with ENOENT", () => {
    assert.deepEqual(resolveCommand("git", env, "win32", onDisk()), { file: "git", viaCmd: false });
  });

  it("leaves the command alone outside Windows", () => {
    assert.deepEqual(resolveCommand("claude", env, "linux", onDisk()), { file: "claude", viaCmd: false });
  });
});

describe("quoteForCmd", () => {
  const cases: [string, string][] = [
    ["--version", "--version"],
    ["Authorization: Bearer tfp_abc", '"Authorization: Bearer tfp_abc"'],
    ["a&b", '"a&b"'],
    ['say "hi"', '"say ""hi"""'],
    ["", '""'],
  ];
  for (const [arg, quoted] of cases) {
    it(`protects ${JSON.stringify(arg)}`, () => assert.equal(quoteForCmd(arg), quoted));
  }

  for (const arg of ["%PATH%", "two\nlines"]) {
    it(`refuses ${JSON.stringify(arg)}, which cmd.exe would still interpret`, () => {
      assert.throws(() => quoteForCmd(arg), /refused/);
    });
  }
});

describe("parseVersion", () => {
  const cases: [string, string | null][] = [
    ["2.1.293 (Claude Code)\n", "2.1.293"],
    ["git version 2.54.0.windows.1\n", "2.54.0"],
    ["gh version 2.96.0 (2026-07-02)\nhttps://github.com/cli/cli/releases/tag/v2.96.0\n", "2.96.0"],
    ["command not found", null],
  ];
  for (const [output, version] of cases) {
    it(`reads ${JSON.stringify(output.split("\n")[0])}`, () => assert.equal(parseVersion(output), version));
  }
});

describe("parseClaudeSignedIn", () => {
  const cases: [string, string, boolean | null][] = [
    ["signed in", '{"loggedIn": true, "authMethod": "claude.ai", "email": "ada@example.com"}', true],
    ["signed out", '{"loggedIn": false}', false],
    ["an older Claude Code without the command", "error: unknown command 'auth'", null],
    ["an unexpected answer", '{"loggedIn": "yes"}', null],
  ];
  for (const [name, output, expected] of cases) {
    it(`reads ${name}`, () => assert.equal(parseClaudeSignedIn(output), expected));
  }
});

describe("parseLogin", () => {
  const cases: [string, string | null][] = [
    ["Miche1-Pierre\n", "Miche1-Pierre"],
    ["octocat", "octocat"],
    ["", null],
    ["not a login: error", null],
  ];
  for (const [output, login] of cases) {
    it(`reads ${JSON.stringify(output)}`, () => assert.equal(parseLogin(output), login));
  }
});
