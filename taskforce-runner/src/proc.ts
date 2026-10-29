import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, extname, join } from "node:path";

export interface ProcResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  /** Arrêté par `signal` (le runner s'arrête) avant d'avoir fini. */
  aborted: boolean;
}

export interface ProcOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** Texte envoyé sur stdin (le prompt de l'agent : il ne passe jamais par une ligne de commande). */
  input?: string;
  timeoutMs?: number;
  /** Appelé pour chaque ligne complète de stdout, au fil de l'eau (suivi en direct de l'agent). */
  onStdoutLine?: (line: string) => void;
  /** Arrête le processus et ses descendants quand le signal est levé. */
  signal?: AbortSignal;
}

/**
 * Arrête un processus et ses descendants. Sous Windows, arrêter `cmd.exe` (lanceur `.cmd`) laisserait tourner le Node
 * de Claude Code : `taskkill /T` arrête tout l'arbre. Ailleurs, SIGTERM, puis SIGKILL après 10 s.
 */
export function killTree(child: ChildProcess): void {
  if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" })
      .on("error", () => child.kill());
    return;
  }
  child.kill("SIGTERM");
  setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  }, 10_000).unref();
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
    throw new Error("Argument refused for cmd.exe: a % sign or a line break");
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
  const env = options.env ?? process.env;
  const resolved = resolveCommand(command, env);
  if (resolved.viaCmd) {
    const line = [quoteForCmd(resolved.file), ...args.map(quoteForCmd)].join(" ");
    return spawnCollect(env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", `"${line}"`], true, options);
  }
  return spawnCollect(resolved.file, args, false, options);
}

/**
 * Une ligne de commande passée telle quelle au shell du système (`cmd.exe` sous Windows, `sh` ailleurs). Seul usage :
 * la commande de test déclarée d'un projet (S1, R32), qu'une personne a acceptée sur cet ordinateur avant tout
 * lancement. C'est la seule chaîne venue de TaskForce qui s'exécute sans être un tableau d'arguments validés.
 */
export function runShell(commandLine: string, options: ProcOptions = {}): Promise<ProcResult> {
  const env = options.env ?? process.env;
  return process.platform === "win32"
    ? spawnCollect(env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", `"${commandLine}"`], true, options)
    : spawnCollect("sh", ["-c", commandLine], false, options);
}

function spawnCollect(file: string, finalArgs: string[], verbatim: boolean, options: ProcOptions): Promise<ProcResult> {
  return new Promise((resolvePromise, reject) => {
    const env = options.env ?? process.env;
    const child = spawn(file, finalArgs, {
      cwd: options.cwd,
      env,
      windowsHide: true,
      windowsVerbatimArguments: verbatim,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let pending = "";
    let timedOut = false;
    let aborted = false;
    const timer = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          killTree(child);
        }, options.timeoutMs)
      : null;
    const abort = () => {
      aborted = true;
      killTree(child);
    };
    if (options.signal?.aborted) abort();
    else options.signal?.addEventListener("abort", abort, { once: true });

    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stdout += text;
      if (!options.onStdoutLine) return;
      pending += text;
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? "";
      for (const line of lines) if (line.trim()) options.onStdoutLine(line);
    });
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      reject(err);
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      if (options.onStdoutLine && pending.trim()) options.onStdoutLine(pending);
      resolvePromise({ code, stdout, stderr, timedOut, aborted });
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
    throw new Error(`${command} ${args.slice(0, 3).join(" ")} failed (code ${result.code}): ${detail}`);
  }
  return result.stdout.trim();
}
