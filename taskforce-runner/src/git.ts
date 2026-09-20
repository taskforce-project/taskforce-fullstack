import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import type { Claim } from "./api.js";
import type { RepoConfig } from "./config.js";
import { run, runOrThrow } from "./proc.js";

/** `WEB-12` + « Fix the footer links! » + run 42 -> `tf/web-12-fix-the-footer-links-r42`. */
export function branchName(issueKey: string, title: string, runId: number): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  const key = issueKey.toLowerCase().replace(/[^a-z0-9-]+/g, "");
  return `tf/${[key, slug].filter(Boolean).join("-")}-r${runId}`;
}

export interface Worktree {
  path: string;
  branch: string;
  base: string;
}

/**
 * Prépare un worktree isolé sur une branche neuve, tirée de `origin/<base>` à jour. Le checkout de
 * l'utilisateur n'est jamais modifié : ni sa branche courante, ni ses fichiers en cours.
 */
export async function prepareWorktree(repo: RepoConfig, claim: Claim, home: string): Promise<Worktree> {
  const branch = branchName(claim.issueKey, claim.title, claim.runId);
  const dir = join(home, "worktrees", `run-${claim.runId}`);
  mkdirSync(join(home, "worktrees"), { recursive: true });

  await runOrThrow("git", ["-C", repo.path, "rev-parse", "--is-inside-work-tree"]);
  await runOrThrow("git", ["-C", repo.path, "fetch", "origin", repo.baseBranch]);
  await runOrThrow("git", ["-C", repo.path, "worktree", "add", "-b", branch, dir, `origin/${repo.baseBranch}`]);
  return { path: dir, branch, base: `origin/${repo.baseBranch}` };
}

/** Commande `setup` de la configuration (ex. `npm ci`), lancée dans le worktree avant l'agent. */
export async function runSetup(worktree: Worktree, commands: string[]): Promise<void> {
  for (const command of commands) {
    const result = await run(command, [], { cwd: worktree.path, shell: true, timeoutMs: 15 * 60_000 });
    if (result.code !== 0) {
      throw new Error(`Commande de préparation en échec (« ${command} », code ${result.code})`);
    }
  }
}

/**
 * Valide ce que l'agent aurait laissé non commité, puis compte les commits de la branche. Un agent qui
 * oublie de commiter ne doit pas faire perdre son travail, ni produire une PR vide.
 */
export async function finalizeCommits(worktree: Worktree, claim: Claim): Promise<number> {
  const status = await runOrThrow("git", ["-C", worktree.path, "status", "--porcelain"]);
  if (status) {
    await runOrThrow("git", ["-C", worktree.path, "add", "-A"]);
    await runOrThrow("git", ["-C", worktree.path, "commit", "-m", `${claim.issueKey}: ${claim.title}`.slice(0, 200)]);
  }
  const count = await runOrThrow("git", ["-C", worktree.path, "rev-list", "--count", `${worktree.base}..HEAD`]);
  return Number.parseInt(count, 10) || 0;
}

export async function pushBranch(worktree: Worktree): Promise<void> {
  // Jamais de --force : la branche est neuve, un refus ici est un vrai problème à remonter.
  await runOrThrow("git", ["-C", worktree.path, "push", "-u", "origin", worktree.branch], { timeoutMs: 5 * 60_000 });
}

/** Ouvre la pull request avec `gh` et rend son URL. Aucune fusion : la revue reste humaine. */
export async function openPullRequest(
  worktree: Worktree, repo: RepoConfig, claim: Claim, summary: string, home: string,
): Promise<string> {
  const bodyFile = join(home, "tmp", `run-${claim.runId}-pr.md`);
  mkdirSync(join(home, "tmp"), { recursive: true });
  writeFileSync(bodyFile, pullRequestBody(claim, summary), "utf8");
  try {
    const out = await runOrThrow("gh", [
      "pr", "create",
      "--repo", claim.repoFullName ?? "",
      "--base", repo.baseBranch,
      "--head", worktree.branch,
      "--title", `${claim.issueKey}: ${claim.title}`.slice(0, 200),
      "--body-file", bodyFile,
    ], { cwd: worktree.path, timeoutMs: 2 * 60_000 });
    const url = out.split(/\r?\n/).map((l) => l.trim()).filter((l) => /^https?:\/\//.test(l)).pop();
    if (!url) throw new Error(`gh pr create n'a pas rendu d'URL : ${out.slice(-200)}`);
    return url;
  } finally {
    rmSync(bodyFile, { force: true });
  }
}

export function pullRequestBody(claim: Claim, summary: string): string {
  return [
    `## ${claim.issueKey}: ${claim.title}`,
    "",
    summary.trim(),
    "",
    "---",
    `Delegated from TaskForce (${claim.projectName}, run #${claim.runId}) and produced by a coding agent.`,
    "Review before merging: nothing is merged automatically.",
    "",
  ].join("\n");
}

export async function removeWorktree(repo: RepoConfig, worktree: Worktree): Promise<void> {
  await run("git", ["-C", repo.path, "worktree", "remove", "--force", worktree.path]);
}
