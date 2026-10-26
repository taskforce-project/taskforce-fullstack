import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { log } from "./log";
import { freePort } from "./net";
import { emptyCluster, emptyClusterDirs, fromStore, pgcmd, postgresDir, postgresTool } from "./paths";
import { runCommand, serviceEnv, startService, type Service } from "./proc";

/** Base de l'app dans le cluster du compte. */
export const DATABASE = "taskforce";
export const DATABASE_USER = "taskforce";

/**
 * Le serveur lancé avec ce numéro de processus accepte les connexions : son fichier postmaster.pid porte ce numéro en
 * première ligne et l'état « ready » en huitième, comme `pg_ctl -w` l'attend.
 */
export function postmasterReady(pidFile: string, pid: number | undefined): boolean {
  const lines = pidFile.split(/\r?\n/);
  return pid !== undefined && Number(lines[0]) === pid && lines[7]?.trim() === "ready";
}

/** Erreur de démarrage lisible, la sortie de PostgreSQL en fin de message. */
function startError(what: string, output: string): Error {
  // PostgreSQL refuse de tourner avec les droits d'administrateur ; pg_ctl s'en retire lui-même, pas un lancement direct.
  if (/administrative permissions/i.test(output)) {
    return new Error("TaskForce cannot start its database with administrator rights: close it, then open it normally");
  }
  return new Error(`${what}: ${output.trim().slice(-500)}`);
}

/**
 * Base PostgreSQL embarquée d'un compte : un cluster dans le dossier de données du compte, démarré à l'ouverture de
 * l'app et arrêté proprement à sa fermeture. Elle n'écoute que sur 127.0.0.1 et exige un mot de passe : un autre
 * programme de la machine qui trouverait son port n'y entre pas.
 *
 * Version du Microsoft Store : Windows n'y laisse un programme du paquet en lancer un autre que directement. Passé par
 * cmd.exe, programme du système, le lancement est refusé (« Access is denied »), or initdb et `pg_ctl start` lancent
 * `postgres` par cmd.exe. Le cluster y est donc copié d'un cluster vide préparé à la construction, et l'app lance
 * `postgres` elle-même ; `pg_ctl` ne sert qu'à l'arrêter ou à voir s'il tourne, sans lancer aucun programme. Le serveur
 * vérifie aussi sa version par cmd.exe à son démarrage : COMSPEC lui donne pgcmd, livré dans le paquet (env()).
 */
export class EmbeddedPostgres {
  port = 0;
  private readonly cluster: string;
  private readonly logFile: string;
  /** Serveur lancé par l'app (version du Store) ; ailleurs, `pg_ctl` le lance hors de l'app. */
  private server: Service | null = null;

  constructor(dataDir: string, private readonly password: string, private readonly packaged = fromStore()) {
    this.cluster = join(dataDir, "postgres");
    this.logFile = join(dataDir, "logs", "postgres.log");
  }

  /**
   * Environnement des outils PostgreSQL : bibliothèques du paquet (Linux) et mot de passe. Version du Store : pgcmd à la
   * place de cmd.exe, par lequel le serveur vérifie sa version au démarrage (popen).
   */
  private env(): NodeJS.ProcessEnv {
    const env = serviceEnv({ PGPASSWORD: this.password });
    if (process.platform === "linux") {
      const lib = join(postgresDir(), "lib");
      env.LD_LIBRARY_PATH = env.LD_LIBRARY_PATH ? `${lib}:${env.LD_LIBRARY_PATH}` : lib;
    }
    if (this.packaged) {
      for (const name of Object.keys(env)) if (name.toLowerCase() === "comspec") delete env[name];
      env.ComSpec = pgcmd();
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
    if (this.packaged) await this.copyEmptyCluster();
    else await this.initdb();
    log.info("Embedded database created");
  }

  private async initdb(): Promise<void> {
    const pwfile = join(this.cluster + ".pw");
    writeFileSync(pwfile, this.password, { mode: 0o600 });
    try {
      // Mêmes options pour le cluster vide de la version du Store (scripts/prepare-resources.mjs).
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
  }

  /**
   * Version du Store : copie du cluster vide de la construction, avec ses dossiers vides, qu'un paquet ne garde pas.
   * `postgres --single`, lancé directement, remplace son mot de passe jeté par celui du compte. Tout se fait à côté et
   * n'est renommé qu'à la fin : un premier lancement interrompu ne laisse pas de cluster au mot de passe inconnu.
   */
  private async copyEmptyCluster(): Promise<void> {
    const staging = `${this.cluster}.new`;
    rmSync(staging, { recursive: true, force: true });
    cpSync(emptyCluster(), staging, { recursive: true });
    const { directories } = JSON.parse(readFileSync(emptyClusterDirs(), "utf8")) as { directories: string[] };
    for (const directory of directories) mkdirSync(join(staging, directory), { recursive: true });
    // log_min_error_statement=panic : une erreur ne recopie pas la requête, donc pas le mot de passe, dans la sortie.
    const result = await runCommand(postgresTool("postgres"), [
      "--single", "-D", staging, "-c", "exit_on_error=true", "-c", "log_min_error_statement=panic", "postgres",
    ], {
      env: this.env(),
      input: `ALTER ROLE ${DATABASE_USER} PASSWORD '${this.password.replace(/'/g, "''")}';\n`,
      timeoutMs: 60_000,
    });
    if (result.code !== 0) throw startError("The database could not be prepared", result.output);
    await renameDir(staging, this.cluster);
  }

  async start(): Promise<void> {
    await this.stopLeftover();
    this.port = await freePort();
    mkdirSync(dirname(this.logFile), { recursive: true });
    if (this.packaged) await this.launch();
    else {
      const result = await runCommand(postgresTool("pg_ctl"), [
        "-D", this.cluster, "-o", this.settings().join(" "), "-l", this.logFile, "-w", "-t", "60", "start",
      ], { env: this.env(), timeoutMs: 90_000 });
      if (result.code !== 0) throw new Error(`The database did not start: ${result.output.trim().slice(-500)}`);
    }
    await this.ensureDatabase();
    log.info(`Embedded database started on 127.0.0.1:${this.port}`);
  }

  /** Réglages d'un poste : peu de connexions, peu de mémoire, pas de socket Unix (TCP local seulement). */
  private settings(): string[] {
    return [
      "-p", String(this.port),
      "-h", "127.0.0.1",
      "-c", "unix_socket_directories=",
      "-c", "max_connections=30",
      "-c", "shared_buffers=64MB",
    ];
  }

  /** Version du Store : l'app lance le serveur et attend qu'il accepte les connexions, comme `pg_ctl -w`. */
  private async launch(): Promise<void> {
    const server = startService(postgresTool("postgres"), ["-D", this.cluster, ...this.settings()], {
      env: this.env(),
      logFile: this.logFile,
    });
    this.server = server;
    let output = "";
    server.process.stderr?.on("data", (chunk: Buffer) => (output = (output + chunk.toString()).slice(-2000)));
    const pidFile = join(this.cluster, "postmaster.pid");
    const deadline = Date.now() + 60_000;
    while (!postmasterReady(existsSync(pidFile) ? readFileSync(pidFile, "utf8") : "", server.process.pid)) {
      if (!server.running()) {
        this.server = null;
        throw startError("The database did not start", output);
      }
      if (Date.now() > deadline) {
        await this.stop();
        throw new Error("The database did not start within 60 s");
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  /**
   * Base restée ouverte par une session arrêtée de force (plantage, fin de tâche) : pg_ctl la lance hors du groupe de
   * processus de l'app, elle survit donc à l'app et garde le cluster verrouillé, et le démarrage échouerait. Personne
   * d'autre ne se sert de ce cluster : on l'arrête avant de démarrer.
   */
  private async stopLeftover(): Promise<void> {
    if (!existsSync(join(this.cluster, "postmaster.pid"))) return;
    const status = await runCommand(postgresTool("pg_ctl"), ["-D", this.cluster, "status"], { env: this.env(), timeoutMs: 15_000 })
      .catch((error: Error) => ({ code: -1, output: error.message }));
    // pg_ctl status : 0 quand le serveur tourne, 3 quand il ne tourne pas (fichier de verrou périmé, que PostgreSQL
    // remplace lui-même).
    if (status.code !== 0) return;
    log.warn("The database was still running from a previous session: stopping it");
    await this.stop();
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

  /** Copie complète de la base de l'app, au format de pg_dump que pg_restore relit (`-Fc`). */
  async dump(file: string): Promise<void> {
    mkdirSync(dirname(file), { recursive: true });
    const result = await runCommand(postgresTool("pg_dump"), [
      "-h", "127.0.0.1", "-p", String(this.port), "-U", DATABASE_USER, "-d", DATABASE, "-Fc", "-f", file,
    ], { env: this.env(), timeoutMs: 10 * 60_000 });
    if (result.code !== 0) throw new Error(`pg_dump failed: ${result.output.trim().slice(-500)}`);
  }

  async stop(): Promise<void> {
    if (!this.initialized) return;
    const result = await runCommand(postgresTool("pg_ctl"), [
      "-D", this.cluster, "-m", "fast", "-w", "-t", "30", "stop",
    ], { env: this.env(), timeoutMs: 45_000 }).catch((error: Error) => ({ code: -1, output: error.message }));
    if (result.code !== 0 && !/not running|Is server running/i.test(result.output)) {
      log.warn(`Database stop: ${result.output.trim().slice(-300)}`);
    }
    // Version du Store : le serveur, processus de l'app, est sorti avec pg_ctl stop ; s'il tourne encore, on l'arrête.
    const server = this.server;
    this.server = null;
    if (server?.running()) await server.stop();
  }

  jdbcUrl(): string {
    return `jdbc:postgresql://127.0.0.1:${this.port}/${DATABASE}`;
  }
}

/**
 * Renomme un dossier. Sous Windows, un antivirus qui lit encore les fichiers tout juste écrits le bloque un instant
 * (EPERM, EBUSY) : on réessaie pendant quelques secondes.
 */
async function renameDir(from: string, to: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      renameSync(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= 25 || (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES")) throw error;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
}
