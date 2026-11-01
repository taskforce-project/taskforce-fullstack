/**
 * E16 : le backend de la branche, lancé à côté du backend de dev partagé, jamais à sa place. Profil `desktop`, avec les
 * options de Java de l'app desktop (desktop/src/backend.ts), sur sa propre base PostgreSQL (conteneur `tf-e16-pg`).
 *
 * - `native` : le Java embarqué de l'app desktop installée, sur 127.0.0.1, comme dans l'app ;
 * - `container` : le même JAR dans un conteneur, port publié sur 127.0.0.1 par Docker Desktop.
 *
 * Les secrets sont tirés au premier lancement dans le fichier `E16_SECRETS` (hors dépôt) et jamais affichés.
 */
import { execFile, spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { elapsedMs, getStatus, sleep } from "./common.js";

export interface Secrets {
  launchToken: string;
  runnerSecret: string;
  encryptionKey: string;
  dbPassword: string;
}

export const PG_CONTAINER = "tf-e16-pg";
export const NETWORK = "tf-e16-net";
export const PG_PORT = 55432;
export const NATIVE_PORT = 18490;
export const CONTAINER_PORT = 18480;
export const CONTAINER = "tf-e16-backend";
export const IMAGE = "tf-e16-backend:exp";

/** Les options de Java de l'app desktop (desktop/src/backend.ts), au 01/11/2026. */
export const DESKTOP_JAVA_OPTS = [
  "-Xms32m", "-Xmx768m", "-XX:+UseSerialGC", "-XX:MinHeapFreeRatio=15", "-XX:MaxHeapFreeRatio=40",
  "-XX:TieredStopAtLevel=1", "-Xss512k", "-Duser.timezone=UTC", "-Dfile.encoding=UTF-8", "-Djava.awt.headless=true",
];

/**
 * `desktop` : les options de l'app telles quelles (C1 seul, `TieredStopAtLevel=1`). `c2` : les mêmes, sans
 * `TieredStopAtLevel=1`, pour séparer ce que coûte le compilateur limité de l'app de ce que coûte l'aller-retour.
 */
export function javaOpts(jvm: string): string[] {
  if (jvm === "desktop") return DESKTOP_JAVA_OPTS;
  if (jvm === "c2") return DESKTOP_JAVA_OPTS.filter((o) => o !== "-XX:TieredStopAtLevel=1");
  throw new Error("--jvm desktop|c2");
}

export function secrets(): Secrets {
  const file = process.env.E16_SECRETS;
  if (!file) throw new Error("Set E16_SECRETS to a file outside the repository");
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")) as Secrets;
  const created: Secrets = {
    launchToken: `tfd_${randomBytes(32).toString("base64url")}`,
    runnerSecret: `tfs_${randomBytes(32).toString("base64url")}`,
    encryptionKey: randomBytes(32).toString("hex"),
    dbPassword: randomBytes(24).toString("hex"),
  };
  writeFileSync(file, JSON.stringify(created), { mode: 0o600 });
  return created;
}

function docker(args: string[], allowFail = false): string {
  const r = spawnSync("docker", args, { encoding: "utf8" });
  if (r.status !== 0 && !allowFail) throw new Error(`docker ${args[0]} failed: ${r.stderr.trim().slice(0, 300)}`);
  return (r.stdout ?? "").trim();
}

/** Sans bloquer la boucle d'événements : les décisions continuent de partir pendant un arrêt ou un démarrage. */
function dockerAsync(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile("docker", args, (error, _stdout, stderr) => {
      if (error) reject(new Error(`docker ${args[0]} failed: ${String(stderr).trim().slice(0, 300)}`));
      else resolve();
    });
  });
}

/** La base de l'expérience : un PostgreSQL 18 avec pgvector, à part de la base de dev. */
export async function ensureDatabase(s: Secrets): Promise<void> {
  if (!docker(["network", "ls", "-q", "--filter", `name=^${NETWORK}$`])) docker(["network", "create", NETWORK]);
  const state = docker(["inspect", "-f", "{{.State.Running}}", PG_CONTAINER], true);
  if (state === "true") return;
  if (state === "false") docker(["start", PG_CONTAINER]);
  else {
    docker(["run", "-d", "--name", PG_CONTAINER, "--network", NETWORK, "-p", `127.0.0.1:${PG_PORT}:5432`,
      "-e", "POSTGRES_USER=taskforce", "-e", `POSTGRES_PASSWORD=${s.dbPassword}`, "-e", "POSTGRES_DB=taskforce",
      "pgvector/pgvector:pg18"]);
  }
  for (let i = 0; i < 120; i++) {
    const r = spawnSync("docker", ["exec", PG_CONTAINER, "pg_isready", "-U", "taskforce", "-d", "taskforce"], { encoding: "utf8" });
    if (r.status === 0) return;
    await sleep(500);
  }
  throw new Error("The database of the experiment did not start");
}

function desktopEnv(s: Secrets, port: number, jdbcUrl: string, dataDir: string): Record<string, string> {
  return {
    SPRING_PROFILES_ACTIVE: "desktop",
    SPRING_DATASOURCE_URL: jdbcUrl,
    SPRING_DATASOURCE_USERNAME: "taskforce",
    SPRING_DATASOURCE_PASSWORD: s.dbPassword,
    TF_DESKTOP_API_PORT: String(port),
    TF_DESKTOP_LAUNCH_TOKEN: s.launchToken,
    TF_DESKTOP_DATA_DIR: dataDir,
    TF_DESKTOP_UI_URL: "http://127.0.0.1:18499",
    TF_DESKTOP_ACCOUNT_SUBJECT: "e16-bench",
    TF_DESKTOP_ACCOUNT_EMAIL: "e16@taskforce.test",
    TF_DESKTOP_ACCOUNT_GIVEN_NAME: "E16",
    TF_DESKTOP_ACCOUNT_FAMILY_NAME: "Bench",
    TF_ENCRYPTION_KEY: s.encryptionKey,
    CORS_ALLOWED_ORIGINS: "http://127.0.0.1:18499",
    AI_SERVICE_URL: "http://127.0.0.1:9",
    AI_SERVICE_TOKEN: "unused",
    TF_DESKTOP_RUNNER_SECRET: s.runnerSecret,
  };
}

export interface Backend {
  readonly base: string;
  /** Démarre et attend `/readyz` ; rend la durée jusqu'à la première réponse 200, en millisecondes. */
  start(): Promise<number>;
  /** Arrête le backend (arrêt brutal pour `native`, comme un plantage ; arrêt propre pour `container`). */
  stop(): Promise<void>;
  describe(): Record<string, string>;
}

/** Redémarre : la durée de l'arrêt, puis celle du démarrage jusqu'à `/readyz`, en millisecondes. */
export async function restart(backend: Backend): Promise<{ stopMs: number; startMs: number }> {
  const since = process.hrtime.bigint();
  await backend.stop();
  const stopMs = elapsedMs(since);
  const startMs = await backend.start();
  return { stopMs, startMs };
}

async function waitReady(base: string, since: bigint, alive: () => boolean, timeoutMs = 240_000): Promise<number> {
  while (elapsedMs(since) < timeoutMs) {
    if (!alive()) throw new Error("The backend stopped while starting (see its log)");
    if ((await getStatus(base, "/readyz", 1000)) === 200) return elapsedMs(since);
    await sleep(100);
  }
  throw new Error("The backend was not ready in time");
}

export class NativeBackend implements Backend {
  readonly base = `http://127.0.0.1:${NATIVE_PORT}`;
  private child: ChildProcess | null = null;
  private starts = 0;

  constructor(private readonly s: Secrets, private readonly jar: string, private readonly java: string,
    private readonly workDir: string, private readonly opts: string[] = DESKTOP_JAVA_OPTS) {}

  async start(): Promise<number> {
    const dataDir = join(this.workDir, "data");
    mkdirSync(join(dataDir, "logs"), { recursive: true });
    const log = openSync(join(this.workDir, `backend-native-${++this.starts}.log`), "w");
    const env = { ...process.env, ...desktopEnv(this.s, NATIVE_PORT, `jdbc:postgresql://127.0.0.1:${PG_PORT}/taskforce`, dataDir) };
    const since = process.hrtime.bigint();
    const child = spawn(this.java, [...this.opts, "-jar", this.jar], { env, stdio: ["ignore", log, log], windowsHide: true });
    this.child = child;
    return waitReady(this.base, since, () => child.exitCode === null);
  }

  async stop(): Promise<void> {
    const child = this.child;
    if (!child || child.exitCode !== null) return;
    const exited = new Promise((r) => child.once("exit", r));
    child.kill();
    await exited;
    this.child = null;
  }

  describe(): Record<string, string> {
    const v = spawnSync(this.java, ["-version"], { encoding: "utf8" });
    return { mode: "native", java: (v.stderr || "").split("\n")[1]?.trim() ?? "?", options: this.opts.join(" ") };
  }
}

export class ContainerBackend implements Backend {
  readonly base = `http://127.0.0.1:${CONTAINER_PORT}`;

  constructor(private readonly s: Secrets, private readonly jar: string, private readonly workDir: string,
    private readonly opts: string[] = DESKTOP_JAVA_OPTS) {}

  /** L'image : celle du backend de dev pour le Java, avec le JAR de la branche. */
  build(): void {
    const ctx = join(this.workDir, "image");
    mkdirSync(ctx, { recursive: true });
    writeFileSync(join(ctx, "Dockerfile"), "FROM taskforce-app-backend:latest\nCOPY --chown=spring:spring tf-api.jar /app/app.jar\n");
    writeFileSync(join(ctx, "tf-api.jar"), readFileSync(this.jar));
    docker(["build", "-q", "-t", IMAGE, ctx]);
  }

  /** Crée le conteneur (arrêté) ; `start` le démarre. */
  create(): void {
    docker(["rm", "-f", CONTAINER], true);
    const env = desktopEnv(this.s, 8080, `jdbc:postgresql://${PG_CONTAINER}:5432/taskforce`, "/tmp/tf-e16-data");
    const args = ["create", "--name", CONTAINER, "--network", NETWORK, "-p", `127.0.0.1:${CONTAINER_PORT}:8080`,
      "-e", `JAVA_OPTS=${this.opts.join(" ")}`, "-e", "SERVER_ADDRESS=0.0.0.0"];
    for (const [k, v] of Object.entries(env)) args.push("-e", `${k}=${v}`);
    docker([...args, IMAGE]);
  }

  async start(): Promise<number> {
    const since = process.hrtime.bigint();
    await dockerAsync(["start", CONTAINER]);
    return waitReady(this.base, since, () => true);
  }

  async stop(): Promise<void> {
    await dockerAsync(["stop", "-t", "15", CONTAINER]).catch(() => undefined);
  }

  remove(): void {
    docker(["rm", "-f", CONTAINER], true);
  }

  describe(): Record<string, string> {
    const v = spawnSync("docker", ["exec", CONTAINER, "java", "-version"], { encoding: "utf8" });
    return { mode: "container", java: (v.stderr || "").split("\n")[1]?.trim() ?? "?", options: this.opts.join(" ") };
  }
}
