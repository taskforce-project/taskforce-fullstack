import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { extname, win32 } from "node:path";

/**
 * Outils de développement de la personne : Claude Code, git et GitHub CLI. Le runner les emploie pour les tâches
 * déléguées (cloner, travailler, pousser, ouvrir la pull request) ; la coque les interroge pour dire à l'écran ce qui
 * est prêt, et pour les gestes que la personne demande dans l'app (se connecter à GitHub, lier un dépôt).
 *
 * Ils tournent avec l'environnement de la personne (son PATH, ses connexions), comme le runner. Jamais de shell : les
 * arguments sont un tableau ; seul un lanceur `.cmd` de npm (Claude Code installé par npm) passe par `cmd.exe`, avec
 * chaque argument protégé, et refusé s'il ne peut pas l'être (même règle que `taskforce-runner/src/proc.ts`).
 */

export interface ToolResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Sous Windows, un outil installé par npm est un lanceur `.cmd` : on cherche le vrai fichier dans le PATH. Un `.exe` se
 * lance directement, un `.cmd` passe par `cmd.exe`. Ailleurs, la commande est rendue telle quelle.
 */
export function resolveCommand(
  command: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  exists: (path: string) => boolean = existsSync,
): { file: string; viaCmd: boolean } {
  if (platform !== "win32" || extname(command)) return { file: command, viaCmd: /\.(cmd|bat)$/i.test(command) };
  const dirs = (env.PATH ?? env.Path ?? "").split(";").filter(Boolean);
  for (const ext of [".exe", ".cmd", ".bat"]) {
    for (const dir of dirs) {
      const candidate = win32.join(dir, command + ext);
      if (exists(candidate)) return { file: candidate, viaCmd: ext !== ".exe" };
    }
  }
  return { file: command, viaCmd: false };
}

/**
 * Protège un argument pour `cmd.exe`. Entre guillemets, `& | < > ^ ( )` sont littéraux ; restent `%` (développé même
 * entre guillemets) et les sauts de ligne (ils coupent la commande) : on les refuse.
 */
export function quoteForCmd(arg: string): string {
  if (/[%\r\n]/.test(arg)) throw new Error("Argument refused for cmd.exe: a % sign or a line break");
  if (arg !== "" && !/[\s"&|<>^(),;=!]/.test(arg)) return arg;
  return `"${arg.replace(/"/g, '""')}"`;
}

/** Lance un outil de la personne ; un outil introuvable dans le PATH lève l'erreur `ENOENT` sur le processus. */
export function spawnTool(command: string, args: string[]): ChildProcess {
  const resolved = resolveCommand(command);
  if (!resolved.viaCmd) {
    return spawn(resolved.file, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  }
  const line = [quoteForCmd(resolved.file), ...args.map(quoteForCmd)].join(" ");
  return spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", `"${line}"`], {
    windowsHide: true,
    windowsVerbatimArguments: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/** Lance un outil et attend sa fin. `null` si l'outil n'est pas installé. */
export function runTool(command: string, args: string[], timeoutMs = 30_000): Promise<ToolResult | null> {
  return new Promise((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = spawnTool(command, args);
    } catch (error) {
      reject(error);
      return;
    }
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${command} did not answer within ${Math.round(timeoutMs / 1000)} s`));
    }, timeoutMs);
    child.stdout?.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
    child.stderr?.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
    child.on("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (error.code === "ENOENT") resolve(null);
      else reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      // Un lanceur `.cmd` introuvable ne lève pas ENOENT : cmd.exe répond 9009 (« n'est pas reconnu »).
      if (code === 9009) resolve(null);
      else resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

/** Ce qui est prêt sur cet ordinateur pour faire travailler Claude Code sur les tâches. */
export interface ToolsStatus {
  claude: { installed: boolean; version: string | null; signedIn: boolean | null };
  git: { installed: boolean; version: string | null };
  github: { installed: boolean; signedIn: boolean; login: string | null };
}

/** `2.1.293 (Claude Code)`, `git version 2.54.0.windows.1`, `gh version 2.96.0 (2026-07-02)` : le numéro seul. */
export function parseVersion(output: string): string | null {
  return /(\d+\.\d+\.\d+)/.exec(output)?.[1] ?? null;
}

/**
 * `claude auth status` répond en JSON. On n'en garde que l'état de connexion : l'adresse et l'organisation du compte
 * Claude ne regardent pas TaskForce. `null` : réponse illisible (version de Claude Code sans cette commande).
 */
export function parseClaudeSignedIn(output: string): boolean | null {
  try {
    const parsed = JSON.parse(output) as { loggedIn?: unknown };
    return typeof parsed.loggedIn === "boolean" ? parsed.loggedIn : null;
  } catch {
    return null;
  }
}

/** Identifiant GitHub tel que `gh api user --jq .login` le rend, ou `null`. */
export function parseLogin(output: string): string | null {
  const login = output.trim();
  return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(login) ? login : null;
}

const quiet = <T>(promise: Promise<T>, fallback: T): Promise<T> => promise.catch(() => fallback);

async function claudeStatus(): Promise<ToolsStatus["claude"]> {
  const [version, auth] = await Promise.all([
    quiet(runTool("claude", ["--version"]), null),
    quiet(runTool("claude", ["auth", "status"]), null),
  ]);
  if (!version || version.code !== 0) return { installed: false, version: null, signedIn: null };
  return { installed: true, version: parseVersion(version.stdout), signedIn: auth ? parseClaudeSignedIn(auth.stdout) : null };
}

async function gitStatus(): Promise<ToolsStatus["git"]> {
  const version = await quiet(runTool("git", ["--version"]), null);
  return version && version.code === 0 ? { installed: true, version: parseVersion(version.stdout) } : { installed: false, version: null };
}

async function githubStatus(): Promise<ToolsStatus["github"]> {
  // `gh auth token` dit, sans réseau, si un compte est enregistré ; le jeton qu'il écrit est jeté aussitôt.
  const token = await quiet(runTool("gh", ["auth", "token", "--hostname", "github.com"]), null);
  if (!token) return { installed: false, signedIn: false, login: null };
  if (token.code !== 0) return { installed: true, signedIn: false, login: null };
  const user = await quiet(runTool("gh", ["api", "user", "--jq", ".login"]), null);
  return { installed: true, signedIn: true, login: user && user.code === 0 ? parseLogin(user.stdout) : null };
}

/** État des trois outils, lus en parallèle (Claude Code met quelques secondes à répondre). */
export async function toolsStatus(): Promise<ToolsStatus> {
  const [claude, git, github] = await Promise.all([claudeStatus(), gitStatus(), githubStatus()]);
  return { claude, git, github };
}
