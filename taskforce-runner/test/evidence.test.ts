import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import { ApiError, type RunnerEvent } from "../src/api.js";
import { SessionRecord } from "../src/agent.js";
import { EventRelay } from "../src/events.js";
import { headerOf, keyId, openSeal, pae, PAYLOAD_TYPE, PREDICATE_TYPE, STATEMENT_TYPE, trustedKeyId } from "../src/harness/verifier/dossier.js";
import { bundleDigest, canonicalJson, chain, type EventInput, type Json, type RulesBundle } from "../src/harness/engine/rules-engine.js";
import { verifyEvidence } from "../src/harness/verify.js";
import { contentHash, inputHash, sensitivePath, sha256, written } from "../src/harness/written.js";
import { agentInfo } from "../src/stream.js";
import { fullOutput, runProjectTests, ApprovedTests } from "../src/tests.js";

/**
 * Le dossier complet et signé (TF-J2-7) côté runner : chaque événement numéroté et renvoyé tant qu'il ne part pas,
 * l'action exacte d'une écriture, la session brute gardée à part, et le vérificateur qui lit la chaîne, l'en-tête, les
 * textes, les règles rejugées, le sceau et le témoin d'un dossier exporté, sans TaskForce ni réseau.
 */

const WORK = mkdtempSync(join(tmpdir(), "tf-evidence-"));
after(() => rmSync(WORK, { recursive: true, force: true }));

const contract = <T>(path: string): T => JSON.parse(readFileSync(new URL(`../../contracts/${path}`, import.meta.url), "utf8")) as T;
const DEFAULT_RULES = contract<RulesBundle>("rules/default.rules.json");

describe("un trou se voit : les événements du run, numérotés et renvoyés", () => {
  it("chaque événement porte son numéro, d'un bout à l'autre du run, et le compte le dit", async () => {
    const sent: RunnerEvent[] = [];
    const relay = new EventRelay({ events: async (_runId, batch) => { sent.push(...batch); } }, 42, { flushMs: 10_000, maxBatch: 2 });
    relay.push([{ kind: "brief", text: "b", body: "the brief" }, { kind: "agent", text: "a" }, { kind: "tool", text: "Read" }]);
    await relay.flush();
    relay.push([{ kind: "exit", text: "git push", effect: "allow" }]);
    await relay.close();
    assert.deepEqual(sent.map((e) => e.n), [1, 2, 3, 4]);
    assert.equal(relay.count, 4);
    assert.equal(relay.pending, 0);
  });

  it("un lot qui ne part pas repart plus tard, avant les suivants : rien ne se perd, l'ordre tient", async () => {
    const sent: number[] = [];
    let calls = 0;
    const relay = new EventRelay({
      events: async (_runId, batch) => {
        calls++;
        if (calls === 1) throw new Error("TaskForce restarting");
        sent.push(...batch.map((e) => e.n ?? 0));
      },
    }, 42, { flushMs: 10_000, maxBatch: 2, retryMs: 1 });
    relay.push([{ kind: "tool", text: "1" }, { kind: "tool", text: "2" }]);
    await relay.flush();
    relay.push([{ kind: "tool", text: "3" }]);
    await relay.close();
    assert.deepEqual(sent, [1, 2, 3]);
  });

  it("un lot que TaskForce refuse pour de bon (400) est laissé : la suite part, et le dossier marque le trou", async () => {
    const sent: number[] = [];
    let calls = 0;
    const relay = new EventRelay({
      events: async (_runId, batch) => {
        calls++;
        if (calls === 1) throw new ApiError(400, "rule: size must be between 0 and 80");
        sent.push(...batch.map((e) => e.n ?? 0));
      },
    }, 42, { flushMs: 10_000, maxBatch: 1, retryMs: 1 });
    relay.push([{ kind: "decision", text: "x" }, { kind: "tool", text: "y" }]);
    await relay.close();
    assert.deepEqual(sent, [2]);
    assert.equal(relay.count, 2);
  });

  it("une fois fermé, le relais ne prend plus rien", async () => {
    const relay = new EventRelay({ events: async () => undefined }, 42, { flushMs: 10_000 });
    await relay.close();
    relay.push([{ kind: "tool", text: "late" }]);
    assert.equal(relay.count, 0);
  });
});

describe("l'action exacte d'une écriture : l'empreinte de ce que le fichier contiendra", () => {
  const file = join(WORK, "footer.tsx");
  writeFileSync(file, "const a = 'old';\nconst b = 'old';\n", "utf8");

  it("Write : le contenu tel qu'il s'écrira", () => {
    const w = written("Write", { file_path: join(WORK, "new.ts"), content: "export const x = 1;\n" }, WORK);
    assert.deepEqual(w, { path: "new.ts", sha256: sha256("export const x = 1;\n"), bytes: 20 });
  });

  it("Edit : le fichier tel qu'il sera après le remplacement, une fois ou partout", () => {
    assert.equal(written("Edit", { file_path: file, old_string: "'old'", new_string: "'new'" }, WORK)?.sha256,
      sha256("const a = 'new';\nconst b = 'old';\n"));
    assert.equal(written("Edit", { file_path: file, old_string: "'old'", new_string: "'$&'", replace_all: true }, WORK)?.sha256,
      sha256("const a = '$&';\nconst b = '$&';\n"));
  });

  it("MultiEdit : chaque remplacement à la suite", () => {
    assert.equal(written("MultiEdit", { file_path: file, edits: [
      { old_string: "const a", new_string: "let a" }, { old_string: "const b", new_string: "let b" }] }, WORK)?.sha256,
    sha256("let a = 'old';\nlet b = 'old';\n"));
  });

  it("sans empreinte quand on ne sait pas la calculer, ou qu'on ne doit pas : un secret, un texte absent, un carnet", () => {
    assert.deepEqual(written("Write", { file_path: ".env", content: "TOKEN=1234" }, WORK), { path: ".env" });
    assert.ok(sensitivePath("config/credentials.json"));
    assert.deepEqual(written("Edit", { file_path: file, old_string: "absent", new_string: "x" }, WORK), { path: "footer.tsx" });
    assert.deepEqual(written("NotebookEdit", { notebook_path: "a.ipynb", new_source: "x" }, WORK), { path: "a.ipynb" });
    assert.equal(written("Read", { file_path: file }, WORK), null);
    assert.equal(written("Edit", { file_path: join(WORK, "missing.ts"), old_string: "a", new_string: "b" }, WORK)?.sha256, undefined);
  });

  it("le relevé final porte l'empreinte du contenu qui reste : la même que l'écriture qui l'a laissé", () => {
    writeFileSync(join(WORK, "kept.ts"), "export const x = 1;\n", "utf8");
    assert.deepEqual(contentHash(join(WORK, "kept.ts")), { sha256: sha256("export const x = 1;\n"), bytes: 20 });
    assert.equal(contentHash(join(WORK, "nothing.ts")), null);
  });

  it("l'entrée d'un outil : l'empreinte de son JSON canonique, quel que soit l'ordre de ses clés", () => {
    assert.equal(inputHash({ b: 1, a: "x" }), inputHash({ a: "x", b: 1 }));
    assert.equal(inputHash({ a: "x" }), sha256('{"a":"x"}'));
    assert.match(inputHash({ score: 0.5 }) ?? "", /^sha256:[0-9a-f]{64}$/);
  });
});

describe("l'agent réellement lancé et sa session brute, gardée à part", () => {
  it("la ligne de démarrage dit la version, le modèle et la session ; les autres lignes rien", () => {
    assert.deepEqual(agentInfo({ type: "system", subtype: "init", model: "claude-sonnet-5-20261001", claude_code_version: "2.1.300",
      session_id: "4f1c9a52" }), { version: "2.1.300", model: "claude-sonnet-5-20261001", session: "4f1c9a52" });
    assert.deepEqual(agentInfo({ type: "system", subtype: "init" }), {});
    assert.equal(agentInfo({ type: "assistant" }), null);
    assert.equal(agentInfo("text"), null);
  });

  it("la session brute : chaque ligne gardée sur le poste, et son empreinte", () => {
    const file = join(WORK, "evidence", "run-42", "session.jsonl");
    const record = new SessionRecord(file);
    record.line('{"type":"system"}');
    record.line('{"type":"result"}');
    const text = '{"type":"system"}\n{"type":"result"}\n';
    assert.deepEqual(record.digest(), { sha256: sha256(text), bytes: Buffer.byteLength(text) });
    assert.equal(readFileSync(file, "utf8"), text);
  });

  it("les tests : l'empreinte de la sortie entière, la preuve, gardée sur le poste", async () => {
    const outputFile = join(WORK, "evidence", "run-42", "tests.log");
    const approved = new ApprovedTests(join(WORK, "approved.json"));
    approved.add("acme/website", "npm test");
    const result = await runProjectTests("npm test", "acme/website", WORK, 1_000, {
      ask: async () => true, approved, outputFile,
      shell: async () => ({ code: 0, stdout: "Tests  48 passed (48)", stderr: "", timedOut: false, aborted: false }),
    });
    const all = fullOutput({ stdout: "Tests  48 passed (48)", stderr: "" });
    assert.deepEqual(result.output, { sha256: sha256(all), bytes: Buffer.byteLength(all) });
    assert.equal(readFileSync(outputFile, "utf8"), all);
  });
});


/** L'identifiant d'une clé, calculé ici avec Node, pour le comparer à celui du vérificateur (Web Crypto). */
const nodeKeyId = (spki: Buffer): string => `sha256:${createHash("sha256").update(spki).digest("hex")}`;

/** Un dossier scellé, écrit ici comme le serveur l'écrit (MissionEvidenceService, EvidenceSeal). */
function dossier(options: {
  key?: KeyObject; tamper?: (file: Record<string, unknown>) => void; seal?: boolean; sealedRoot?: string;
  /** Change les événements avant que la chaîne ne les lie : ce que le serveur aurait écrit. */
  edit?: (events: EventInput[]) => void;
} = {}) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const key = options.key ?? privateKey;
  const spki = Buffer.from(publicKey.export({ format: "der", type: "spki" }));
  const rules = { ...DEFAULT_RULES };
  rules.digest = bundleDigest(rules);
  const title = "Fix the footer links";
  const salt = "0123456789abcdef0123456789abcdef";
  const titleHash = sha256(`${salt}${title}`);
  const events: EventInput[] = [
    { seq: 1, at: "2026-11-22T08:00:00.000Z", type: "mission.started", actor: { kind: "server", id: "taskforce" }, data: {
      mission: 42, workspace: "acme", project: 12, issue: "WEB-48", requestedBy: "ada@example.com", accountable: "ada@example.com",
      request: { title: { sha256: titleHash, chars: title.length }, description: null, reporter: "grace@example.com" },
      agent: { kind: "claude-code", model: "sonnet" }, rules: { version: rules.version, digest: rules.digest, layers: [] },
      runner: "tf-runner-ada", taskforce: null } as Json },
    { seq: 2, at: "2026-11-22T08:00:02.000Z", type: "note", actor: { kind: "agent", id: "claude-code" },
      data: { kind: "agent", version: "2.1.300", model: "claude-sonnet-5-20261001" } },
    { seq: 3, at: "2026-11-22T08:00:05.000Z", type: "action.decided", actor: { kind: "rule", id: "read-files" },
      data: { kind: "decision", tool: "Read", effect: "allow", facts: [{ action: "file.read", tool: "Read", path: "src/a.ts" }] } },
    { seq: 4, at: "2026-11-22T08:00:06.000Z", type: "note", actor: { kind: "server", id: "taskforce" },
      data: { kind: "gap", from: 4, to: 5, text: "Events 4 to 5 from the runner never arrived." } },
    { seq: 5, at: "2026-11-22T08:10:00.000Z", type: "mission.ended", actor: { kind: "server", id: "taskforce" },
      data: { status: "DONE", resultUrl: "https://github.com/acme/website/pull/212" } },
  ];
  options.edit?.(events);
  const chained = chain(events);
  const head = chained.at(-1);
  const mission = headerOf(chained).header;
  const file: Record<string, unknown> = { format: "taskforce-evidence/1", mission, events: chained, root: head?.hash, rules,
    texts: { [titleHash]: { salt, text: title } } };
  if (options.seal !== false) {
    const root = options.sealedRoot ?? head?.hash;
    const statement = { _type: STATEMENT_TYPE, subject: [{ name: "taskforce-mission-42", digest: { sha256: String(root).slice(7) } }],
      predicateType: PREDICATE_TYPE, predicate: { format: "taskforce-evidence/1", mission, root, seq: chained.length,
        sealedAt: "2026-11-22T08:10:00.100Z", key: { id: nodeKeyId(spki), algorithm: "ed25519", publicKey: spki.toString("base64"),
          custody: "same-machine", kept: true } } };
    const payload = Buffer.from(canonicalJson(statement as Json), "utf8");
    file.seal = { payload: payload.toString("base64"), payloadType: PAYLOAD_TYPE,
      signatures: [{ keyid: nodeKeyId(spki), sig: sign(null, pae(PAYLOAD_TYPE, new Uint8Array(payload)), key).toString("base64") }] };
  }
  options.tamper?.(file);
  return { text: JSON.stringify(file), id: nodeKeyId(spki), publicKey, titleHash };
}

const fails = async (text: string, pattern: RegExp): Promise<void> => {
  const verdict = await verifyEvidence(text);
  assert.equal(verdict.ok, false, verdict.message);
  assert.match(verdict.message, pattern);
};

describe("le vérificateur du runner, sans TaskForce ni réseau", () => {
  it("un dossier intact et scellé tient : la chaîne, l'en-tête, les textes, les règles rejugées ; il dit ce qu'il ne prouve pas", async () => {
    const { text } = dossier();
    const verdict = await verifyEvidence(text);
    assert.equal(verdict.ok, true, verdict.message);
    assert.match(verdict.message, /^Every hash holds: 5 events, root sha256:[0-9a-f]+\. Signed by a key the file carries itself: anyone can make this seal/);
    assert.equal(verdict.seal, "self");
    assert.match(verdict.message, /\[ok\] The header comes from the chain/);
    assert.match(verdict.message, /\[ok\] The 1 texts kept beside the chain match their digests/);
    assert.match(verdict.message, /judging the 1 recorded actions again gives the same decisions/);
    assert.match(verdict.message, /\[!!\] Event 4: Events 4 to 5 from the runner never arrived/);
    assert.match(verdict.message, /\[!!\] Sealed at event 5 .*by the key the file carries .*anyone can make such a seal/);
    assert.match(verdict.message, /\[!!\] Key custody: the signing key is on the same machine as the agent/);
    assert.match(verdict.message, /\[!!\] No witness was written in the pull request/);
  });

  it("avec la clé que l'exploitant publie : son identifiant, ou sa clé publique", async () => {
    const { text, id, publicKey } = dossier();
    const trusted = await verifyEvidence(text, { key: id });
    assert.equal(trusted.seal, "trusted");
    assert.match(trusted.message, /^Every hash holds: .* Sealed by the key you trust\./);
    assert.match(trusted.message, /\[ok\] Sealed at event 5 .*by the key you trust/);
    const pem = publicKey.export({ format: "pem", type: "spki" }).toString();
    assert.equal(await trustedKeyId(pem), id);
    assert.equal(await trustedKeyId(Buffer.from(publicKey.export({ format: "der", type: "spki" })).toString("base64")), id);
    const other = generateKeyPairSync("ed25519").publicKey.export({ format: "pem", type: "spki" }).toString();
    const verdict = await verifyEvidence(text, { key: other });
    assert.equal(verdict.ok, false);
    assert.match(verdict.message, /not by the key you trust/);
    assert.match((await verifyEvidence(text, { key: "nonsense" })).message, /cannot be read/);
  });

  it("un en-tête changé après coup se voit : la chaîne dit autre chose", async () => {
    await fails(dossier({ tamper: (f) => { (f.mission as Record<string, unknown>).requestedBy = "mallory@example.com"; } }).text,
      /The header says requestedBy "mallory@example.com", the chain says "ada@example.com"/);
  });

  it("un texte gardé à côté changé se voit, et un texte sans son sel ne se vérifie pas", async () => {
    const { titleHash } = dossier();
    await fails(dossier({ tamper: (f) => { f.texts = { [titleHash]: { salt: "0123456789abcdef0123456789abcdef", text: "Delete the database" } }; } }).text,
      /does not match its digest/);
    await fails(dossier({ tamper: (f) => { f.texts = { [titleHash]: { salt: "ffffffffffffffffffffffffffffffff", text: "Fix the footer links" } }; } }).text,
      /does not match its digest/);
  });

  it("R159 M6 : un texte gardé sans son sel, comme avant le sel, ne se vérifie pas", async () => {
    const title = "Fix the footer links";
    const unsalted = sha256(title);
    const { text } = dossier({ seal: false,
      edit: (events) => {
        const started = events[0]?.data as Record<string, Json>;
        (started.request as Record<string, Json>).title = { sha256: unsalted, chars: title.length };
      },
      tamper: (f) => { f.texts = { [unsalted]: title }; } });
    await fails(text, /A text kept beside the chain does not match its digest/);
  });

  it("R159 M5 : les faits du runner viennent du poste de l'agent, et des tests dont la branche change la définition se notent", async () => {
    const edit = (events: EventInput[]): void => {
      (events[0]?.data as Record<string, Json>).runnerFacts = "agent-machine";
      events.splice(4, 0, { seq: 5, at: "2026-11-22T08:09:00.000Z", type: "test.result", actor: { kind: "runner", id: "tf-runner-ada" },
        data: { kind: "test", command: "npm test", passed: true, definitionChanged: ["package.json", "vitest.config.ts"] } });
      events.forEach((event, i) => { event.seq = i + 1; });
    };
    const verdict = await verifyEvidence(dossier({ edit }).text);
    assert.equal(verdict.ok, true, verdict.message);
    assert.match(verdict.message, /\[!!\] The runner's facts \(its tests, the agent and its model, the numbers of its events\) come from the computer where the agent works/);
    assert.match(verdict.message, /\[!!\] Event 5: what defines how its tests run changed during the mission \(package\.json, vitest\.config\.ts\)/);
    // Le champ couvert retiré de l'en-tête : la chaîne le donne encore.
    await fails(dossier({ edit, tamper: (f) => { delete (f.mission as Record<string, unknown>).runnerFacts; } }).text,
      /The header has no runnerFacts, which the chain gives/);
  });

  it("un paquet de règles changé se voit, et une décision que les règles ne donnent pas aussi", async () => {
    await fails(dossier({ tamper: (f) => { (f.rules as RulesBundle).rules = []; } }).text, /is not the one the mission received/);
    const lying = dossier({ tamper: (f) => {
      const events = f.events as Array<Record<string, unknown>>;
      const decided = events[2] as { data: Record<string, unknown> };
      decided.data = { ...decided.data, effect: "deny" };
    } });
    // L'événement changé casse d'abord la chaîne : rejuger ne vient qu'après une chaîne qui tient.
    await fails(lying.text, /The chain breaks at event 3/);
  });

  it("une signature qui ne tient pas, ou un sceau d'une autre chaîne, se voit", async () => {
    const stranger = generateKeyPairSync("ed25519").privateKey;
    await fails(dossier({ key: stranger }).text, /The seal does not hold: the signature does not hold/);
    await fails(dossier({ sealedRoot: `sha256:${"f".repeat(64)}` }).text, /The seal names event 5 with sha256:ffff.*not in this chain/);
    await fails(dossier({ tamper: (f) => { (f.mission as Record<string, unknown>).runner = "tf-runner-mallory"; } }).text,
      /The header says runner/);
  });

  it("un dossier sans sceau tient et dit qu'il n'est pas signé ; avec --key, il échoue", async () => {
    const { text, id } = dossier({ seal: false });
    const verdict = await verifyEvidence(text);
    assert.equal(verdict.ok, true);
    assert.equal(verdict.seal, "none");
    assert.match(verdict.message, /^Every hash holds: .* Not sealed\./);
    assert.match(verdict.message, /\[!!\] Not sealed/);
    const trusted = await verifyEvidence(text, { key: id });
    assert.equal(trusted.ok, false);
    assert.match(trusted.message, /\[KO\] Not sealed: you gave --key/);
  });

  it("un témoin dont la tête n'est pas dans la chaîne se voit", async () => {
    const base = dossier({ seal: false });
    const file = JSON.parse(base.text) as Record<string, unknown>;
    const events = (file.events as EventInput[]).map(({ seq, at, type, actor, data }) => ({ seq, at, type, actor, data }));
    events.push({ seq: 6, at: "2026-11-22T08:10:05.000Z", type: "note", actor: { kind: "server", id: "taskforce" },
      data: { kind: "witness", written: true, root: `sha256:${"0".repeat(64)}`, seq: 5, pullRequest: "https://github.com/acme/website/pull/212" } });
    const chained = chain(events);
    await fails(JSON.stringify({ ...file, events: chained, root: chained.at(-1)?.hash }), /The witness names event 5/);
  });

  it("un témoin qui nomme sa clé la dit, à comparer à celle qu'on vous donne (R159, second tour, N6)", async () => {
    const base = dossier({ seal: false });
    const file = JSON.parse(base.text) as Record<string, unknown>;
    const kept = file.events as Array<EventInput & { hash: string }>;
    const events = kept.map(({ seq, at, type, actor, data }) => ({ seq, at, type, actor, data }));
    const key = `sha256:${"a".repeat(64)}`;
    const comment = "https://github.com/acme/website/pull/212#issuecomment-1";
    events.push({ seq: 6, at: "2026-11-22T08:10:05.000Z", type: "note", actor: { kind: "server", id: "taskforce" },
      data: { kind: "witness", written: true, root: kept[4].hash, seq: 5, key, pullRequest: "https://github.com/acme/website/pull/212", comment } });
    const chained = chain(events);
    const verdict = await verifyEvidence(JSON.stringify({ ...file, events: chained, root: chained.at(-1)?.hash }));
    assert.equal(verdict.ok, true, verdict.message);
    assert.ok(verdict.message.includes(`(event 5), sealed by the key ${key}, was written on ${comment}.`), verdict.message);
    assert.ok(verdict.message.includes("the same digest and the same key, and that this key is the one you were given"), verdict.message);
  });

  it("le sceau tel que le serveur l'écrit en Java s'ouvre ici : l'exemple de contracts/evidence", async () => {
    const example = readFileSync(new URL("../../contracts/evidence/example-mission.json", import.meta.url), "utf8");
    const file = JSON.parse(example) as { seal: { payload: string }; events: Array<{ type: string }> };
    const sealed = JSON.parse(Buffer.from(file.seal.payload, "base64").toString("utf8")) as { predicate: { key: { id: string } } };
    const verdict = await verifyEvidence(example, { key: sealed.predicate.key.id });
    assert.equal(verdict.ok, true, verdict.message);
    assert.match(verdict.message, /\[ok\] Sealed at event \d+ .*by the key you trust/);
    assert.match(verdict.message, /\[ok\] Witness: the head sha256:/);
    // Le témoin de l'exemple nomme la clé qui a scellé sa tête, comme le serveur l'écrit (R159, second tour, N6).
    assert.ok(verdict.message.includes(`sealed by the key ${sealed.predicate.key.id}, was written on`), verdict.message);
    assert.match(verdict.message, /judging the \d+ recorded actions again gives the same decisions/);
    assert.equal((await openSeal(file.seal)).valid, true);
    // Changer un octet de l'exemple casse la chaîne, ou le sceau.
    assert.equal((await verifyEvidence(example.replace("claude-code", "claude-kode"))).ok, false);
  });

  it("l'encodage préalable de DSSE : l'exemple de la spécification", async () => {
    assert.equal(Buffer.from(pae("http://example.com/HelloWorld", new TextEncoder().encode("hello world"))).toString(),
      "DSSEv1 29 http://example.com/HelloWorld 11 hello world");
    assert.equal(await keyId(new TextEncoder().encode("x")), `sha256:${createHash("sha256").update("x").digest("hex")}`);
  });
});
