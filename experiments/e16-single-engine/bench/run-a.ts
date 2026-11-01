/**
 * E16, voie (a) : le runner demande chaque décision au backend Java de la machine. Rejoue la suite d'appels de
 * mission.json contre l'endpoint de la branche (`POST /api/delivery/runner/rules/decide`) :
 *
 * 1. à froid : plusieurs démarrages, et le premier passage de la suite juste après chacun ;
 * 2. à chaud : connexion gardée ouverte (keep-alive), puis une connexion neuve par décision ;
 * 3. au rythme d'une mission : les écarts du journal, plafonnés à 5 s ;
 * 4. pendant un redémarrage : une décision toutes les 50 ms, avant, pendant et après.
 *
 *   E16_SECRETS=<fichier hors dépôt> E16_JAR=<tf-api.jar> \
 *   taskforce-runner/node_modules/.bin/tsx experiments/e16-single-engine/bench/run-a.ts --mode native|container
 */
import { Agent } from "node:http";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { cpus } from "node:os";

import { ContainerBackend, NativeBackend, ensureDatabase, javaOpts, restart, secrets, type Backend } from "./backend.js";
import {
  arg, cpuBusy, elapsedMs, machine, otherMavenBuilds, parseDecision, postJson, prepareMission, runnerToken, sameAs,
  sleep, stats, writeResult, type PreparedCall,
} from "./common.js";

const DECIDE = "/api/delivery/runner/rules/decide";
const mode = arg("mode");
const jvm = arg("jvm", "desktop");
const label = arg("label", `a-${mode}${jvm === "desktop" ? "" : `-${jvm}`}`);
const mavenAtStart = otherMavenBuilds();
const coldStarts = Number(arg("cold-starts", "3"));
const warmupDecisions = Number(arg("warmup", "2000"));
const warmPasses = Number(arg("warm-passes", "200"));
const freshPasses = Number(arg("fresh-passes", "20"));
const pacedCapMs = Number(arg("paced-cap-ms", "5000"));
const restartIntervalMs = Number(arg("restart-interval-ms", "50"));

const s = secrets();
const jar = process.env.E16_JAR;
if (!jar) throw new Error("Set E16_JAR to the backend JAR of the branch");
const workDir = join(process.env.E16_WORK ?? tmpdir(), `e16-${mode}`);
mkdirSync(workDir, { recursive: true });

let backend: Backend;
if (mode === "native") {
  const java = process.env.E16_JAVA ?? "C:/Users/pierr/AppData/Local/Programs/taskforce-desktop/resources/jre/bin/java.exe";
  backend = new NativeBackend(s, jar, java, workDir, javaOpts(jvm));
} else if (mode === "container") {
  const c = new ContainerBackend(s, jar, workDir, javaOpts(jvm));
  c.build();
  c.create();
  backend = c;
} else throw new Error("--mode native|container");

const { calls } = prepareMission();
let mismatches = 0;

async function decide(call: PreparedCall, token: string, agent: Agent | false): Promise<number> {
  const res = await postJson(backend.base, DECIDE, { facts: call.facts }, { Authorization: `Bearer ${token}` }, agent);
  if (res.status !== 200) throw new Error(`HTTP ${res.status} on ${call.tool} at ${call.at}`);
  if (!sameAs(parseDecision(res.body), call.expect)) mismatches++;
  return res.ms;
}

async function pass(token: string, agent: Agent | false, into: number[]): Promise<void> {
  for (const call of calls) into.push(await decide(call, token, agent));
}

await ensureDatabase(s);

// 1. À froid : chaque démarrage, puis le premier passage de la suite.
const starts: Array<{ readyMs: number; tokenMs: number; firstDecisionMs: number; pass: ReturnType<typeof stats> }> = [];
const coldAll: number[] = [];
let description: Record<string, string> = {};
for (let i = 0; i < coldStarts; i++) {
  await backend.stop();
  const readyMs = await backend.start();
  if (i === 0) description = backend.describe();
  const t = process.hrtime.bigint();
  const token = await runnerToken(backend.base, s.runnerSecret);
  const tokenMs = elapsedMs(t);
  const agent = new Agent({ keepAlive: true, maxSockets: 1 });
  const samples: number[] = [];
  await pass(token, agent, samples);
  agent.destroy();
  coldAll.push(...samples);
  starts.push({ readyMs: Math.round(readyMs), tokenMs: Math.round(tokenMs * 1000) / 1000, firstDecisionMs: samples[0] ?? Number.NaN, pass: stats(samples) });
  console.log(`cold start ${i + 1}: ready in ${Math.round(readyMs)} ms, first decision ${samples[0]?.toFixed(2)} ms`);
}

// 2. À chaud.
const token = await runnerToken(backend.base, s.runnerSecret);
const keep = new Agent({ keepAlive: true, maxSockets: 1 });
for (let i = 0; i < warmupDecisions; i++) {
  const call = calls[i % calls.length];
  if (call) await decide(call, token, keep);
}
const warmCpu = cpus();
const warm: number[] = [];
for (let p = 0; p < warmPasses; p++) await pass(token, keep, warm);
const warmBusy = cpuBusy(warmCpu);
const fresh: number[] = [];
for (let p = 0; p < freshPasses; p++) await pass(token, false, fresh);
console.log(`warm keep-alive p50 ${stats(warm).p50} ms p95 ${stats(warm).p95} ms; new connection p95 ${stats(fresh).p95} ms`);

// 3. Au rythme d'une mission : l'écart réel entre deux décisions du journal, plafonné.
const paced: number[] = [];
const gaps: number[] = [];
for (let i = 0; i < calls.length; i++) {
  const call = calls[i];
  const prev = calls[i - 1];
  if (!call) continue;
  if (prev && prev.mission === call.mission) {
    const gap = Math.min(pacedCapMs, Date.parse(call.at) - Date.parse(prev.at));
    gaps.push(gap);
    await sleep(gap);
  }
  paced.push(await decide(call, token, keep));
}
keep.destroy();
console.log(`paced p50 ${stats(paced).p50} ms p95 ${stats(paced).p95} ms`);

// 4. Pendant un redémarrage. Sans réponse, le runner refuserait l'action (R90) : chaque échec est une action refusée.
interface Attempt { t: number; ms: number; status: number; error?: string }
const attempts: Attempt[] = [];
let current = await runnerToken(backend.base, s.runnerSecret);
const loopAgent = new Agent({ keepAlive: true, maxSockets: 1 });
const t0 = process.hrtime.bigint();
let restarted: { stopMs: number; startMs: number } | null = null;
let restartAt = Number.NaN;
const after: number[] = [];
let failedOnce = false;
const loop = (async () => {
  for (let i = 0; ; i++) {
    const call = calls[i % calls.length];
    if (!call) break;
    const t = elapsedMs(t0);
    const start = process.hrtime.bigint();
    try {
      const res = await postJson(backend.base, DECIDE, { facts: call.facts }, { Authorization: `Bearer ${current}` }, loopAgent, 2000);
      attempts.push({ t, ms: res.ms, status: res.status });
      if (res.status === 401) {
        failedOnce = true;
        // Les jetons du runner ne survivent pas au redémarrage : il en redemande un, comme au lancement.
        current = await runnerToken(backend.base, s.runnerSecret).catch(() => current);
      } else if (res.status === 200 && failedOnce) {
        // Les premières décisions du backend redémarré : à froid.
        after.push(res.ms);
        if (after.length >= calls.length && restarted) break;
      } else if (res.status !== 200) {
        failedOnce = true;
      }
    } catch (e) {
      failedOnce = true;
      attempts.push({ t, ms: elapsedMs(start), status: 0, error: (e as NodeJS.ErrnoException).code ?? (e as Error).message });
    }
    await sleep(restartIntervalMs);
  }
})();
await sleep(3000);
restartAt = elapsedMs(t0);
restarted = await restart(backend);
await loop;
loopAgent.destroy();

// La fenêtre sans décision : de la dernière réponse avant le premier échec à la première réponse après le dernier.
// (Un arrêt propre laisse le backend répondre encore un moment après le début du redémarrage.)
const failed = attempts.filter((a) => a.status !== 200);
const firstFail = failed[0]?.t ?? Number.NaN;
const lastFail = failed[failed.length - 1]?.t ?? Number.NaN;
const lastOkBefore = [...attempts].filter((a) => a.status === 200 && a.t < firstFail).pop();
const firstOkAfter = attempts.find((a) => a.status === 200 && a.t > lastFail);
const errors: Record<string, number> = {};
for (const a of failed) errors[a.error ?? `HTTP ${a.status}`] = (errors[a.error ?? `HTTP ${a.status}`] ?? 0) + 1;
const restartResult = {
  intervalMs: restartIntervalMs,
  restartAtMs: Math.round(restartAt),
  stopMs: Math.round(restarted?.stopMs ?? Number.NaN),
  startToReadyMs: Math.round(restarted?.startMs ?? Number.NaN),
  noDecisionWindowMs: Math.round((firstOkAfter?.t ?? Number.NaN) - (lastOkBefore?.t ?? Number.NaN)),
  refusedDecisions: failed.length,
  errors,
  failedAttemptMs: stats(failed.map((a) => a.ms)),
  firstDecisionsAfter: stats(after),
  firstDecisionAfterMs: after[0],
  // Chaque tentative : départ depuis le début de la boucle, durée, statut HTTP (0 : erreur réseau) et erreur.
  attempts: attempts.map((a) => [Math.round(a.t), Math.round(a.ms * 1000) / 1000, a.status, a.error ?? ""]),
};
console.log(`restart: no decision for ${restartResult.noDecisionWindowMs} ms, ${failed.length} refused`);
await backend.stop();

const result = {
  experiment: "E16", way: "a", mode, jvm, at: new Date().toISOString(), machine: machine(), backend: description,
  otherMavenBuilds: { atStart: mavenAtStart, atEnd: otherMavenBuilds() },
  calls: calls.length, mismatches,
  cold: { starts, all: stats(coldAll) },
  warm: { warmupDecisions, cpuBusyPercent: warmBusy, keepAlive: stats(warm), newConnection: stats(fresh) },
  paced: { capMs: pacedCapMs, gaps: stats(gaps), latency: stats(paced) },
  restart: restartResult,
};
console.log(JSON.stringify(result, null, 2));
writeResult(label, result);
if (mismatches > 0) process.exitCode = 1;
