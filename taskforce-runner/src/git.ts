import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import type { Claim } from "./api.js";
import type { RepoConfig } from "./config.js";
import { run, runOrThrow } from "./proc.js";

/** `WEB-12` + « Fix the footer links! » + run 42 -> `tf/web-12-fix-the-footer-links-r42`. */
export function branchName(issueKey: string, title: string, runId: number): string {
  const slug = title
    .normalize("NFKD")
    .replace(/\p{M}/gu, "") // marques combinantes : « é » décomposé -> « e »
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
  /** Le commit exact d'où part la mission : `origin/<base>` peut avancer pendant qu'elle travaille. */
  baseSha: string;
}

/**
 * `owner/name` tel que GitHub l'accepte. Le nom vient de TaskForce (le dépôt lié au projet) et devient un
 * chemin sur le disque puis un argument de commande : on n'accepte que la forme stricte, sans « .. ».
 */
export function isValidRepoFullName(fullName: string | null | undefined): fullName is string {
  return typeof fullName === "string"
    && /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/.test(fullName)
    && !fullName.includes("..");
}

/** Dossier du clone géré par le runner : `<home>/repos/<owner>/<name>` (en minuscules, comme la config). */
export function managedCheckoutDir(home: string, fullName: string): string {
  const [owner = "", name = ""] = fullName.toLowerCase().split("/");
  return join(home, "repos", owner, name);
}

/** `origin/main` -> `main`. Branche par défaut du dépôt, telle que le clone la connaît. */
async function defaultBranch(path: string): Promise<string> {
  const head = await run("git", ["-C", path, "symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);
  const branch = head.code === 0 ? head.stdout.trim().replace(/^origin\//, "") : "";
  return /^[\w./-]+$/.test(branch) ? branch : "main";
}

/**
 * Le dépôt où travailler pour une tâche : l'entrée de `repos` si la personne en a déclaré une, sinon un
 * clone que le runner gère lui-même. Dans ce second cas il n'y a <b>rien à configurer</b> : le projet et
 * son dépôt se créent dans TaskForce, le runner clone à la première tâche avec le `gh` de la personne (donc
 * ses droits GitHub, dépôts privés compris), puis réutilise ce clone.
 */
export async function resolveRepo(
  repos: Record<string, RepoConfig>, autoClone: boolean, home: string, fullName: string,
): Promise<RepoConfig> {
  if (!isValidRepoFullName(fullName)) {
    throw new Error(`The repository linked to this project is not a valid GitHub "owner/name": ${String(fullName).slice(0, 80)}`);
  }
  const declared = repos[fullName.toLowerCase()];
  if (declared) return declared;
  if (!autoClone) {
    throw new Error(`No local checkout is configured for ${fullName} on this runner (runner.config.json > repos), and autoClone is off.`);
  }

  const path = managedCheckoutDir(home, fullName);
  if (!existsSync(join(path, ".git"))) {
    mkdirSync(join(path, ".."), { recursive: true });
    await runOrThrow("gh", ["repo", "clone", fullName, path], { timeoutMs: 10 * 60_000 });
  }
  return { path, baseBranch: await defaultBranch(path), setup: [], managed: true };
}

/**
 * Clone géré par le runner : fetch et push passent par les identifiants de GitHub CLI, comme le clone et la pull
 * request. Sinon git les demanderait à un autre gestionnaire, qui peut ouvrir une fenêtre en pleine tâche. La
 * configuration git de la personne n'est pas modifiée : ces réglages ne valent que pour la commande. La valeur vide
 * écarte d'abord les gestionnaires configurés pour github.com, comme `gh auth setup-git`. Le checkout d'un dépôt
 * déclaré garde la configuration de la personne.
 */
export function ghCredentialArgs(repo: RepoConfig): string[] {
  return repo.managed
    ? ["-c", "credential.https://github.com.helper=", "-c", "credential.https://github.com.helper=!gh auth git-credential"]
    : [];
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
  await runOrThrow("git", [...ghCredentialArgs(repo), "-C", repo.path, "fetch", "origin", repo.baseBranch]);
  await runOrThrow("git", ["-C", repo.path, "worktree", "add", "-b", branch, dir, `origin/${repo.baseBranch}`]);
  const baseSha = await runOrThrow("git", ["-C", dir, "rev-parse", "HEAD"]);
  return { path: dir, branch, base: `origin/${repo.baseBranch}`, baseSha };
}

/** La branche d'une mission n'existe plus, ni sur ce poste, ni sur GitHub : rien à reprendre, rien à remettre. */
export class BranchGoneError extends Error {}

/** Branche et commit tels que le runner les a écrits : ce sont des arguments de git, venus du serveur. */
export function isMissionBranch(branch: unknown): branch is string {
  return typeof branch === "string" && /^tf\/[a-z0-9-]{1,200}$/.test(branch);
}

export function isCommitSha(sha: unknown): sha is string {
  return typeof sha === "string" && /^[0-9a-f]{40,64}$/.test(sha);
}

/** Le dossier de travail d'une mission : une reprise revient au même, Claude Code range ses sessions par dossier. */
export function worktreeDir(home: string, runId: number): string {
  if (!Number.isSafeInteger(runId) || runId <= 0) throw new Error("Not a mission number.");
  return join(home, "worktrees", `run-${runId}`);
}

/** Rend le worktree sur la branche demandée, ou lève {@link BranchGoneError}. Rend aussi s'il vient d'être créé. */
async function openBranch(repo: RepoConfig, dir: string, branch: string): Promise<boolean> {
  if (existsSync(join(dir, ".git"))) {
    const current = await run("git", ["-C", dir, "branch", "--show-current"]);
    if (current.code === 0 && current.stdout.trim() === branch) return false;
    throw new Error(`The folder of this mission is on another branch: ${dir}`);
  }
  // Une entrée d'un dossier supprimé à la main bloquerait `worktree add`.
  await run("git", ["-C", repo.path, "worktree", "prune"]);
  const local = await run("git", ["-C", repo.path, "show-ref", "--verify", "--quiet", `refs/heads/${branch}`]);
  // Sans --force : une branche locale en avance (jamais poussée) garde son travail, le fetch la laisse.
  const fetched = await run("git", [...ghCredentialArgs(repo), "-C", repo.path, "fetch", "origin", `refs/heads/${branch}:refs/heads/${branch}`], { timeoutMs: 5 * 60_000 });
  if (local.code !== 0 && fetched.code !== 0) {
    throw new BranchGoneError(`The branch ${branch} is neither on this computer nor on GitHub any more.`);
  }
  mkdirSync(join(dir, ".."), { recursive: true });
  rmSync(dir, { recursive: true, force: true });
  await runOrThrow("git", ["-C", repo.path, "worktree", "add", dir, branch]);
  return true;
}

/**
 * Revient sur la branche d'une mission finie, pour une reprise (R139) : au même dossier, sinon Claude Code ne retrouve pas
 * sa session. Le worktree a été retiré à la fin de la mission : la branche, elle, est restée (ou se relit sur GitHub).
 */
export async function reopenWorktree(repo: RepoConfig, worktreeRun: number, branch: string, baseSha: string, home: string): Promise<Worktree> {
  if (!isMissionBranch(branch)) throw new Error(`Not a mission branch: ${String(branch).slice(0, 80)}`);
  if (!isCommitSha(baseSha)) throw new Error("The mission has no known starting point.");
  const dir = worktreeDir(home, worktreeRun);
  await openBranch(repo, dir, branch);
  return { path: dir, branch, base: baseSha, baseSha };
}

/**
 * Un chemin que TaskForce demande de remettre : relatif au dépôt, sans remonter, hors de `.git`. Il vient du serveur et
 * devient un argument de git (derrière `--`, jamais une option).
 */
export function isSafeRepoPath(path: unknown): path is string {
  if (typeof path !== "string" || !path || path.length > 1000 || path.includes("\0") || path.includes("\\")) return false;
  if (path.startsWith("/") || /^[a-zA-Z]:/.test(path)) return false;
  const parts = path.split("/");
  return parts.every((part) => part !== "" && part !== "." && part !== "..") && parts[0]?.toLowerCase() !== ".git";
}

export interface RevertOutcome {
  /** Le commit du retour en arrière ; null si le fichier était déjà comme avant. */
  commit: string | null;
}

/**
 * Remet un fichier dans son état d'avant la mission (R139), sur la branche de la mission, et rien d'autre : un commit qui
 * ne porte que ce chemin. Un fichier créé par la mission est retiré ; un fichier qu'elle a retiré revient. `--no-verify` :
 * un retour à l'état d'avant n'a rien à faire valider, et un dossier rouvert n'a pas les dépendances des hooks du dépôt.
 */
export async function revertFile(dir: string, baseSha: string, path: string): Promise<RevertOutcome> {
  if (!isSafeRepoPath(path)) throw new Error("This file can't be put back: its path is not one of the repository.");
  if (!isCommitSha(baseSha)) throw new Error("The mission has no known starting point.");
  const existedBefore = (await run("git", ["-C", dir, "ls-tree", "--name-only", baseSha, "--", path])).stdout.trim() !== "";
  if (existedBefore) await runOrThrow("git", ["-C", dir, "checkout", baseSha, "--", path]);
  else await runOrThrow("git", ["-C", dir, "rm", "-f", "--ignore-unmatch", "--", path]);
  const unchanged = await run("git", ["-C", dir, "diff", "--cached", "--quiet", "HEAD", "--", path]);
  if (unchanged.code === 0) return { commit: null };
  await runOrThrow("git", ["-C", dir, "commit", "--no-verify", "-m", `Put ${path} back as it was before the mission`.slice(0, 200), "--", path]);
  // La garantie du geste, vérifiée sur ce qui vient d'être écrit : ce commit ne touche que ce fichier (R139).
  const touched = (await runOrThrow("git", ["-C", dir, "-c", "core.quotePath=false", "show", "--name-only", "--no-renames", "--format=", "HEAD"])).split(/\r?\n/).filter(Boolean);
  if (touched.length !== 1 || touched[0] !== path) {
    await runOrThrow("git", ["-C", dir, "reset", "--soft", "HEAD~1"]);
    throw new Error("The revert would have touched other files: it was undone.");
  }
  return { commit: await runOrThrow("git", ["-C", dir, "rev-parse", "HEAD"]) };
}

/** La branche existe-t-elle sur GitHub ? Elle n'y est pas quand la mission n'a rien poussé : le retour reste local. */
export async function branchIsPushed(worktree: Pick<Worktree, "path" | "branch">, repo: RepoConfig): Promise<boolean> {
  const out = await run("git", [...ghCredentialArgs(repo), "-C", worktree.path, "ls-remote", "--heads", "origin", `refs/heads/${worktree.branch}`], { timeoutMs: 60_000 });
  return out.code === 0 && out.stdout.trim() !== "";
}

/** Commandes `setup` de la configuration (ex. `["npm", "ci"]`), lancées dans le worktree avant l'agent. */
export async function runSetup(worktree: Worktree, commands: string[][]): Promise<void> {
  for (const [file, ...args] of commands) {
    if (!file) continue;
    const result = await run(file, args, { cwd: worktree.path, timeoutMs: 15 * 60_000 });
    if (result.code !== 0) {
      throw new Error(`Setup command failed ("${[file, ...args].join(" ")}", code ${result.code})`);
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

export async function pushBranch(worktree: Worktree, repo: RepoConfig): Promise<void> {
  // Jamais de --force : la branche est neuve, un refus ici est un vrai problème à remonter.
  await runOrThrow("git", [...ghCredentialArgs(repo), "-C", worktree.path, "push", "-u", "origin", worktree.branch], {
    timeoutMs: 5 * 60_000,
  });
}

/** `gh repo view --json visibility` -> la visibilité que les règles connaissent ; `INTERNAL` ou illisible : null. */
export function visibilityOf(output: string): "public" | "private" | null {
  const value = output.trim().toUpperCase();
  return value === "PUBLIC" ? "public" : value === "PRIVATE" ? "private" : null;
}

/**
 * Visibilité du dépôt sur GitHub, pour juger les sorties. Inconnue (dépôt `internal`, `gh` sans réponse), elle n'est
 * pas devinée : aucune règle qui la demande ne s'applique, et la sortie est demandée.
 */
export async function repoVisibility(fullName: string): Promise<"public" | "private" | null> {
  const out = await runOrThrow("gh", ["repo", "view", fullName, "--json", "visibility", "--jq", ".visibility"], { timeoutMs: 60_000 })
    .catch(() => "");
  return visibilityOf(out);
}

/**
 * Ce que porte la pull request (R49, séance n°8) : les faits du runner d'abord, chacun tiré de ce qu'il a vraiment fait,
 * puis le résumé de l'agent sous son nom. Le récit de l'agent, écrit avant le push, ne dit plus « nothing pushed » au
 * dessus d'une branche poussée.
 */
export interface PullRequestReport {
  /** Ce que TaskForce a fait : la branche poussée, la pull request ouverte et par quelle règle, les tests. */
  facts: string[];
  /** Le résumé de l'agent, tel qu'il l'a écrit. */
  summary: string;
  /** La fin de la sortie des tests, quand ils ont tourné. */
  testOutput?: string;
}

/** Ouvre la pull request avec `gh` et rend son URL. Aucune fusion : la revue reste humaine. */
export async function openPullRequest(
  worktree: Worktree, repo: RepoConfig, claim: Claim, report: PullRequestReport, home: string,
): Promise<string> {
  const bodyFile = join(home, "tmp", `run-${claim.runId}-pr.md`);
  mkdirSync(join(home, "tmp"), { recursive: true });
  writeFileSync(bodyFile, pullRequestBody(claim, report), "utf8");
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
    if (!url) throw new Error(`gh pr create returned no URL: ${out.slice(-200)}`);
    return url;
  } finally {
    rmSync(bodyFile, { force: true });
  }
}

export function pullRequestBody(claim: Claim, report: PullRequestReport): string {
  const lines = [
    `## ${claim.issueKey}: ${claim.title}`,
    "",
    "### What TaskForce did",
    ...report.facts.map((fact) => `- ${fact}`),
    "",
    "### The agent's summary",
    "",
    report.summary.trim(),
  ];
  if (report.testOutput) {
    lines.push("", "<details><summary>Test output</summary>", "", "```", report.testOutput, "```", "</details>");
  }
  lines.push(
    "",
    "---",
    `Delegated from TaskForce (${claim.projectName}, run #${claim.runId}) and produced by a coding agent.`,
    "Review before merging: nothing is merged automatically.",
    "",
  );
  return lines.join("\n");
}

export async function removeWorktree(repo: RepoConfig, worktree: Pick<Worktree, "path">): Promise<void> {
  await run("git", ["-C", repo.path, "worktree", "remove", "--force", worktree.path]);
}
