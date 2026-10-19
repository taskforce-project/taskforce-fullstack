import { join } from "node:path";

import type { Account } from "./settings";
import { log } from "./log";
import { freePort, waitForOk } from "./net";
import { backendJar, javaPath } from "./paths";
import { serviceEnv, startService, type Service } from "./proc";
import { DATABASE_USER, type EmbeddedPostgres } from "./postgres";

export interface BackendOptions {
  account: Account;
  dataDir: string;
  database: EmbeddedPostgres;
  databasePassword: string;
  encryptionKey: string;
  launchToken: string;
  /** Origine de la fenêtre (relais local), seule origine admise par l'API. */
  uiOrigin: string;
}

/**
 * Backend Spring Boot de l'app, en profil `desktop` (cf. application-desktop.yml), avec le Java embarqué. Il n'écoute
 * que sur 127.0.0.1 et n'accepte que le jeton de lancement tiré par la coque.
 */
export class Backend {
  port = 0;
  private service: Service | null = null;

  async start(options: BackendOptions): Promise<void> {
    this.port = await freePort();
    const env = serviceEnv({
      SPRING_PROFILES_ACTIVE: "desktop",
      SPRING_DATASOURCE_URL: options.database.jdbcUrl(),
      SPRING_DATASOURCE_USERNAME: DATABASE_USER,
      SPRING_DATASOURCE_PASSWORD: options.databasePassword,
      TF_DESKTOP_API_PORT: String(this.port),
      TF_DESKTOP_LAUNCH_TOKEN: options.launchToken,
      TF_DESKTOP_DATA_DIR: options.dataDir,
      TF_DESKTOP_UI_URL: options.uiOrigin,
      TF_DESKTOP_ACCOUNT_SUBJECT: options.account.subject,
      TF_DESKTOP_ACCOUNT_EMAIL: options.account.email,
      TF_DESKTOP_ACCOUNT_GIVEN_NAME: options.account.givenName,
      TF_DESKTOP_ACCOUNT_FAMILY_NAME: options.account.familyName,
      TF_ENCRYPTION_KEY: options.encryptionKey,
      CORS_ALLOWED_ORIGINS: options.uiOrigin,
    });
    const args = [
      // Une personne, un poste : peu de mémoire, démarrage rapide plutôt que débit maximal.
      "-Xms128m",
      "-Xmx768m",
      "-XX:+UseSerialGC",
      "-XX:TieredStopAtLevel=1",
      "-Xss512k",
      "-Dfile.encoding=UTF-8",
      "-Djava.awt.headless=true",
      "-jar",
      backendJar(),
    ];
    const started = Date.now();
    this.service = startService(javaPath(), args, { env, logFile: join(options.dataDir, "logs", "backend.log") });
    const service = this.service;
    await waitForOk(this.port, "/readyz", 180_000, () => service.running());
    log.info(`Backend ready on 127.0.0.1:${this.port} in ${Math.round((Date.now() - started) / 100) / 10} s`);
  }

  async stop(): Promise<void> {
    await this.service?.stop();
    this.service = null;
  }
}
