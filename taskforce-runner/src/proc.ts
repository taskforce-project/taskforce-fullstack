import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, extname, join } from "node:path";

export interface ProcResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface ProcOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** Texte envoyé sur stdin (le prompt de l'agent : il ne passe jamais par une ligne de commande). */
  input?: string;
  timeoutMs?: number;
}

/**
 * Sous Windows, un exécutable installé par npm est un lanceur `.cmd`. On cherche donc le vrai fichier dans
 * le PATH : un `.exe` se lance directement, un `.cmd` doit passer par `cmd.exe`. Ailleurs, la commande est
 * rendue telle quelle.
 */
export function resolveCommand(command: string, env: NodeJS.ProcessEnv = process.env): { file: string; viaCmd: boolean } {
  if (process.platform !== "win32") return { file: command, viaCmd: false };
  if (extname(command)) return { file: command, viaCmd: /\.(cmd|bat)$/i.test(command) };
  if (command.includes("/") || command.includes("\\")) {
    for (const ext of [".exe", ".cmd", ".bat"]) {
      if (existsSync(command + ext)) return { file: command + ext, viaCmd: ext !== ".exe" };
    }
    return { file: command, viaCmd: false };
  }
  const dirs = (env.PATH ?? env.Path ?? "").split(delimiter).filter(Boolean);
  for (const ext of [".exe", ".cmd", ".bat"]) {
    for (const dir of dirs) {
      const candidate = join(dir, command + ext);
      if (existsSync(candidate)) return { file: candidate, viaCmd: ext !== ".exe" };
    }
  }
  return { file: command, viaCmd: false };
}

/**
 * Protège un argument pour `cmd.exe`. Entre guillemets, `& | < > ^ ( )` sont littéraux ; restent deux
 * dangers qu'aucune protection ne neutralise, donc on REFUSE : `%` (cmd développe `%VAR%` même entre
 * guillemets) et les sauts de ligne (ils coupent la ligne de commande).
 */
export function quoteForCmd(arg: string): string {
  if (/[%\r\n]/.test(arg)) {
    throw new Error("Argument refusé pour cmd.exe : « % » ou saut de ligne");
  }
  if (arg !== "" && !/[\s"&|<>^(),;=!]/.test(arg)) return arg;
  return `"${arg.replace(/"/g, '""')}"`;
}

/**
 * Lance un processus et attend sa fin. Ne lève pas sur un code non nul : l'appelant décide.
 *
 * Jamais d'option `shell` : les arguments sont toujours un tableau. Seule exception imposée par Windows,
 * un lanceur `.cmd` est exécuté par `cmd.exe /d /s /c` avec une ligne dont CHAQUE argument a été protégé
 * (et refusé s'il ne peut pas l'être). Aucune chaîne venue de TaskForce n'y figure sans validation : le
 * prompt passe par stdin, le nom de branche est réduit à `[a-z0-9-/]`, le modèle est validé par l'appelant.
 */
export function run(command: string, args: string[], options: ProcOptions = {}): Promise<ProcResult> {
  return new Promise((resolvePromise, reject) => {
    const env = options.env ?? process.env;
    const resolved = resolveCommand(command, env);

    let file = resolved.file;
    let finalArgs = args;
    let verbatim = false;
    if (resolved.viaCmd) {
      const line = [quoteForCmd(resolved.file), ...args.map(quoteForCmd)].join(" ");
      file = env.ComSpec ?? "cmd.exe";
      finalArgs = ["/d", "/s", "/c", `"${line}"`];
      verbatim = true;
    }

    const child = spawn(file, finalArgs, {
      cwd: options.cwd,
      env,
      windowsHide: true,
      windowsVerbatimArguments: verbatim,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill("SIGTERM");
          setTimeout(() => child.kill("SIGKILL"), 10_000).unref();
        }, options.timeoutMs)
      : null;

    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolvePromise({ code, stdout, stderr, timedOut });
    });

    if (options.input !== undefined) child.stdin.write(options.input);
    child.stdin.end();
  });
}

/** Variante qui lève si le code de sortie n'est pas 0. */
export async function runOrThrow(command: string, args: string[], options: ProcOptions = {}): Promise<string> {
  const result = await run(command, args, options);
  if (result.code !== 0) {
    const detail = (result.stderr || result.stdout).trim().split(/\r?\n/).slice(-5).join(" | ");
    throw new Error(`${command} ${args.slice(0, 3).join(" ")} a échoué (code ${result.code}) : ${detail}`);
  }
  return result.stdout.trim();
}
