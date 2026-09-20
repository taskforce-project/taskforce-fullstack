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
  /** Texte envoyé sur stdin (le prompt de l'agent : évite tout problème de guillemets en ligne de commande). */
  input?: string;
  timeoutMs?: number;
  /** Commande complète à passer au shell (commandes `setup` de la configuration). */
  shell?: boolean;
}

/**
 * Sous Windows, un exécutable installé par npm est un lanceur `.cmd`, que Node refuse de lancer sans shell.
 * On cherche donc le vrai fichier dans le PATH : un `.exe` se lance directement, un `.cmd` passe par le
 * shell avec des arguments protégés. Ailleurs, la commande est rendue telle quelle.
 */
export function resolveCommand(command: string, env: NodeJS.ProcessEnv = process.env): { file: string; viaShell: boolean } {
  if (process.platform !== "win32") return { file: command, viaShell: false };
  if (extname(command)) return { file: command, viaShell: /\.(cmd|bat)$/i.test(command) };
  if (command.includes("/") || command.includes("\\")) {
    for (const ext of [".exe", ".cmd", ".bat"]) {
      if (existsSync(command + ext)) return { file: command + ext, viaShell: ext !== ".exe" };
    }
    return { file: command, viaShell: false };
  }
  const dirs = (env.PATH ?? env.Path ?? "").split(delimiter).filter(Boolean);
  for (const ext of [".exe", ".cmd", ".bat"]) {
    for (const dir of dirs) {
      const candidate = join(dir, command + ext);
      if (existsSync(candidate)) return { file: candidate, viaShell: ext !== ".exe" };
    }
  }
  return { file: command, viaShell: false };
}

/** Protège un argument pour cmd.exe (utilisé seulement pour un lanceur `.cmd`). */
export function quoteForCmd(arg: string): string {
  if (arg !== "" && !/[\s"&|<>^()%!,;=]/.test(arg)) return arg;
  return `"${arg.replace(/"/g, '""')}"`;
}

/** Lance un processus et attend sa fin. Ne lève pas sur un code non nul : l'appelant décide. */
export function run(command: string, args: string[], options: ProcOptions = {}): Promise<ProcResult> {
  return new Promise((resolvePromise, reject) => {
    let file = command;
    let finalArgs = args;
    let useShell = options.shell === true;
    if (!useShell) {
      const resolved = resolveCommand(command, options.env ?? process.env);
      file = resolved.file;
      if (resolved.viaShell) {
        // Une seule ligne de commande, arguments déjà protégés : passer un tableau d'arguments à un
        // shell les concatène sans protection (avertissement DEP0190 de Node).
        useShell = true;
        file = [quoteForCmd(resolved.file), ...args.map(quoteForCmd)].join(" ");
        finalArgs = [];
      }
    }

    const child = spawn(file, finalArgs, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: useShell,
      windowsHide: true,
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
