import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import { dirname } from "node:path";

/** Variables du système que les processus de l'app gardent ; tout le reste de l'environnement est écarté. */
const SYSTEM_VARIABLES = new Set(
  (process.platform === "win32"
    ? ["SystemRoot", "SystemDrive", "windir", "ComSpec", "PATHEXT", "Path", "TEMP", "TMP", "USERPROFILE", "APPDATA",
       "LOCALAPPDATA", "HOMEDRIVE", "HOMEPATH", "USERNAME", "COMPUTERNAME", "NUMBER_OF_PROCESSORS",
       "PROCESSOR_ARCHITECTURE", "OS", "ProgramData", "ProgramFiles"]
    : ["PATH", "HOME", "USER", "LOGNAME", "LANG", "LC_ALL", "LC_CTYPE", "TMPDIR"]).map((name) => name.toLowerCase()),
);

/**
 * Environnement de la base, du backend et de l'interface : les variables du système plus celles de l'app, rien de
 * l'environnement de la personne. Un `SERVER_PORT`, un `SPRING_PROFILES_ACTIVE`, un `PGHOST` ou un `NODE_OPTIONS`
 * posé pour un autre projet changerait sinon leur configuration sans bruit.
 */
export function serviceEnv(variables: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (SYSTEM_VARIABLES.has(name.toLowerCase())) env[name] = value;
  }
  return { ...env, ...variables };
}

/** Résultat d'une commande courte. */
export interface RunResult {
  code: number;
  output: string;
}

/**
 * Lance une commande courte et attend sa fin (initdb, pg_ctl, psql). La sortie est gardée pour le journal en cas
 * d'échec. Jamais de shell : les arguments passent tels quels, sans interprétation.
 */
export function runCommand(
  command: string,
  args: string[],
  options: { env?: NodeJS.ProcessEnv; cwd?: string; timeoutMs?: number } = {},
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: options.env ?? process.env,
      cwd: options.cwd,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let settled = false;
    let grace: NodeJS.Timeout | null = null;
    child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
    const timer = options.timeoutMs
      ? setTimeout(() => {
          child.kill();
          reject(new Error(`${command} did not finish within ${Math.round((options.timeoutMs ?? 0) / 1000)} s`));
        }, options.timeoutMs)
      : null;
    const finish = (code: number | null) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (grace) clearTimeout(grace);
      child.stdout.destroy();
      child.stderr.destroy();
      resolve({ code: code ?? -1, output });
    };
    child.on("error", (error) => {
      if (timer) clearTimeout(timer);
      reject(error);
    });
    child.on("close", finish);
    // Sous Windows, `pg_ctl start` lègue ses tuyaux de sortie au serveur qu'il lance : ils ne se ferment qu'à l'arrêt
    // de la base. Une fois la commande terminée, on lit encore une seconde puis on rend la main.
    child.on("exit", (code) => {
      grace = setTimeout(() => finish(code), 1000);
    });
  });
}

/** Processus de fond (backend, interface), sa sortie écrite dans un fichier de journal. */
export interface Service {
  process: ChildProcess;
  running: () => boolean;
  stop: () => Promise<void>;
}

export function startService(
  command: string,
  args: string[],
  options: { env: NodeJS.ProcessEnv; logFile: string; cwd?: string },
): Service {
  mkdirSync(dirname(options.logFile), { recursive: true });
  const out = createWriteStream(options.logFile, { flags: "a" });
  const child = spawn(command, args, {
    env: options.env,
    cwd: options.cwd,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.pipe(out);
  child.stderr?.pipe(out);
  let exited = false;
  child.on("exit", () => (exited = true));

  return {
    process: child,
    running: () => !exited,
    stop: () =>
      new Promise((resolve) => {
        if (exited) return resolve();
        const force = setTimeout(() => child.kill("SIGKILL"), 8000);
        child.once("exit", () => {
          clearTimeout(force);
          resolve();
        });
        child.kill();
      }),
  };
}
