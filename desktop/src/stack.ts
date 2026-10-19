import { randomBytes } from "node:crypto";
import { join } from "node:path";

import { AiRelay } from "./ai";
import { Backend } from "./backend";
import { Frontend } from "./frontend";
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
  stop: () => Promise<void>;
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

  // Le runner d'abord : il rend au backend le résultat d'un run interrompu avant que celui-ci s'arrête.
  const stop = async () => {
    await runner.stop().catch(() => undefined);
    await proxy.stop().catch(() => undefined);
    await frontend.stop().catch(() => undefined);
    await backend.stop().catch(() => undefined);
    await ai.stop().catch(() => undefined);
    await database.stop().catch(() => undefined);
  };

  try {
    if (!database.initialized) onStep("Preparing your workspace for the first time");
    await database.init();
    onStep("Starting the database");
    await database.start();

    const origin = await proxy.reserve(settings.windowPort(account.subject));
    settings.setWindowPort(account.subject, proxy.port);
    await ai.start();
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
        runnerSecret,
      }),
      frontend.start(join(dataDir, "logs")),
    ]);
    await proxy.start(backend.port, frontend.port);
    runner.start({ apiPort: backend.port, secret: runnerSecret, dataDir });
    log.info(`TaskForce ready at ${origin}`);
    return { account, dataDir, launchToken, origin, ai, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}
