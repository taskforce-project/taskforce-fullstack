import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { log } from "./log";
import { resourcesDir } from "./paths";

/** Client du runner que l'app lance : le backend du profil desktop n'admet que lui (DesktopRunnerTokens). */
export const RUNNER_CLIENT_ID = "tf-runner-desktop";

/** Délai laissé au runner pour arrêter Claude Code et rendre son résultat avant qu'on l'arrête de force. */
const STOP_GRACE_MS = 15_000;

export interface RunnerOptions {
  /** Port du backend : le runner et Claude Code (serveur MCP) le joignent directement, sur 127.0.0.1. */
  apiPort: number;
  /** Secret tiré au lancement, échangé contre un jeton de runner (jamais le jeton de lancement de la fenêtre). */
  secret: string;
  dataDir: string;
}

/**
 * Runner de Claude Code (taskforce-runner), lancé par l'app avec le Node d'Electron : il prend les tâches déléguées
 * à Claude Code, fait travailler le Claude Code de la personne dans un dossier de travail, montre ses actions et ses
 * demandes de validation dans l'app, puis rend le résultat.
 *
 * Il garde l'environnement de la personne (PATH, git, gh, Claude Code et sa connexion), à la différence de la base et
 * du backend : c'est son outil de développement qui travaille. À la fermeture de l'app, il reçoit « stop » par le
 * canal IPC, arrête Claude Code et rend le run en échec avant de sortir.
 */
export class Runner {
  private child: ChildProcess | null = null;

  start(options: RunnerOptions): void {
    const logFile = join(options.dataDir, "logs", "runner.log");
    mkdirSync(dirname(logFile), { recursive: true });
    const out = createWriteStream(logFile, { flags: "a" });
    const env: NodeJS.ProcessEnv = {};
    for (const [name, value] of Object.entries(process.env)) {
      // Ni les variables d'Electron, ni une configuration TaskForce posée pour un autre usage.
      if (!/^(ELECTRON_|TASKFORCE_)/i.test(name)) env[name] = value;
    }
    Object.assign(env, {
      ELECTRON_RUN_AS_NODE: "1",
      TASKFORCE_API_URL: `http://127.0.0.1:${options.apiPort}/api`,
      TASKFORCE_RUNNER_CLIENT_ID: RUNNER_CLIENT_ID,
      TASKFORCE_RUNNER_CLIENT_SECRET: options.secret,
      TASKFORCE_RUNNER_HOME: join(options.dataDir, "runner"),
    });
    const child = spawn(process.execPath, [join(resourcesDir(), "runner", "dist", "index.js")], {
      env,
      cwd: options.dataDir,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    child.stdout?.pipe(out);
    child.stderr?.pipe(out);
    child.on("exit", (code) => {
      if (this.child === child) this.child = null;
      if (code !== 0 && code !== null) log.warn(`Claude Code runner exited with code ${code}`);
    });
    this.child = child;
    log.info("Claude Code runner started");
  }

  /** Arrêt propre : « stop » par le canal IPC, puis l'arbre du processus si le runner ne sort pas à temps. */
  async stop(): Promise<void> {
    const child = this.child;
    if (!child || child.exitCode !== null) return;
    await new Promise<void>((resolve) => {
      const force = setTimeout(() => {
        killTree(child);
        resolve();
      }, STOP_GRACE_MS);
      child.once("exit", () => {
        clearTimeout(force);
        resolve();
      });
      if (child.connected) child.send("stop");
      else killTree(child);
    });
    this.child = null;
  }
}

/** Arrête un processus et ses descendants (Claude Code et ses outils) : `taskkill /T` sous Windows. */
function killTree(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }).on("error", () => child.kill());
  } else {
    child.kill("SIGKILL");
  }
}
