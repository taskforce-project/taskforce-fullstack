/**
 * E16 : ce que les bancs partagent. La suite d'appels d'outils de missions réelles (mission.json), les faits que le
 * runner en tire (son propre `toolFacts`), la table par défaut, les statistiques et le client HTTP.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { Agent, request } from "node:http";
import { cpus, tmpdir, type CpuInfo } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { toolFacts } from "../../../taskforce-runner/src/harness/facts.js";
import { decideAll, type Facts, type RulesBundle } from "../../../taskforce-runner/src/harness/rules.js";

export const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = join(HERE, "..", "..", "..");

export interface Expected {
  effect: "allow" | "ask" | "deny";
  rule: string | null;
}

export interface Call {
  mission: string;
  at: string;
  tool: string;
  input: Record<string, unknown>;
  /** La décision du journal, prise avec la table de règles de l'époque. */
  logged: Expected;
}

export interface PreparedCall extends Call {
  facts: Facts[];
  /** La décision du moteur du runner avec la table d'aujourd'hui : la référence des autres moteurs. */
  expect: Expected;
}

/**
 * Les règles ajoutées à la table depuis les missions du journal : seules elles peuvent changer une décision du journal
 * (#467, 02/11/2026 : `run-reads` autorise les lectures du shell que le journal montre demandées).
 */
const RULES_ADDED_SINCE_LOG: ReadonlySet<string> = new Set(["run-reads"]);

/** Remplace `${WORKDIR}` dans les chaînes de l'entrée d'un outil. */
function withWorkDir(value: unknown, workDir: string): unknown {
  if (typeof value === "string") return value.split("${WORKDIR}").join(workDir);
  if (Array.isArray(value)) return value.map((v) => withWorkDir(v, workDir));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, withWorkDir(v, workDir)]));
  }
  return value;
}

export function defaultRules(): RulesBundle {
  return JSON.parse(readFileSync(join(REPO, "contracts", "rules", "default.rules.json"), "utf8")) as RulesBundle;
}

/** La suite d'appels, entrées résolues dans une copie de travail temporaire ; rien n'est encore décidé. */
export function loadMission(): { calls: Call[]; workDir: string } {
  const workDir = mkdtempSync(join(tmpdir(), "e16-copy-"));
  writeFileSync(join(workDir, "README.md"), "# Demo\n\n## Install\n");
  mkdirSync(join(workDir, "docs"), { recursive: true });
  const raw = JSON.parse(readFileSync(join(HERE, "mission.json"), "utf8")) as { calls: Call[] };
  const calls = raw.calls.map((call) => ({ ...call, input: withWorkDir(call.input, workDir) as Record<string, unknown> }));
  return { calls, workDir };
}

/**
 * La suite, avec les faits et la décision du runner d'aujourd'hui. Chaque décision est vérifiée contre celle du
 * journal : elle doit être la même, sauf quand une règle ajoutée depuis l'emporte. La suite rejoue bien ce que les
 * missions ont vécu, sous la table actuelle.
 */
export function prepareMission(): { calls: PreparedCall[]; workDir: string; changedFromLog: string[] } {
  const { calls, workDir } = loadMission();
  const rules = defaultRules();
  const changedFromLog: string[] = [];
  const prepared = calls.map((call) => {
    const facts = toolFacts(call.tool, call.input, workDir);
    const decision = decideAll(rules, facts);
    const expect: Expected = { effect: decision.effect, rule: decision.rule ? decision.rule.id : null };
    if (!sameAs(expect, call.logged)) {
      if (!expect.rule || !RULES_ADDED_SINCE_LOG.has(expect.rule)) {
        throw new Error(`The runner does not decide ${call.tool} at ${call.at} as the log: ${expect.effect} (${expect.rule})`);
      }
      changedFromLog.push(`${call.at} ${call.tool} ${call.logged.effect} -> ${expect.effect} (${expect.rule})`);
    }
    return { ...call, facts, expect };
  });
  return { calls: prepared, workDir, changedFromLog };
}

export interface Stats {
  n: number;
  min: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  max: number;
  mean: number;
}

/** Centiles au rang le plus proche, en millisecondes, arrondis à la microseconde. */
export function stats(samples: number[]): Stats {
  const s = [...samples].sort((a, b) => a - b);
  const at = (p: number) => s[Math.max(0, Math.ceil(p * s.length) - 1)] ?? Number.NaN;
  const round = (v: number) => Math.round(v * 1000) / 1000;
  const mean = s.reduce((a, b) => a + b, 0) / Math.max(1, s.length);
  return {
    n: s.length, min: round(s[0] ?? Number.NaN), p50: round(at(0.5)), p90: round(at(0.9)), p95: round(at(0.95)),
    p99: round(at(0.99)), max: round(s[s.length - 1] ?? Number.NaN), mean: round(mean),
  };
}

export function elapsedMs(start: bigint): number {
  return Number(process.hrtime.bigint() - start) / 1e6;
}

export function writeResult(name: string, value: unknown): string {
  const dir = join(HERE, "..", "results");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${name}.json`);
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  return file;
}

export function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const value = i >= 0 ? process.argv[i + 1] : undefined;
  if (value !== undefined) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing --${name}`);
}

export interface HttpResult {
  status: number;
  body: string;
  ms: number;
}

/**
 * Un POST JSON, chronométré du départ de la requête à la réponse entière : ce qu'attendrait le runner. `agent: false`
 * ouvre une connexion neuve, fermée après la réponse ; sinon la connexion de l'agent est réutilisée.
 */
export function postJson(base: string, path: string, body: unknown, headers: Record<string, string>,
  agent: Agent | false, timeoutMs = 5000): Promise<HttpResult> {
  const payload = Buffer.from(JSON.stringify(body), "utf8");
  const url = new URL(path, base);
  return new Promise((resolve, reject) => {
    const start = process.hrtime.bigint();
    const req = request({
      hostname: url.hostname, port: url.port, path: url.pathname, method: "POST", agent,
      headers: {
        "Content-Type": "application/json", "Content-Length": String(payload.length),
        ...(agent === false ? { Connection: "close" } : {}), ...headers,
      },
      timeout: timeoutMs,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8"), ms: elapsedMs(start) }));
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end(payload);
  });
}

export function getStatus(base: string, path: string, timeoutMs = 2000): Promise<number> {
  const url = new URL(path, base);
  return new Promise((resolve) => {
    const req = request({ hostname: url.hostname, port: url.port, path: url.pathname, method: "GET", agent: false, timeout: timeoutMs },
      (res) => { res.resume(); res.on("end", () => resolve(res.statusCode ?? 0)); });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", () => resolve(0));
    req.end();
  });
}

/** Le jeton du runner, contre le secret de lancement (comme le runner de l'app desktop). Jamais affiché. */
export async function runnerToken(base: string, secret: string): Promise<string> {
  const res = await postJson(base, "/api/auth/runner/token", { clientId: "tf-runner-desktop", clientSecret: secret }, {}, false);
  if (res.status !== 200) throw new Error(`Runner token refused: HTTP ${res.status}`);
  const token = (JSON.parse(res.body) as { data?: { accessToken?: string } }).data?.accessToken;
  if (!token) throw new Error("Runner token missing from the answer");
  return token;
}

export interface Decided {
  effect: string;
  rule: string | null;
}

export function parseDecision(body: string): Decided {
  const data = (JSON.parse(body) as { data?: { effect?: string; rule?: string | null } }).data;
  return { effect: data?.effect ?? "?", rule: data?.rule ?? null };
}

export function sameAs(d: Decided, e: Expected): boolean {
  return d.effect === e.effect && d.rule === e.rule;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function machine(): Record<string, string> {
  return { node: process.version, platform: `${process.platform} ${process.arch}`, cpu: cpus()[0]?.model ?? "?", threads: String(cpus().length) };
}

/** Occupation de tous les processeurs depuis `since` (banc et backend compris), en pour cent. */
export function cpuBusy(since: CpuInfo[]): number {
  let busy = 0;
  let total = 0;
  cpus().forEach((c, i) => {
    const b = since[i]?.times;
    if (!b) return;
    const d = { user: c.times.user - b.user, nice: c.times.nice - b.nice, sys: c.times.sys - b.sys, idle: c.times.idle - b.idle, irq: c.times.irq - b.irq };
    busy += d.user + d.nice + d.sys + d.irq;
    total += d.user + d.nice + d.sys + d.irq + d.idle;
  });
  return total > 0 ? Math.round((busy / total) * 1000) / 10 : Number.NaN;
}

/** Les builds Maven d'autres sessions qui tournent en même temps (bruit de mesure possible). */
export function otherMavenBuilds(): string[] {
  const r = spawnSync("docker", ["ps", "--filter", "ancestor=maven:3.9-eclipse-temurin-21", "--format", "{{.Names}}"], { encoding: "utf8" });
  return (r.stdout ?? "").split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
}
