import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import { ApiError, type RunnerEvent } from "../src/api.js";
import { SessionRecord } from "../src/agent.js";
import { EventRelay } from "../src/events.js";
import { headerOf, keyId, openSeal, pae, PAYLOAD_TYPE, PREDICATE_TYPE, STATEMENT_TYPE, trustedKeyId } from "../src/harness/dossier.js";
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

/** Un dossier scellé, écrit ici comme le serveur l'écrit (MissionEvidenceService, EvidenceSeal). */
function dossier(options: { key?: KeyObject; tamper?: (file: Record<string, unknown>) => void; seal?: boolean; sealedRoot?: string } = {}) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const key = options.key ?? privateKey;
  const spki = Buffer.from(publicKey.export({ format: "der", type: "spki" }));
  const rules = { ...DEFAULT_RULES };
  rules.digest = bundleDigest(rules);
  const title = "Fix the footer links";
  const events: EventInput[] = [
    { seq: 1, at: "2026-11-22T08:00:00.000Z", type: "mission.started", actor: { kind: "server", id: "taskforce" }, data: {
      mission: 42, workspace: "acme", project: 12, issue: "WEB-48", requestedBy: "ada@example.com", accountable: "ada@example.com",
      request: { title: { sha256: sha256(title), chars: title.length }, description: null, reporter: "grace@example.com" },
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
  const chained = chain(events);
  const head = chained.at(-1);
  const mission = headerOf(chained).header;
  const file: Record<string, unknown> = { format: "taskforce-evidence/1", mission, events: chained, root: head?.hash, rules,
    texts: { [sha256(title)]: title } };
  if (options.seal !== false) {
    const root = options.sealedRoot ?? head?.hash;
    const statement = { _type: STATEMENT_TYPE, subject: [{ name: "taskforce-mission-42", digest: { sha256: String(root).slice(7) } }],
      predicateType: PREDICATE_TYPE, predicate: { format: "taskforce-evidence/1", mission, root, seq: 5,
        sealedAt: "2026-11-22T08:10:00.100Z", key: { id: keyId(spki), algorithm: "ed25519", publicKey: spki.toString("base64"),
          custody: "same-machine", kept: true } } };
    const payload = Buffer.from(canonicalJson(statement as Json), "utf8");
    file.seal = { payload: payload.toString("base64"), payloadType: PAYLOAD_TYPE,
      signatures: [{ keyid: keyId(spki), sig: sign(null, pae(PAYLOAD_TYPE, payload), key).toString("base64") }] };
  }
  options.tamper?.(file);
  return { text: JSON.stringify(file), id: keyId(spki), publicKey };
}

const fails = (text: string, pattern: RegExp): void => {
  const verdict = verifyEvidence(text);
  assert.equal(verdict.ok, false, verdict.message);
  assert.match(verdict.message, pattern);
};

describe("le vérificateur du runner, sans TaskForce ni réseau", () => {
  it("un dossier intact et scellé tient : la chaîne, l'en-tête, les textes, les règles rejugées, le sceau ; il dit ce qu'il ne prouve pas", () => {
    const { text } = dossier();
    const verdict = verifyEvidence(text);
    assert.equal(verdict.ok, true, verdict.message);
    assert.match(verdict.message, /^Every hash holds: 5 events/);
    assert.match(verdict.message, /\[ok\] The header comes from the chain/);
    assert.match(verdict.message, /\[ok\] The 1 texts kept beside the chain match their digests/);
    assert.match(verdict.message, /judging the 1 recorded actions again gives the same decisions/);
    assert.match(verdict.message, /\[!!\] Event 4: Events 4 to 5 from the runner never arrived/);
    assert.match(verdict.message, /\[ok\] Sealed at event 5 .*the signature holds/);
    assert.match(verdict.message, /\[!!\] Key custody: the signing key is on the same machine as the agent/);
    assert.match(verdict.message, /\[!!\] No witness was written in the pull request/);
  });

  it("avec la clé que l'exploitant publie : son identifiant, ou sa clé publique", () => {
    const { text, id, publicKey } = dossier();
    assert.match(verifyEvidence(text, { key: id }).message, /\[ok\] The seal was signed by the key you trust/);
    const pem = publicKey.export({ format: "pem", type: "spki" }).toString();
    assert.equal(trustedKeyId(pem), id);
    const other = generateKeyPairSync("ed25519").publicKey.export({ format: "pem", type: "spki" }).toString();
    const verdict = verifyEvidence(text, { key: other });
    assert.equal(verdict.ok, false);
    assert.match(verdict.message, /not by the key you trust/);
    assert.match(verifyEvidence(text, { key: "nonsense" }).message, /cannot be read/);
  });

  it("un en-tête changé après coup se voit : la chaîne dit autre chose", () => {
    fails(dossier({ tamper: (f) => { (f.mission as Record<string, unknown>).requestedBy = "mallory@example.com"; } }).text,
      /The header says requestedBy "mallory@example.com", the chain says "ada@example.com"/);
  });

  it("un texte gardé à côté changé se voit", () => {
    fails(dossier({ tamper: (f) => { f.texts = { [sha256("Fix the footer links")]: "Delete the database" }; } }).text,
      /does not match its digest/);
  });

  it("un paquet de règles changé se voit, et une décision que les règles ne donnent pas aussi", () => {
    fails(dossier({ tamper: (f) => { (f.rules as RulesBundle).rules = []; } }).text, /is not the one the mission received/);
    const lying = dossier({ tamper: (f) => {
      const events = f.events as Array<Record<string, unknown>>;
      const decided = events[2] as { data: Record<string, unknown> };
      decided.data = { ...decided.data, effect: "deny" };
    } });
    // L'événement changé casse d'abord la chaîne : rejuger ne vient qu'après une chaîne qui tient.
    fails(lying.text, /The chain breaks at event 3/);
  });

  it("une signature qui ne tient pas, ou un sceau d'une autre chaîne, se voit", () => {
    const stranger = generateKeyPairSync("ed25519").privateKey;
    fails(dossier({ key: stranger }).text, /The seal does not hold: the signature does not hold/);
    fails(dossier({ sealedRoot: `sha256:${"f".repeat(64)}` }).text, /The seal names event 5 with sha256:ffff.*not in this chain/);
    fails(dossier({ tamper: (f) => { (f.mission as Record<string, unknown>).runner = "tf-runner-mallory"; } }).text,
      /The header says runner/);
  });

  it("un dossier sans sceau tient, et dit qu'il n'est pas signé", () => {
    const verdict = verifyEvidence(dossier({ seal: false }).text);
    assert.equal(verdict.ok, true);
    assert.match(verdict.message, /\[!!\] Not sealed/);
  });

  it("un témoin dont la tête n'est pas dans la chaîne se voit", () => {
    const base = dossier({ seal: false });
    const file = JSON.parse(base.text) as Record<string, unknown>;
    const events = (file.events as EventInput[]).map(({ seq, at, type, actor, data }) => ({ seq, at, type, actor, data }));
    events.push({ seq: 6, at: "2026-11-22T08:10:05.000Z", type: "note", actor: { kind: "server", id: "taskforce" },
      data: { kind: "witness", written: true, root: `sha256:${"0".repeat(64)}`, seq: 5, pullRequest: "https://github.com/acme/website/pull/212" } });
    const chained = chain(events);
    fails(JSON.stringify({ ...file, events: chained, root: chained.at(-1)?.hash }), /The witness names event 5/);
  });

  it("le sceau tel que le serveur l'écrit en Java s'ouvre ici : l'exemple de contracts/evidence", () => {
    const example = readFileSync(new URL("../../contracts/evidence/example-mission.json", import.meta.url), "utf8");
    const verdict = verifyEvidence(example);
    assert.equal(verdict.ok, true, verdict.message);
    assert.match(verdict.message, /\[ok\] Sealed at event \d+ .*the signature holds/);
    assert.match(verdict.message, /\[ok\] Witness: the head sha256:/);
    assert.match(verdict.message, /judging the \d+ recorded actions again gives the same decisions/);
    const file = JSON.parse(example) as { seal: unknown; events: Array<{ type: string }> };
    assert.equal(openSeal(file.seal).valid, true);
    // Changer un octet de l'exemple casse la chaîne, ou le sceau.
    assert.equal(verifyEvidence(example.replace("Fix the footer links", "Fix the header links")).ok, false);
  });

  it("l'encodage préalable de DSSE : l'exemple de la spécification", () => {
    assert.equal(pae("http://example.com/HelloWorld", Buffer.from("hello world")).toString(), "DSSEv1 29 http://example.com/HelloWorld 11 hello world");
    assert.equal(keyId(Buffer.from("x")), `sha256:${createHash("sha256").update("x").digest("hex")}`);
  });
});
