/**
 * E16, référence : la décision prise dans le runner, en TypeScript, comme aujourd'hui (`decideAll` sur les faits de
 * `toolFacts`). Premier passage dans un processus neuf (à froid), puis à chaud.
 *
 *   taskforce-runner/node_modules/.bin/tsx experiments/e16-single-engine/bench/ts-inprocess.ts [--label ts-inprocess]
 */
import { toolFacts } from "../../../taskforce-runner/src/harness/facts.js";
import { decideAll } from "../../../taskforce-runner/src/harness/rules.js";
import { arg, defaultRules, elapsedMs, loadMission, machine, prepareMission, stats, writeResult } from "./common.js";

const WARMUP_PASSES = 1000;
const MEASURED_PASSES = 200;

const label = arg("label", "ts-inprocess");
const rules = defaultRules();

// À froid : le premier passage du processus, avant toute autre décision.
const { calls: raw, workDir: coldDir } = loadMission();
const coldFacts: number[] = [];
const coldDecide: number[] = [];
for (const call of raw) {
  let t = process.hrtime.bigint();
  const facts = toolFacts(call.tool, call.input, coldDir);
  coldFacts.push(elapsedMs(t));
  t = process.hrtime.bigint();
  decideAll(rules, facts);
  coldDecide.push(elapsedMs(t));
}

// Puis la suite vérifiée contre le journal, chauffée, et mesurée à chaud.
const { calls, workDir } = prepareMission();
for (let p = 0; p < WARMUP_PASSES; p++) for (const call of calls) decideAll(rules, call.facts);

const warmDecide: number[] = [];
const warmFacts: number[] = [];
for (let p = 0; p < MEASURED_PASSES; p++) {
  for (const call of calls) {
    let t = process.hrtime.bigint();
    const facts = toolFacts(call.tool, call.input, workDir);
    warmFacts.push(elapsedMs(t));
    t = process.hrtime.bigint();
    decideAll(rules, facts);
    warmDecide.push(elapsedMs(t));
  }
}

const result = {
  experiment: "E16", label, machine: machine(), calls: calls.length,
  cold: { decide: stats(coldDecide), toolFacts: stats(coldFacts), firstDecideMs: coldDecide[0] },
  warm: { passes: MEASURED_PASSES, decide: stats(warmDecide), toolFacts: stats(warmFacts) },
};
console.log(JSON.stringify(result, null, 2));
writeResult(label, result);
