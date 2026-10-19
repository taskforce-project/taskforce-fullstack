import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { log } from "./log";
import { freePort } from "./net";
import { postgresDir, postgresTool } from "./paths";
import { runCommand, serviceEnv } from "./proc";

/** Base de l'app dans le cluster du compte. */
export const DATABASE = "taskforce";
export const DATABASE_USER = "taskforce";

/**
 * Base PostgreSQL embarquée d'un compte : un cluster dans le dossier de données du compte, démarré à l'ouverture de
 * l'app et arrêté proprement à sa fermeture. Elle n'écoute que sur 127.0.0.1 et exige un mot de passe : un autre
 * programme de la machine qui trouverait son port n'y entre pas.
 */
export class EmbeddedPostgres {
  port = 0;
  private readonly cluster: string;
  private readonly logFile: string;

  constructor(dataDir: string, private readonly password: string) {
    this.cluster = join(dataDir, "postgres");
    this.logFile = join(dataDir, "logs", "postgres.log");
  }

  /** Environnement des outils PostgreSQL : bibliothèques du paquet (Linux) et mot de passe. */
  private env(): NodeJS.ProcessEnv {
    const env = serviceEnv({ PGPASSWORD: this.password });
    if (process.platform === "linux") {
      const lib = join(postgresDir(), "lib");
      env.LD_LIBRARY_PATH = env.LD_LIBRARY_PATH ? `${lib}:${env.LD_LIBRARY_PATH}` : lib;
    }
    return env;
  }

  get initialized(): boolean {
    return existsSync(join(this.cluster, "PG_VERSION"));
  }

  /** Crée le cluster au premier lancement du compte (quelques secondes, une seule fois). */
  async init(): Promise<void> {
    if (this.initialized) return;
    mkdirSync(join(this.cluster, ".."), { recursive: true });
    rmSync(this.cluster, { recursive: true, force: true });
    const pwfile = join(this.cluster + ".pw");
    writeFileSync(pwfile, this.password, { mode: 0o600 });
    try {
      const result = await runCommand(postgresTool("initdb"), [
        "-D", this.cluster,
        "-U", DATABASE_USER,
        "-A", "scram-sha-256",
        `--pwfile=${pwfile}`,
        "-E", "UTF8",
        // Locale intégrée : même tri et mêmes majuscules sur Windows, macOS et Linux, sans ICU.
        "--locale-provider=builtin",
        "--builtin-locale=C.UTF-8",
      ], { env: this.env(), timeoutMs: 120_000 });
      if (result.code !== 0) throw new Error(`initdb failed: ${result.output.trim().slice(-500)}`);
    } finally {
      rmSync(pwfile, { force: true });
    }
    log.info("Embedded database created");
  }

  async start(): Promise<void> {
    this.port = await freePort();
    mkdirSync(dirname(this.logFile), { recursive: true });
    // Réglages d'un poste : peu de connexions, peu de mémoire, pas de socket Unix (TCP local seulement).
    const options = [
      `-p ${this.port}`,
      "-h 127.0.0.1",
      "-c unix_socket_directories=",
      "-c max_connections=30",
      "-c shared_buffers=64MB",
    ].join(" ");
    const result = await runCommand(postgresTool("pg_ctl"), [
      "-D", this.cluster, "-o", options, "-l", this.logFile, "-w", "-t", "60", "start",
    ], { env: this.env(), timeoutMs: 90_000 });
    if (result.code !== 0) throw new Error(`The database did not start: ${result.output.trim().slice(-500)}`);
    await this.ensureDatabase();
    log.info(`Embedded database started on 127.0.0.1:${this.port}`);
  }

  /** Crée la base de l'app si elle manque (premier lancement). */
  private async ensureDatabase(): Promise<void> {
    const psql = (sql: string) => runCommand(postgresTool("psql"), [
      "-h", "127.0.0.1", "-p", String(this.port), "-U", DATABASE_USER, "-d", "postgres",
      "-v", "ON_ERROR_STOP=1", "-tAc", sql,
    ], { env: this.env(), timeoutMs: 30_000 });
    const exists = await psql(`SELECT 1 FROM pg_database WHERE datname = '${DATABASE}'`);
    if (exists.code !== 0) throw new Error(`The database is not reachable: ${exists.output.trim()}`);
    if (exists.output.trim() !== "1") {
      const created = await psql(`CREATE DATABASE ${DATABASE}`);
      if (created.code !== 0) throw new Error(`Could not create the database: ${created.output.trim()}`);
    }
  }

  async stop(): Promise<void> {
    if (!this.initialized) return;
    const result = await runCommand(postgresTool("pg_ctl"), [
      "-D", this.cluster, "-m", "fast", "-w", "-t", "30", "stop",
    ], { env: this.env(), timeoutMs: 45_000 }).catch((error: Error) => ({ code: -1, output: error.message }));
    if (result.code !== 0 && !/not running|Is server running/i.test(result.output)) {
      log.warn(`Database stop: ${result.output.trim().slice(-300)}`);
    }
  }

  jdbcUrl(): string {
    return `jdbc:postgresql://127.0.0.1:${this.port}/${DATABASE}`;
  }
}
