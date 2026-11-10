import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";

import { AgentConversation, agentArgs, safeSession, userMessage } from "../src/agent.js";
import type { Claim, CommandResult, RunnerChanges, RunnerCommand } from "../src/api.js";
import { ChangeTracker, hunksOf, isSensitive, MAX_BODY, parseNumstat, repoChanges, scratchChanges, splitPatch, type ChangeSnapshot } from "../src/changes.js";
import { drainCommands, executeCorrection, executeRevert, LiveMissions } from "../src/commands.js";
import { parseRunnerConfigFile, type RepoConfig, type RunnerConfig } from "../src/config.js";
import {
  BranchGoneError, branchIsPushed, finalizeCommits, isCommitSha, isMissionBranch, isSafeRepoPath, prepareWorktree, removeWorktree,
  reopenWorktree, revertFile, worktreeDir,
} from "../src/git.js";
import { bundleDigest, type RulesBundle } from "../src/harness/engine/rules-engine.js";
import { buildFollowUpPrompt, buildPrompt, buildReplyPrompt, HANDOVER_TITLES } from "../src/prompt.js";
import { parseAgentOutput, WriteWatcher } from "../src/stream.js";

const claim: Claim = {
  runId: 7, issueId: 55, issueKey: "WEB-12", title: "Fix the footer", description: "The links 404.",
  projectId: 12, projectName: "Website", workspaceSlug: "acme", repoFullName: "acme/website", model: null, sessionExpiresAt: "",
};

const git = (dir: string, ...args: string[]): string => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" }).trim();

/** Un vrai dépôt : une origine nue, un clone, un premier commit sur `main`. */
function fixture(): { root: string; home: string; origin: string; repo: RepoConfig; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "tf-changes-"));
  const origin = join(root, "origin.git");
  const path = join(root, "repo");
  const home = join(root, "home");
  mkdirSync(home);
  execFileSync("git", ["init", "--bare", "-b", "main", origin]);
  execFileSync("git", ["clone", "--quiet", origin, path]);
  git(path, "config", "user.email", "tester@example.test");
  git(path, "config", "user.name", "Tester");
  git(path, "config", "core.autocrlf", "false");
  git(path, "checkout", "-q", "-b", "main");
  writeFileSync(join(path, "a.txt"), "one\ntwo\nthree\n");
  writeFileSync(join(path, "b.txt"), "alpha\nbeta\n");
  writeFileSync(join(path, "keep.txt"), "untouched\n");
  git(path, "add", "-A");
  git(path, "commit", "-q", "-m", "first");
  git(path, "push", "-q", "-u", "origin", "main");
  return {
    root, home, origin,
    repo: { path, baseBranch: "main", setup: [] },
    cleanup: () => rmSync(root, { recursive: true, force: true, maxRetries: 5 }),
  };
}

/** Ce qu'une mission a écrit : `a.txt` modifié, `b.txt` retiré, `c.txt` créé, un binaire. */
function agentWrites(dir: string): void {
  writeFileSync(join(dir, "a.txt"), "one\nTWO\nthree\nfour\n");
  unlinkSync(join(dir, "b.txt"));
  mkdirSync(join(dir, "src"));
  writeFileSync(join(dir, "src", "c.txt"), "new\nfile\n");
  writeFileSync(join(dir, "logo.png"), Buffer.from([0, 1, 2, 3, 0, 255]));
}

describe("le relevé des changements, sur un vrai dépôt git", () => {
  it("pendant le travail : les lignes de chaque fichier, ce que l'agent n'a pas commité compris, sans toucher à son index", async () => {
    const { home, repo, cleanup } = fixture();
    try {
      const wt = await prepareWorktree(repo, claim, home);
      agentWrites(wt.path);
      git(wt.path, "add", "a.txt"); // l'agent a préparé ce fichier : son index ne doit pas bouger
      const before = git(wt.path, "diff", "--cached", "--name-only");
      const snapshot = await repoChanges(wt.path, wt.baseSha, join(home, "tmp", "index"));
      assert.deepEqual(snapshot.files.map((f) => [f.path, f.status, f.added, f.removed, f.binary]), [
        ["a.txt", "modified", 2, 1, false],
        ["b.txt", "deleted", 0, 2, false],
        ["logo.png", "added", null, null, true],
        ["src/c.txt", "added", 2, 0, false],
      ]);
      assert.equal(snapshot.added, 4);
      assert.equal(snapshot.removed, 3);
      assert.equal(git(wt.path, "diff", "--cached", "--name-only"), before);
      assert.match(snapshot.files[0]?.body ?? "", /^@@ -1,3 \+1,4 @@\n one\n-two\n\+TWO\n three\n\+four$/);
      assert.equal(snapshot.files[2]?.body, null);
    } finally {
      cleanup();
    }
  });

  it("une fois commité : ce que les commits portent, pas ce qui traîne dans le dossier", async () => {
    const { home, repo, cleanup } = fixture();
    try {
      const wt = await prepareWorktree(repo, claim, home);
      agentWrites(wt.path);
      assert.equal(await finalizeCommits(wt, claim), 1);
      writeFileSync(join(wt.path, "coverage.txt"), "left by the tests\n");
      const snapshot = await repoChanges(wt.path, wt.baseSha);
      assert.deepEqual(snapshot.files.map((f) => f.path), ["a.txt", "b.txt", "logo.png", "src/c.txt"]);
    } finally {
      cleanup();
    }
  });

  it("un chemin avec espaces et accents, et un fichier ignoré qui ne compte pas", async () => {
    const { home, repo, cleanup } = fixture();
    try {
      const wt = await prepareWorktree(repo, claim, home);
      writeFileSync(join(wt.path, ".gitignore"), "ignored.log\n");
      writeFileSync(join(wt.path, "ignored.log"), "x\n");
      writeFileSync(join(wt.path, "été à la plage.txt"), "soleil\n");
      const snapshot = await repoChanges(wt.path, wt.baseSha, join(home, "tmp", "index"));
      assert.deepEqual(snapshot.files.map((f) => f.path), [".gitignore", "été à la plage.txt"]);
    } finally {
      cleanup();
    }
  });

  it("un fichier qui peut porter un secret : son compte part, son texte reste sur le poste", async () => {
    const { home, repo, cleanup } = fixture();
    try {
      const wt = await prepareWorktree(repo, claim, home);
      writeFileSync(join(wt.path, ".env"), "API_KEY=abc\n");
      const [env] = (await repoChanges(wt.path, wt.baseSha, join(home, "tmp", "index"))).files;
      assert.deepEqual([env?.withheld, env?.body, env?.added], [true, null, 1]);
      assert.doesNotMatch(JSON.stringify(env), /API_KEY/);
    } finally {
      cleanup();
    }
  });

  it("un diff trop long : le compte reste vrai, le texte est coupé à une fin de ligne", async () => {
    const { home, repo, cleanup } = fixture();
    try {
      const wt = await prepareWorktree(repo, claim, home);
      writeFileSync(join(wt.path, "big.txt"), `${"0123456789".repeat(10)}\n`.repeat(2_000));
      const [big] = (await repoChanges(wt.path, wt.baseSha, join(home, "tmp", "index"))).files;
      assert.equal(big?.added, 2_000);
      assert.equal(big?.truncated, true);
      assert.ok((big?.body?.length ?? 0) <= MAX_BODY);
      assert.ok(big?.body?.endsWith("0123456789"));
    } finally {
      cleanup();
    }
  });

  const numstat: Array<[string, string, ReturnType<typeof parseNumstat>]> = [
    ["des lignes", "12\t1\tsrc/a.ts\0", [{ path: "src/a.ts", added: 12, removed: 1 }]],
    ["un binaire", "-\t-\tlogo.png\0", [{ path: "logo.png", added: null, removed: null }]],
    ["un nom avec tabulation", "1\t0\ta\tb.txt\0", [{ path: "a\tb.txt", added: 1, removed: 0 }]],
    ["rien", "", []],
  ];
  for (const [label, text, expected] of numstat) it(`numstat : ${label}`, () => assert.deepEqual(parseNumstat(text), expected));

  it("couper le patch par fichier : un contenu qui ressemble à un en-tête n'en est pas un", () => {
    const patch = "diff --git a/a b/a\n--- a/a\n+++ b/a\n@@ -1 +1 @@\n-x\n+old\rdiff --git fake\n+diff --git inside\ndiff --git a/b b/b\n--- a/b\n+++ b/b\n@@ -1 +1 @@\n-y\n+z\n";
    const sections = splitPatch(patch);
    assert.equal(sections.length, 2);
    assert.match(sections[0] ?? "", /inside/);
    assert.equal(hunksOf(sections[1] ?? ""), "@@ -1 +1 @@\n-y\n+z");
  });

  const sensitive: Array<[string, boolean]> = [
    [".env", true], ["config/.env.local", true], [".env.production", true], [".env.example", false], [".env.sample", false],
    ["certs/server.pem", true], ["id_rsa", true], [".npmrc", true], ["secrets.yml", true], ["credentials.json", true],
    ["src/credentials-form.tsx", false], ["README.md", false],
  ];
  for (const [path, expected] of sensitive) it(`fichier sensible : ${path} -> ${expected}`, () => assert.equal(isSensitive(path), expected));
});

describe("un dossier jetable : les fichiers écrits, avec leur contenu", () => {
  it("chaque fichier se montre écrit, sans ce qui n'est pas son travail", () => {
    const dir = mkdtempSync(join(tmpdir(), "tf-scratch-"));
    try {
      writeFileSync(join(dir, "c1.md"), "# Plan\n\nLine\n");
      mkdirSync(join(dir, "notes"));
      writeFileSync(join(dir, "notes", "c2.md"), "last line without end");
      writeFileSync(join(dir, "image.bin"), Buffer.from([0, 0, 1]));
      mkdirSync(join(dir, ".claude"));
      writeFileSync(join(dir, ".claude", "x"), "tool\n");
      const snapshot: ChangeSnapshot = scratchChanges(dir);
      assert.equal(snapshot.mode, "scratch");
      assert.equal(snapshot.base, null);
      assert.deepEqual(snapshot.files.map((f) => [f.path, f.status, f.added, f.removed, f.binary]), [
        ["c1.md", "written", 3, 0, false],
        ["image.bin", "written", null, null, true],
        ["notes/c2.md", "written", 1, 0, false],
      ]);
      assert.equal(snapshot.files[0]?.body, "# Plan\n\nLine\n");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

/** Un relevé d'un fichier, dont on choisit l'empreinte. */
const one = (revision: string, body: string | null = "text"): ChangeSnapshot => ({
  mode: "repo", base: "abc", more: 0, added: 1, removed: 0,
  files: [{ path: "a.txt", status: "modified", added: 1, removed: 0, binary: false, truncated: false, withheld: false, revision, body }],
});

describe("le relevé en direct : après un silence, seulement ce qui a bougé", () => {
  const sink = () => {
    const sent: RunnerChanges[] = [];
    return { sent, changes: async (_runId: number, c: RunnerChanges) => { sent.push(c); } };
  };
  const quick = { quietMs: 5, maxWaitMs: 40 };

  it("plusieurs écritures de suite ne font qu'un envoi", async () => {
    const out = sink();
    let takes = 0;
    const tracker = new ChangeTracker(out, 7, () => { takes++; return one("r1"); }, quick);
    tracker.touch();
    tracker.touch();
    tracker.touch();
    await sleep(40);
    assert.equal(takes, 1);
    assert.equal(out.sent.length, 1);
    assert.equal(out.sent[0]?.final, false);
  });

  it("rien n'a bougé : rien ne part ; le texte déjà reçu ne repart pas, l'état final part toujours", async () => {
    const out = sink();
    const tracker = new ChangeTracker(out, 7, () => one("r1"), quick);
    await tracker.publish();
    await tracker.publish();
    await tracker.finish();
    assert.deepEqual(out.sent.map((c) => [c.final, c.files[0]?.body]), [[false, "text"], [true, undefined]]);
  });

  it("le fichier a changé : son nouveau texte part", async () => {
    const out = sink();
    let revision = "r1";
    const tracker = new ChangeTracker(out, 7, () => one(revision, `body ${revision}`), quick);
    await tracker.publish();
    revision = "r2";
    await tracker.publish();
    assert.deepEqual(out.sent.map((c) => c.files[0]?.body), ["body r1", "body r2"]);
  });

  it("un envoi qui échoue n'arrête rien, et le suivant renvoie tout", async () => {
    let fail = true;
    const received: RunnerChanges[] = [];
    const tracker = new ChangeTracker({ changes: async (_r, c) => { if (fail) throw new Error("down"); received.push(c); } }, 7, () => one("r1"), quick);
    await tracker.publish();
    fail = false;
    await tracker.publish();
    assert.equal(received[0]?.files[0]?.body, "text");
  });

  it("le plafond par mission : plus d'envoi en direct, l'état final passe", async () => {
    const out = sink();
    let n = 0;
    const tracker = new ChangeTracker(out, 7, () => one(`r${++n}`), { ...quick, maxSends: 2 });
    await tracker.publish();
    await tracker.publish();
    await tracker.publish();
    tracker.touch();
    await sleep(30);
    assert.equal(out.sent.length, 2);
    await tracker.finish();
    assert.equal(out.sent.length, 3);
    assert.equal(out.sent[2]?.final, true);
  });

  it("une erreur du relevé lui-même n'arrête rien", async () => {
    const out = sink();
    const tracker = new ChangeTracker(out, 7, () => { throw new Error("git is busy"); }, quick);
    await tracker.publish();
    assert.equal(out.sent.length, 0);
  });
});

describe("quand un outil a pu écrire", () => {
  it("à la fin d'un outil qui écrit, jamais à celle d'une lecture", () => {
    const watcher = new WriteWatcher();
    const use = (id: string, name: string) => ({ type: "assistant", message: { content: [{ type: "tool_use", id, name }] } });
    const done = (id: string) => ({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, content: "ok" }] } });
    assert.equal(watcher.wrote(use("1", "Read")), false);
    assert.equal(watcher.wrote(done("1")), false);
    assert.equal(watcher.wrote(use("2", "Edit")), false); // l'appel seul ne change rien encore
    assert.equal(watcher.wrote(done("2")), true);
    assert.equal(watcher.wrote(done("2")), false);
    assert.equal(watcher.wrote(null), false);
  });
});

describe("la conversation avec l'agent (R140)", () => {
  function channel(): { lines: string[]; ended: () => boolean; conversation: AgentConversation } {
    const lines: string[] = [];
    let ended = false;
    const conversation = new AgentConversation({ write: (t) => { if (ended) return false; lines.push(t); return true; }, end: () => { ended = true; } }, 20);
    return { lines, ended: () => ended, conversation };
  }
  const assistant = { type: "assistant", message: { content: [] } };
  const result = { type: "result", subtype: "success" };

  it("le brief part en première ligne, l'entrée se ferme au résultat", () => {
    const { lines, ended, conversation } = channel();
    conversation.start("the brief");
    assert.deepEqual(lines.map((l) => JSON.parse(l) as unknown), [{ type: "user", message: { role: "user", content: "the brief" } }]);
    conversation.heard(assistant);
    assert.equal(ended(), false);
    conversation.heard(result);
    assert.equal(ended(), true);
  });

  it("une correction lue par l'agent ne retarde pas la fin", () => {
    const { ended, conversation } = channel();
    assert.equal(conversation.tell("use tabs"), true);
    conversation.heard(assistant);
    conversation.heard(result);
    assert.equal(ended(), true);
  });

  it("une correction arrivée après son dernier mot : un dernier tour, qui finit par son résultat", () => {
    const { ended, conversation } = channel();
    conversation.tell("one more thing");
    conversation.heard(result);
    assert.equal(ended(), false);
    conversation.heard(assistant);
    conversation.heard(result);
    assert.equal(ended(), true);
  });

  it("sans nouvelle après ce résultat, l'entrée se ferme quand même", async () => {
    const { ended, conversation } = channel();
    conversation.tell("one more thing");
    conversation.heard(result);
    await sleep(50);
    assert.equal(ended(), true);
  });

  it("une fois l'agent parti, plus rien ne part", () => {
    const { conversation } = channel();
    conversation.heard(result);
    assert.equal(conversation.tell("too late"), false);
  });

  it("une ligne de l'entrée stream-json", () => {
    assert.equal(userMessage("a\nb"), '{"type":"user","message":{"role":"user","content":"a\\nb"}}\n');
  });
});

describe("reprendre une session de Claude Code", () => {
  const config = (): RunnerConfig => ({
    ...parseRunnerConfigFile({}), apiUrl: "http://x/api", clientId: "tf-runner-test", clientSecret: "s", home: "/tmp/tf",
  });

  it("le brief passe par l'entrée, la session n'est demandée que sur une reprise", () => {
    const fresh = agentArgs(config(), claim, "m", "s");
    assert.deepEqual(fresh.slice(fresh.indexOf("--input-format"), fresh.indexOf("--input-format") + 2), ["--input-format", "stream-json"]);
    assert.equal(fresh.includes("--resume"), false);
    const resumed = agentArgs(config(), claim, "m", "s", "79b0a053-7a97-4bc5-9b64-628da46559e3");
    assert.deepEqual(resumed.slice(-2), ["--resume", "79b0a053-7a97-4bc5-9b64-628da46559e3"]);
  });

  for (const bad of ["--dangerously-skip-permissions", "a b", "", null, undefined, "x".repeat(100)]) {
    it(`identifiant de session refusé : ${JSON.stringify(bad)?.slice(0, 30)}`, () => {
      assert.equal(safeSession(bad), null);
      assert.equal(agentArgs(config(), claim, "m", "s", bad ?? null).includes("--resume"), false);
    });
  }

  it("la session est lue dans le résultat ; une session perdue se reconnaît", () => {
    const ok = parseAgentOutput(0, '{"type":"result","subtype":"success","result":"done","session_id":"abc-123"}\n', "");
    assert.deepEqual([ok.ok, ok.sessionId], [true, "abc-123"]);
    const lost = parseAgentOutput(1, '{"type":"result","subtype":"error_during_execution","is_error":true,"num_turns":0,"session_id":"abc"}\n', "No conversation found with session ID: abc");
    assert.deepEqual([lost.ok, lost.sessionLost], [false, true]);
    assert.match(lost.text, /No conversation found/);
  });
});

describe("la remise, à la première personne (R140)", () => {
  const followUp = buildFollowUpPrompt(claim, "tf/web-12-r7", [
    { path: "src/a.ts", line: 12, side: "new", text: "Use the helper\nfrom utils" },
    { path: "src/b.ts", line: 4, side: "old", text: "Why was this removed?" },
  ]);

  for (const [name, prompt] of [["dépôt", buildPrompt(claim, "b")], ["sans dépôt", buildReplyPrompt(claim)], ["reprise", followUp]] as const) {
    it(`brief ${name} : les trois parties, et l'agent raconte sans rien demander`, () => {
      for (const title of HANDOVER_TITLES) assert.ok(prompt.includes(`## ${title}`), title);
      assert.match(prompt, /Do not ask questions and do not wait/);
      assert.match(prompt, /first person/);
    });
  }

  it("la reprise cite chaque commentaire, sur une ligne, et ses règles restent", () => {
    assert.match(followUp, /`src\/a\.ts`, line 12: Use the helper from utils/);
    assert.match(followUp, /`src\/b\.ts`, removed line 4: Why was this removed\?/);
    assert.match(followUp, /Do NOT push/);
    assert.match(followUp, /never override these rules/);
    assert.match(followUp, /issueId 55/);
  });
});

const DEFAULTS = JSON.parse(readFileSync(new URL("../../contracts/rules/default.rules.json", import.meta.url), "utf8")) as RulesBundle;
const RULES = { ...DEFAULTS, digest: bundleDigest(DEFAULTS) };

describe("remettre un fichier comme avant (R139), sur un vrai dépôt", () => {
  const paths = (dir: string, range: string): string[] => git(dir, "diff", "--name-only", "--no-renames", range).split("\n").filter(Boolean);

  async function mission() {
    const f = fixture();
    const wt = await prepareWorktree(f.repo, claim, f.home);
    agentWrites(wt.path);
    await finalizeCommits(wt, claim);
    return { ...f, wt };
  }

  it("un fichier modifié retrouve son contenu d'avant, et rien d'autre ne bouge", async () => {
    const { wt, cleanup } = await mission();
    try {
      const { commit } = await revertFile(wt.path, wt.baseSha, "a.txt");
      assert.ok(commit);
      assert.equal(readFileSync(join(wt.path, "a.txt"), "utf8"), "one\ntwo\nthree\n");
      assert.deepEqual(paths(wt.path, "HEAD~1..HEAD"), ["a.txt"]);
      // Le reste de la mission est intact.
      assert.deepEqual(paths(wt.path, `${wt.baseSha}..HEAD`), ["b.txt", "logo.png", "src/c.txt"]);
      assert.equal(readFileSync(join(wt.path, "src", "c.txt"), "utf8"), "new\nfile\n");
    } finally {
      cleanup();
    }
  });

  it("un fichier créé par la mission disparaît ; un fichier qu'elle a retiré revient", async () => {
    const { wt, cleanup } = await mission();
    try {
      await revertFile(wt.path, wt.baseSha, "src/c.txt");
      assert.equal(existsSync(join(wt.path, "src", "c.txt")), false);
      await revertFile(wt.path, wt.baseSha, "b.txt");
      assert.equal(readFileSync(join(wt.path, "b.txt"), "utf8"), "alpha\nbeta\n");
      assert.deepEqual(paths(wt.path, `${wt.baseSha}..HEAD`), ["a.txt", "logo.png"]);
    } finally {
      cleanup();
    }
  });

  it("un fichier déjà comme avant : pas de commit", async () => {
    const { wt, cleanup } = await mission();
    try {
      const head = git(wt.path, "rev-parse", "HEAD");
      assert.equal((await revertFile(wt.path, wt.baseSha, "keep.txt")).commit, null);
      assert.equal(git(wt.path, "rev-parse", "HEAD"), head);
    } finally {
      cleanup();
    }
  });

  it("ce qui traîne ailleurs dans le dossier n'entre pas dans le commit", async () => {
    const { wt, cleanup } = await mission();
    try {
      writeFileSync(join(wt.path, "keep.txt"), "changed but not committed\n");
      git(wt.path, "add", "keep.txt");
      await revertFile(wt.path, wt.baseSha, "a.txt");
      assert.deepEqual(paths(wt.path, "HEAD~1..HEAD"), ["a.txt"]);
    } finally {
      cleanup();
    }
  });

  const unsafe: unknown[] = ["", "/etc/passwd", "C:/Windows/x", "../outside", "a/../../b", ".git/config", ".GIT/hooks/x", "a\\b", "a\0b", null, 12, "./a", "a//b"];
  for (const path of unsafe) {
    it(`chemin refusé avant toute commande : ${JSON.stringify(path)}`, () => assert.equal(isSafeRepoPath(path), false));
  }
  for (const path of ["a.txt", "src/deep/c.ts", ".github/workflows/ci.yml", "été à la plage.txt", "-dash.txt"]) {
    it(`chemin accepté : ${path}`, () => assert.equal(isSafeRepoPath(path), true));
  }
  it("branche et commit : seulement la forme que le runner écrit", () => {
    assert.equal(isMissionBranch("tf/web-12-fix-r7"), true);
    for (const bad of ["main", "tf/../x", "tf/a b", "--upload-pack=x", null]) assert.equal(isMissionBranch(bad), false);
    assert.equal(isCommitSha("a".repeat(40)), true);
    for (const bad of ["HEAD", "abc", `${"a".repeat(40)};x`, null]) assert.equal(isCommitSha(bad), false);
  });

  /** L'ordre tel que TaskForce le donne, pour la mission de `mission()`. */
  const command = (branch: string, base: string, path = "a.txt"): RunnerCommand => ({
    commandId: 1, runId: 7, kind: "REVERT_FILE", path, branch, base, worktreeRun: 7, repoFullName: "acme/website", rules: RULES,
  });
  const cfg = (home: string) => ({ home, repos: {}, autoClone: false, keepWorktree: false });

  it("l'ordre complet, après la fin de la mission : dossier rouvert, commit, poussé, nouveau relevé, dossier retiré", async () => {
    const { wt, home, repo, origin, cleanup } = await mission();
    try {
      git(wt.path, "push", "-q", "-u", "origin", wt.branch);
      await removeWorktree(repo, wt);
      assert.equal(existsSync(wt.path), false);
      const result = await executeRevert(cfg(home), command(wt.branch, wt.baseSha), { repoFor: async () => repo, visibilityOf: async () => "private" });
      assert.equal(result.ok, true, result.message);
      assert.equal(result.pushed, true);
      assert.equal(result.commits, 2);
      assert.deepEqual(result.changes?.files.map((f) => f.path), ["b.txt", "logo.png", "src/c.txt"]);
      assert.equal(result.changes?.final, true);
      assert.deepEqual(result.trace?.map((t) => `${t.action} ${t.effect} ${t.rule}`), [
        "file.write allow write-sandbox-files", "git.commit allow commit-locally", "git.push allow push-agent-branch-private",
      ]);
      assert.equal(existsSync(wt.path), false);
      // Sur l'origine aussi, et seulement ce fichier.
      assert.equal(git(origin, "rev-parse", `refs/heads/${wt.branch}`), result.commit);
      assert.equal(git(origin, "show", `${result.commit}:a.txt`), "one\ntwo\nthree");
      assert.equal(git(origin, "show", "--name-only", "--format=", result.commit ?? ""), "a.txt");
    } finally {
      cleanup();
    }
  });

  it("une branche jamais poussée : le retour reste sur le poste", async () => {
    const { wt, home, repo, origin, cleanup } = await mission();
    try {
      await removeWorktree(repo, wt);
      const result = await executeRevert(cfg(home), command(wt.branch, wt.baseSha), { repoFor: async () => repo, visibilityOf: async () => "private" });
      assert.equal(result.ok, true, result.message);
      assert.equal(result.pushed, false);
      assert.throws(() => git(origin, "rev-parse", "--verify", `refs/heads/${wt.branch}`));
    } finally {
      cleanup();
    }
  });

  it("les règles ne permettent pas de mettre à jour la branche : rien ne bouge, nulle part, et la phrase le dit", async () => {
    const { wt, home, repo, origin, cleanup } = await mission();
    try {
      git(wt.path, "push", "-q", "-u", "origin", wt.branch);
      const head = git(wt.path, "rev-parse", "HEAD");
      const result = await executeRevert(cfg(home), command(wt.branch, wt.baseSha), { repoFor: async () => repo, visibilityOf: async () => "public" });
      assert.equal(result.ok, false);
      assert.match(result.message, /couldn't be updated/);
      assert.deepEqual(result.trace?.at(-1), { action: "git.push", effect: "ask", rule: "push-public-repo" });
      assert.equal(git(wt.path, "rev-parse", "HEAD"), head);
      assert.equal(git(origin, "rev-parse", `refs/heads/${wt.branch}`), head);
      assert.equal(readFileSync(join(wt.path, "a.txt"), "utf8"), "one\nTWO\nthree\nfour\n");
    } finally {
      cleanup();
    }
  });

  it("une branche disparue partout : l'ordre le dit, pour que l'action s'efface", async () => {
    const { home, repo, cleanup, wt } = await mission();
    try {
      await removeWorktree(repo, wt);
      git(repo.path, "branch", "-D", wt.branch);
      const result = await executeRevert(cfg(home), command(wt.branch, wt.baseSha), { repoFor: async () => repo, visibilityOf: async () => "private" });
      assert.deepEqual([result.ok, result.gone], [false, true]);
      assert.match(result.message, /no longer on this computer/);
    } finally {
      cleanup();
    }
  });

  it("un paquet de règles qui ne tient pas : rien ne bouge", async () => {
    const { wt, home, repo, cleanup } = await mission();
    try {
      const head = git(wt.path, "rev-parse", "HEAD");
      const result = await executeRevert(cfg(home), { ...command(wt.branch, wt.baseSha), rules: { ...RULES, digest: `sha256:${"0".repeat(64)}` } }, { repoFor: async () => repo, visibilityOf: async () => "private" });
      assert.equal(result.ok, false);
      assert.equal(git(wt.path, "rev-parse", "HEAD"), head);
      // Une phrase pour la personne, le mot technique pour le dossier (R133).
      assert.doesNotMatch(result.message, /digest/);
      assert.match(result.detail ?? "", /digest/);
    } finally {
      cleanup();
    }
  });
});

describe("reprendre la branche d'une mission (R139)", () => {
  it("après le retrait du dossier : au même endroit, sur la même branche, avec ses commits", async () => {
    const { home, repo, cleanup } = fixture();
    try {
      const wt = await prepareWorktree(repo, claim, home);
      agentWrites(wt.path);
      await finalizeCommits(wt, claim);
      const head = git(wt.path, "rev-parse", "HEAD");
      await removeWorktree(repo, wt);
      const again = await reopenWorktree(repo, 7, wt.branch, wt.baseSha, home);
      assert.equal(again.path, worktreeDir(home, 7));
      assert.equal(git(again.path, "rev-parse", "HEAD"), head);
      assert.equal(git(again.path, "branch", "--show-current"), wt.branch);
      assert.deepEqual([again.base, again.baseSha], [wt.baseSha, wt.baseSha]);
      assert.equal(await finalizeCommits(again, claim), 1);
    } finally {
      cleanup();
    }
  });

  it("un dossier encore là est réutilisé tel quel", async () => {
    const { home, repo, cleanup } = fixture();
    try {
      const wt = await prepareWorktree(repo, claim, home);
      writeFileSync(join(wt.path, "wip.txt"), "still here\n");
      const again = await reopenWorktree(repo, 7, wt.branch, wt.baseSha, home);
      assert.equal(existsSync(join(again.path, "wip.txt")), true);
    } finally {
      cleanup();
    }
  });

  it("une branche absente du poste se relit sur l'origine", async () => {
    const { home, repo, cleanup } = fixture();
    try {
      const wt = await prepareWorktree(repo, claim, home);
      agentWrites(wt.path);
      await finalizeCommits(wt, claim);
      git(wt.path, "push", "-q", "-u", "origin", wt.branch);
      assert.equal(await branchIsPushed(wt, repo), true);
      const head = git(wt.path, "rev-parse", "HEAD");
      await removeWorktree(repo, wt);
      git(repo.path, "branch", "-D", wt.branch);
      const again = await reopenWorktree(repo, 7, wt.branch, wt.baseSha, home);
      assert.equal(git(again.path, "rev-parse", "HEAD"), head);
    } finally {
      cleanup();
    }
  });

  for (const bad of [0, -1, 1.5, Number.NaN, "7/../.." as unknown as number]) {
    it(`numéro de mission refusé pour un dossier : ${String(bad)}`, () => assert.throws(() => worktreeDir("/tmp/h", bad), /Not a mission number/));
  }

  it("nulle part : une erreur qui se reconnaît", async () => {
    const { home, repo, cleanup } = fixture();
    try {
      await assert.rejects(reopenWorktree(repo, 9, "tf/nothing-r9", "a".repeat(40), home), BranchGoneError);
    } finally {
      cleanup();
    }
  });

  it("une branche ou une base qui n'ont pas la forme du runner : refusées", async () => {
    const { home, repo, cleanup } = fixture();
    try {
      await assert.rejects(reopenWorktree(repo, 9, "main", "a".repeat(40), home), /Not a mission branch/);
      await assert.rejects(reopenWorktree(repo, 9, "tf/x-r9", "HEAD", home), /no known starting point/);
    } finally {
      cleanup();
    }
  });
});

describe("les ordres de TaskForce", () => {
  const order = (commandId: number, kind: RunnerCommand["kind"] = "CORRECTION", text = "use tabs"): RunnerCommand => ({ commandId, runId: 7, kind, text });

  it("une correction part vers l'agent de cette mission", () => {
    const live = new LiveMissions();
    const told: string[] = [];
    live.attach(7, (text) => { told.push(text); return true; });
    assert.equal(executeCorrection(live, order(1)).ok, true);
    assert.match(told[0] ?? "", /A correction from the person who delegated this task, while you work: use tabs/);
  });

  it("l'agent a fini : la correction le dit", () => {
    const live = new LiveMissions();
    const result = executeCorrection(live, order(1));
    assert.equal(result.ok, false);
    assert.match(result.message, /already finished/);
    live.attach(7, () => true);
    live.detach(7);
    assert.equal(live.tell(7, "x"), false);
  });

  it("une correction vide n'est pas envoyée", () => {
    const live = new LiveMissions();
    live.attach(7, () => { throw new Error("must not be told"); });
    assert.equal(executeCorrection(live, order(1, "CORRECTION", "   ")).ok, false);
  });

  it("chaque ordre a sa réponse, même après l'échec d'un autre", async () => {
    const results: Array<[number, CommandResult]> = [];
    const count = await drainCommands({
      commands: async () => [order(1), order(2), order(3)],
      commandResult: async (id, result) => { results.push([id, result]); if (id === 2) throw new Error("down"); },
    }, async (command) => {
      if (command.commandId === 1) throw new Error("boom");
      return { ok: true, message: "done" };
    });
    assert.equal(count, 3);
    assert.deepEqual(results.map(([id, r]) => [id, r.ok]), [[1, false], [2, true], [3, true]]);
    // Le mot technique va au dossier, la personne lit une phrase (R133).
    assert.equal(results[0]?.[1].detail, "boom");
    assert.doesNotMatch(results[0]?.[1].message ?? "", /boom/);
  });
});
