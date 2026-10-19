import type { ChildProcess } from "node:child_process";

import { log } from "./log";
import { runTool, spawnTool } from "./tools";

/**
 * GitHub dans l'app desktop, par le GitHub CLI (`gh`) de la personne : c'est avec lui que le runner clone le dépôt d'un
 * projet, pousse la branche et ouvre la pull request. La webapp passe par l'intégration GitHub de l'espace (OAuth côté
 * serveur) ; ici rien ne quitte l'ordinateur, et TaskForce ne voit jamais le jeton GitHub : `gh` le garde dans le
 * trousseau du système.
 */

/** Page où la personne saisit le code à usage unique de la connexion. */
export const DEVICE_PAGE = "https://github.com/login/device";

/** Durée de vie d'un code GitHub : au-delà, la connexion est abandonnée. */
const SIGN_IN_TIMEOUT_MS = 15 * 60_000;

export interface GitHubRepo {
  fullName: string;
  private: boolean;
  /** La personne peut y pousser une branche (condition pour que Claude Code y ouvre une pull request). */
  canPush: boolean;
}

/** `owner/name` tel que GitHub l'accepte (même règle que le runner et le backend). */
export function isRepoFullName(value: unknown): value is string {
  return typeof value === "string"
    && /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/.test(value)
    && !value.includes("..");
}

/** Nom d'un dépôt à créer, avec ou sans organisation (`site`, `acme/site`). */
export function isNewRepoName(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return /^[A-Za-z0-9_.-]{1,100}$/.test(value) ? value !== "." && value !== ".." : isRepoFullName(value);
}

/** Lignes `owner/name<TAB>private<TAB>push` rendues par `gh api ... --jq ... | @tsv`. */
export function parseRepoLines(output: string): GitHubRepo[] {
  const repos: GitHubRepo[] = [];
  for (const line of output.split(/\r?\n/)) {
    const [fullName, isPrivate, push] = line.trim().split("\t");
    if (isRepoFullName(fullName)) repos.push({ fullName, private: isPrivate === "true", canPush: push === "true" });
  }
  return repos;
}

/** `https://github.com/acme/site` (sortie de `gh repo create`) -> `acme/site`. */
export function parseCreatedRepo(output: string): string | null {
  const match = /https:\/\/github\.com\/([^\s/]+\/[^\s/]+?)(?:\.git)?\s*$/m.exec(output.trim());
  return match && isRepoFullName(match[1]) ? match[1] : null;
}

/** Code à usage unique écrit par `gh auth login --web` : `! First copy your one-time code: 1A2B-3C4D`. */
export function parseDeviceCode(output: string): string | null {
  return /one-time code: ([A-Z0-9]{4}-[A-Z0-9]{4})/.exec(output)?.[1] ?? null;
}

/** Première ligne utile d'une erreur de `gh`, sans préfixe technique, pour l'écran. */
export function ghError(stderr: string, fallback: string): string {
  const line = stderr.split(/\r?\n/).map((l) => l.trim()).find(Boolean);
  if (!line) return fallback;
  return line.replace(/^(GraphQL|HTTP \d+):\s*/i, "").replace(/\s*\(\w+\)$/, "").slice(0, 200);
}

const REPO_FIELDS = "[.full_name, (.private | tostring), (.permissions.push | tostring)] | @tsv";

/** Les 100 dépôts où la personne a poussé le plus récemment : les siens, ceux de ses organisations et ses collaborations. */
export async function listRepos(): Promise<GitHubRepo[]> {
  const result = await runTool("gh", [
    "api", "user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member",
    "--jq", `.[] | ${REPO_FIELDS}`,
  ]);
  if (!result) throw new Error("GitHub CLI is not installed on this computer");
  if (result.code !== 0) throw new Error(ghError(result.stderr, "Couldn't list your GitHub repositories"));
  return parseRepoLines(result.stdout);
}

/** Le dépôt tel que la personne le voit, ou `null` s'il n'existe pas ou qu'elle n'y a pas accès. */
export async function findRepo(fullName: string): Promise<GitHubRepo | null> {
  if (!isRepoFullName(fullName)) return null;
  const result = await runTool("gh", ["api", `repos/${fullName}`, "--jq", REPO_FIELDS]);
  if (!result) throw new Error("GitHub CLI is not installed on this computer");
  return result.code === 0 ? parseRepoLines(result.stdout)[0] ?? null : null;
}

/**
 * Crée un dépôt avec un premier commit (README) : Claude Code peut y tirer une branche tout de suite. Rend son
 * `owner/name`.
 */
export async function createRepo(name: string, isPrivate: boolean): Promise<string> {
  if (!isNewRepoName(name)) throw new Error("Letters, digits, dots, dashes and underscores only");
  const result = await runTool("gh", ["repo", "create", name, isPrivate ? "--private" : "--public", "--add-readme"], 60_000);
  if (!result) throw new Error("GitHub CLI is not installed on this computer");
  if (result.code !== 0) throw new Error(ghError(result.stderr, "GitHub refused to create the repository"));
  const fullName = parseCreatedRepo(result.stdout);
  if (!fullName) throw new Error("GitHub created the repository but its name couldn't be read");
  return fullName;
}

export type SignInOutcome = { ok: true } | { ok: false; error: string };

/**
 * Connexion à GitHub depuis l'app, comme `gh auth login` dans un terminal : `gh` demande un code à usage unique à
 * GitHub, l'app le montre, la personne le saisit sur github.com, et `gh` enregistre la connexion dans le trousseau.
 * Une seule connexion à la fois ; en relancer une abandonne la précédente.
 */
export class GitHubSignIn {
  private child: ChildProcess | null = null;
  private outcome: Promise<SignInOutcome> | null = null;

  /** Lance la connexion et rend le code à montrer. */
  start(): Promise<string> {
    this.cancel();
    const child = spawnTool("gh", ["auth", "login", "--hostname", "github.com", "--git-protocol", "https", "--web"]);
    this.child = child;
    let output = "";
    const codeShown = new Promise<string>((resolve, reject) => {
      const onData = (chunk: Buffer) => {
        output += chunk.toString("utf8");
        const code = parseDeviceCode(output);
        if (code) resolve(code);
      };
      child.stdout?.on("data", onData);
      child.stderr?.on("data", onData);
      child.on("error", (error: NodeJS.ErrnoException) =>
        reject(new Error(error.code === "ENOENT" ? "GitHub CLI is not installed on this computer" : error.message)));
      child.on("close", () => reject(new Error(ghError(output, "GitHub sign-in stopped before showing a code"))));
    });
    this.outcome = new Promise<SignInOutcome>((resolve) => {
      const timer = setTimeout(() => child.kill(), SIGN_IN_TIMEOUT_MS);
      child.on("error", (error) => {
        clearTimeout(timer);
        resolve({ ok: false, error: error.message });
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (this.child === child) this.child = null;
        if (code === 0) {
          log.info("Signed in to GitHub with GitHub CLI");
          resolve({ ok: true });
        } else {
          resolve({ ok: false, error: ghError(output.replace(/^.*one-time code.*$|^Open this URL.*$/gm, ""), "GitHub sign-in did not finish") });
        }
      });
    });
    return codeShown;
  }

  /** Attend la fin de la connexion lancée par {@link start}. */
  wait(): Promise<SignInOutcome> {
    return this.outcome ?? Promise.resolve({ ok: false, error: "No GitHub sign-in in progress" });
  }

  cancel(): void {
    if (this.child && this.child.exitCode === null) this.child.kill();
    this.child = null;
  }
}
