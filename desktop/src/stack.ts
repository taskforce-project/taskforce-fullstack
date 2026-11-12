import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { app } from "electron";

import { aiEnvironment, BackendAi } from "./ai";
import { backupBeforeMigration, lastVersion, updateNotice } from "./backup";
import { downloadAccountAvatar } from "./avatar";
import { Backend } from "./backend";
import { Frontend } from "./frontend";
import { GitHubRelay } from "./github-relay";
import { log } from "./log";
import { McpCallback } from "./mcp-callback";
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
  /** Fournisseur d'IA du backend (réglages « AI » de l'app), lu et changé par la coque seule. */
  ai: BackendAi;
  /** Jeton GitHub de la personne (son `gh`), rendu au backend seul (Copilot, pull requests liées). */
  github: GitHubRelay;
  /** Premier lancement d'une nouvelle version : la fenêtre le dit à son ouverture (cf. backup.ts). */
  updateNotice: { version: string; from: string } | null;
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
export async function startStack(account: Account, onStep: (step: string) => void,
                                 onConnected: (path: string | null) => void = () => undefined): Promise<Stack> {
  const dataDir = accountDataDir(account.subject);
  const launchToken = randomToken("tfd_");
  const database = new EmbeddedPostgres(dataDir, accountSecret(account.subject, "databasePassword"));
  const backend = new Backend();
  const frontend = new Frontend();
  const proxy = new Proxy();
  const runner = new Runner();
  const runnerSecret = randomToken("tfs_");
  const shellSecret = randomToken("tfsh_");
  const ai = new BackendAi(() => backend.port, launchToken, shellSecret);
  const aiChoice = settings.aiSettings(account.subject);
  const github = new GitHubRelay();
  // Le retour d'une connexion à un outil : la fenêtre revient au premier plan, sur la page où l'app finit la connexion.
  const mcpCallback = new McpCallback((_outcome, path) => onConnected(path));

  // Le runner d'abord : il rend au backend le résultat d'un run interrompu avant que celui-ci s'arrête. Chaque étape a un
  // délai : une étape bloquée ne doit jamais empêcher l'arrêt propre de la base.
  const stop = async () => {
    await within(runner.stop(), 20_000);
    await within(mcpCallback.stop(), 5_000);
    await within(proxy.stop(), 5_000);
    await within(frontend.stop(), 10_000);
    await within(backend.stop(), 15_000);
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
    const previous = lastVersion(dataDir);
    await backupBeforeMigration({
      dump: (file) => {
        onStep("Saving a copy of your data before the update");
        return database.dump(file);
      },
    }, dataDir, app.getVersion(), fresh);

    const origin = await proxy.reserve(settings.windowPort(account.subject));
    settings.setWindowPort(account.subject, proxy.port);
    // Le retour des connexions aux outils, sur un port fixe : le backend doit connaître son adresse avant de démarrer.
    const mcpRedirectUri = await mcpCallback.start();
    await github.start();
    await avatar;
    onStep("Opening your workspace");
    await Promise.all([
      backend.start({
        account,
        dataDir,
        database,
        databasePassword: accountSecret(account.subject, "databasePassword"),
        encryptionKey: accountSecret(account.subject, "encryptionKey"),
        launchToken,
        uiOrigin: origin,
        // Le fournisseur d'IA de la personne, clé du trousseau comprise : en mémoire du backend seulement.
        ai: aiEnvironment(aiChoice, settings.aiKey(account.subject, aiChoice.provider)),
        shellSecret,
        github: { url: github.url(), token: github.token },
        runnerSecret,
        mcpRedirectUri,
      }),
      frontend.start(join(dataDir, "logs")),
    ]);
    await proxy.start(backend.port, frontend.port);
    mcpCallback.connect(backend.port);
    runner.start({ apiPort: backend.port, secret: runnerSecret, dataDir });
    log.info(`TaskForce ready at ${origin}`);
    return { account, dataDir, launchToken, origin, ai, github, updateNotice: updateNotice(previous, app.getVersion(), fresh), stop };
  } catch (error) {
    await stop();
    throw error;
  }
}
