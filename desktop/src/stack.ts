import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { app } from "electron";

import { AiRelay } from "./ai";
import { backupBeforeMigration } from "./backup";
import { downloadAccountAvatar } from "./avatar";
import { Backend } from "./backend";
import { Frontend } from "./frontend";
import { GitHubRelay } from "./github-relay";
import { log } from "./log";
import { randomToken } from "./net";
import { accountDataDir } from "./paths";
import { EmbeddedPostgres } from "./postgres";
import { Proxy } from "./proxy";
import { Runner } from "./runner";
import { settings, type Account } from "./settings";

/** Tout ce qui tourne pour le compte connecté : base, backend, interface et relais de la fenêtre. */
export interface Stack {
  account: Account;
  dataDir: string;
  launchToken: string;
  origin: string;
  /** Relais vers le fournisseur d'IA choisi (réglages « AI » de l'app). */
  ai: AiRelay;
  /** Jeton GitHub de la personne (son `gh`), rendu au backend seul (Copilot, pull requests liées). */
  github: GitHubRelay;
  stop: () => Promise<void>;
}

/** Attend une étape d'arrêt au plus `ms` millisecondes, sans jamais échouer. */
function within(step: Promise<void>, ms: number): Promise<void> {
  return Promise.race([
    step.catch(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, ms).unref()),
  ]);
}

/** Secret d'un compte sur ce poste, créé au premier lancement puis gardé chiffré par le système. */
function accountSecret(subject: string, name: "databasePassword" | "encryptionKey"): string {
  const existing = settings.secret(subject, name);
  if (existing) return existing;
  const created = randomBytes(32).toString("hex");
  settings.setSecret(subject, name, created);
  return created;
}

/**
 * Démarre l'app du compte. La base d'abord ; puis le backend et l'interface en parallèle (le backend prend le plus
 * de temps) ; le relais enfin, qui ouvre l'origine de la fenêtre, et le runner de Claude Code.
 */
export async function startStack(account: Account, onStep: (step: string) => void): Promise<Stack> {
  const dataDir = accountDataDir(account.subject);
  const launchToken = randomToken("tfd_");
  const database = new EmbeddedPostgres(dataDir, accountSecret(account.subject, "databasePassword"));
  const backend = new Backend();
  const frontend = new Frontend();
  const proxy = new Proxy();
  const runner = new Runner();
  const runnerSecret = randomToken("tfs_");
  const ai = new AiRelay(() => ({
    settings: settings.aiSettings(account.subject),
    apiKey: settings.secret(account.subject, "aiApiKey"),
  }));
  const github = new GitHubRelay();

  // Le runner d'abord : il rend au backend le résultat d'un run interrompu avant que celui-ci s'arrête. Chaque étape a un
  // délai : une étape bloquée ne doit jamais empêcher l'arrêt propre de la base.
  const stop = async () => {
    await within(runner.stop(), 20_000);
    await within(proxy.stop(), 5_000);
    await within(frontend.stop(), 10_000);
    await within(backend.stop(), 15_000);
    await within(ai.stop(), 5_000);
    await within(github.stop(), 5_000);
    await within(database.stop(), 45_000);
  };

  // La photo du compte en ligne se télécharge pendant que la base démarre ; le backend la reprend à son démarrage.
  const avatar = downloadAccountAvatar(account.avatarUrl, dataDir);

  try {
    const fresh = !database.initialized;
    if (fresh) onStep("Preparing your workspace for the first time");
    await database.init();
    onStep("Starting the database");
    await database.start();
    // Une nouvelle version de l'app peut faire évoluer la base au démarrage du backend : la coque la copie d'abord.
    await backupBeforeMigration({
      dump: (file) => {
        onStep("Saving a copy of your data before the update");
        return database.dump(file);
      },
    }, dataDir, app.getVersion(), fresh);

    const origin = await proxy.reserve(settings.windowPort(account.subject));
    settings.setWindowPort(account.subject, proxy.port);
    await ai.start();
    await github.start();
    await avatar;
    onStep("Starting TaskForce");
    await Promise.all([
      backend.start({
        account,
        dataDir,
        database,
        databasePassword: accountSecret(account.subject, "databasePassword"),
        encryptionKey: accountSecret(account.subject, "encryptionKey"),
        launchToken,
        uiOrigin: origin,
        ai: { url: ai.url(), token: ai.token },
        github: { url: github.url(), token: github.token },
        runnerSecret,
      }),
      frontend.start(join(dataDir, "logs")),
    ]);
    await proxy.start(backend.port, frontend.port);
    runner.start({ apiPort: backend.port, secret: runnerSecret, dataDir });
    log.info(`TaskForce ready at ${origin}`);
    return { account, dataDir, launchToken, origin, ai, github, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}
