/**
 * E16, voie (b) : le moteur Java compilé en JavaScript par TeaVM (teavm/), chargé dans Node comme le runner le
 * chargerait. Rejoue les cas partagés (contracts/rules/cases.json : motifs, décisions, empreinte), puis la suite
 * d'appels de mission.json, à froid et à chaud, et mesure la taille du code produit.
 *
 *   taskforce-runner/node_modules/.bin/tsx experiments/e16-single-engine/bench/run-b.ts [--engine <rules-engine.js>]
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { brotliCompressSync, gzipSync } from "node:zlib";

import type { Facts } from "../../../taskforce-runner/src/harness/rules.js";
import { HERE, REPO, arg, elapsedMs, machine, prepareMission, stats, writeResult } from "./common.js";

interface Answer { effect: string; rule: string | null }
interface Engine {
  load(rules: unknown): void;
  globMatches(pattern: string, value: string): boolean;
  decide(facts: Facts): Answer;
  decideAll(factsList: Facts[]): Answer;
  /** Absente de decisions.js : les décisions seules. */
  digest?: (rules: unknown) => string;
}

interface Cases {
  globs: Array<{ pattern: string; value: string; match: boolean }>;
  decisions: Array<{ name: string; facts: Facts; expect: { effect: string; rule: string | null } }>;
  digest: { expected: string };
}

const file = arg("engine", join(HERE, "..", "teavm", "target", "js", "rules-engine.js"));
const label = arg("label", "b-teavm");
const code = readFileSync(file);
const defaults = JSON.parse(readFileSync(join(REPO, "contracts", "rules", "default.rules.json"), "utf8")) as Record<string, unknown>;
const cases = JSON.parse(readFileSync(join(REPO, "contracts", "rules", "cases.json"), "utf8")) as Cases;
const { calls } = prepareMission();

let t = process.hrtime.bigint();
const engine = (await import(pathToFileURL(file).href)) as Engine;
const importMs = elapsedMs(t);
t = process.hrtime.bigint();
engine.load(defaults);
const loadMs = elapsedMs(t);

// À froid : le premier passage de la suite, avant tout autre appel au moteur.
const cold: number[] = [];
let mismatches = 0;
for (const call of calls) {
  t = process.hrtime.bigint();
  const d = engine.decideAll(call.facts);
  cold.push(elapsedMs(t));
  if (d.effect !== call.expect.effect || d.rule !== call.expect.rule) mismatches++;
}

// Les cas partagés.
const failures: string[] = [];
for (const c of cases.globs) {
  if (engine.globMatches(c.pattern, c.value) !== c.match) failures.push(`glob ${c.pattern} on ${c.value}`);
}
for (const c of cases.decisions) {
  const d = engine.decide(c.facts);
  if (d.effect !== c.expect.effect || d.rule !== c.expect.rule) failures.push(`decision ${c.name}: ${d.effect} (${d.rule})`);
}
let digestMs = Number.NaN;
if (engine.digest) {
  t = process.hrtime.bigint();
  const digestPlain = engine.digest(defaults);
  digestMs = elapsedMs(t);
  const digestWithNulls = engine.digest({ ...defaults, digest: `sha256:${"f".repeat(64)}`, issuedAt: null });
  if (digestPlain !== cases.digest.expected) failures.push(`digest: ${digestPlain}`);
  if (digestWithNulls !== cases.digest.expected) failures.push(`digest with nulls: ${digestWithNulls}`);
} else {
  failures.push("digest: not in this module (decisions only)", "digest with nulls: not in this module (decisions only)");
}

// À chaud.
for (let p = 0; p < 1000; p++) for (const call of calls) engine.decideAll(call.facts);
const warm: number[] = [];
for (let p = 0; p < 200; p++) {
  for (const call of calls) {
    t = process.hrtime.bigint();
    engine.decideAll(call.facts);
    warm.push(elapsedMs(t));
  }
}

const result = {
  experiment: "E16", way: "b", label, machine: machine(),
  code: { file: file.split(/[\\/]/).slice(-1)[0], bytes: code.length, gzip: gzipSync(code).length, brotli: brotliCompressSync(code).length },
  cases: {
    globs: cases.globs.length, decisions: cases.decisions.length, digest: 2,
    passed: cases.globs.length + cases.decisions.length + 2 - failures.length, failures,
  },
  sequence: { calls: calls.length, mismatches },
  timing: { importMs, loadMs, firstDigestMs: digestMs, cold: stats(cold), firstDecisionMs: cold[0], warm: stats(warm) },
};
console.log(JSON.stringify(result, null, 2));
writeResult(label, result);
if (failures.length > 0 || mismatches > 0) process.exitCode = 1;
