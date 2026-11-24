import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { bundleDigest, canonicalJson, chain, type ChainedEvent, type EventInput, type Json, type RulesBundle } from "../src/harness/engine/rules-engine.js";
import { pae, PAYLOAD_TYPE, PREDICATE_TYPE, STATEMENT_TYPE } from "../src/harness/verifier/dossier.js";
import { verifyEvidence, type Verdict } from "../src/harness/verify.js";

const keyId = (spki: Buffer): string => `sha256:${createHash("sha256").update(spki).digest("hex")}`;

/**
 * Les dix-neuf altérations de la relecture R159 de #551 (premier tour), sur l'exemple de contracts/evidence, passées au
 * vérificateur avec et sans `--key`. Chacune dit ce que le vérificateur doit en conclure : avec la clé de l'exploitant, un
 * dossier altéré, re-signé ou privé de son sceau échoue ; sans elle, un sceau fait par n'importe quelle clé ne passe que
 * par un avertissement, que la première ligne dit.
 */

type Obj = Record<string, unknown>;
type File = Obj & { events: ChainedEvent[]; mission: Obj; texts: Obj; seal?: Obj; rules?: RulesBundle; root?: string };

const EXAMPLE = readFileSync(new URL("../../contracts/evidence/example-mission.json", import.meta.url), "utf8");
const example = (): File => JSON.parse(EXAMPLE) as File;
const statementOf = (file: File): Obj => JSON.parse(Buffer.from(String(file.seal?.payload), "base64").toString("utf8")) as Obj;
/** La clé que l'exploitant publie : celle qui a scellé l'exemple. */
const OPERATOR = String(((statementOf(example()).predicate as Obj).key as Obj).id);

const text = (file: File): string => JSON.stringify(file);
const bare = ({ seq, at, type, actor, data }: ChainedEvent): EventInput => ({ seq, at, type, actor, data });

/** Refait la chaîne après une réécriture : numéros, empreintes, racine. */
function rechain(file: File, events: ChainedEvent[]): File {
  const chained = chain(events.map((e, i) => ({ ...bare(e), seq: i + 1 })));
  return { ...file, events: chained, root: chained.at(-1)?.hash };
}

/** Un sceau neuf sur la tête du fichier, par une clé qui n'est pas celle de l'exploitant ; `subject` le fausse. */
function resign(file: File, options: { key?: KeyObject; subject?: string } = {}): File {
  const pair = generateKeyPairSync("ed25519");
  const privateKey = options.key ?? pair.privateKey;
  const spki = Buffer.from(pair.publicKey.export({ format: "der", type: "spki" }));
  const root = String(file.root);
  const seq = file.events.length;
  const statement = {
    _type: STATEMENT_TYPE,
    subject: [{ name: `taskforce-mission-${String(file.mission.id)}`, digest: { sha256: options.subject ?? root.slice(7) } }],
    predicateType: PREDICATE_TYPE,
    predicate: { format: "taskforce-evidence/1", mission: file.mission, root, seq, sealedAt: "2026-11-22T17:00:00.000Z",
      key: { id: keyId(spki), algorithm: "ed25519", publicKey: spki.toString("base64"), custody: "separate-machine", kept: true } },
  };
  const payload = Buffer.from(canonicalJson(statement as unknown as Json), "utf8");
  return { ...file, seal: { payload: payload.toString("base64"), payloadType: PAYLOAD_TYPE,
    signatures: [{ keyid: keyId(spki), sig: sign(null, pae(PAYLOAD_TYPE, new Uint8Array(payload)), privateKey).toString("base64") }] } };
}

const noteKind = (e: ChainedEvent): unknown => (e.type === "note" && e.data && typeof e.data === "object" ? (e.data as Obj).kind : undefined);
/** Le trou et le témoin retirés, la chaîne refaite : ce que l'exploitant ferait pour effacer une perte et sa trace. */
const scrubbed = (): File => rechain(example(), example().events.filter((e) => noteKind(e) !== "gap" && noteKind(e) !== "witness"));

async function both(file: File): Promise<{ plain: Verdict; trusted: Verdict }> {
  return { plain: await verifyEvidence(text(file)), trusted: await verifyEvidence(text(file), { key: OPERATOR }) };
}

async function refused(file: File, pattern: RegExp): Promise<void> {
  const { plain, trusted } = await both(file);
  assert.equal(plain.ok, false, plain.message);
  assert.equal(trusted.ok, false, trusted.message);
  assert.match(plain.message, pattern);
  assert.match(trusted.message, pattern);
}

describe("les altérations de la relecture R159 (#551, premier tour), avec et sans --key", () => {
  it("l'exemple intact : sans clé, un avertissement le dit dès la première ligne ; avec la clé de l'exploitant, il tient", async () => {
    const { plain, trusted } = await both(example());
    assert.equal(plain.ok, true, plain.message);
    assert.match(plain.message.split("\n")[0] ?? "", /signed by a key the file carries itself: anyone can make this seal/i);
    assert.match(plain.message, /\[!!\] Sealed at event \d+ .*by the key the file carries/);
    assert.equal(trusted.ok, true, trusted.message);
    assert.match(trusted.message.split("\n")[0] ?? "", /Sealed by the key you trust/);
    assert.match(trusted.message, /\[ok\] Sealed at event \d+ .*by the key you trust/);
  });

  it("01. un événement changé : la chaîne casse", async () => {
    const file = example();
    (file.events[1]?.data as Obj).text = "Nothing to see here";
    await refused(file, /The chain breaks at event 2/);
  });

  it("02. l'en-tête changé : la chaîne dit autre chose", async () => {
    const file = example();
    file.mission.issue = "WEB-1";
    await refused(file, /The header says issue "WEB-1"/);
  });

  it("03. un octet de la signature changé", async () => {
    const file = example();
    const signatures = (file.seal as Obj).signatures as Obj[];
    const sig = Buffer.from(String(signatures[0]?.sig), "base64");
    sig[0] = (sig[0] ?? 0) ^ 0xff;
    (signatures[0] as Obj).sig = sig.toString("base64");
    await refused(file, /The seal does not hold: the signature does not hold/);
  });

  it("04. le paquet de règles changé, son empreinte laissée", async () => {
    const file = example();
    (file.rules as RulesBundle).rules = [];
    await refused(file, /is not the one the mission received/);
  });

  it("05. le paquet de règles changé, son empreinte recalculée", async () => {
    const file = example();
    const rules = file.rules as RulesBundle;
    rules.rules = rules.rules.slice(1);
    rules.digest = bundleDigest(rules);
    await refused(file, /is not the one the mission received/);
  });

  it("06. le paquet de règles retiré : un avertissement, la chaîne tient", async () => {
    const file = example();
    delete file.rules;
    const { plain, trusted } = await both(file);
    assert.equal(trusted.ok, true, trusted.message);
    assert.match(plain.message, /\[!!\] The rules bundle is not in this file/);
  });

  it("07. un événement retiré au milieu", async () => {
    const file = example();
    file.events.splice(4, 1);
    await refused(file, /The chain breaks at event/);
  });

  it("08. deux événements échangés", async () => {
    const file = example();
    const [a, b] = [file.events[3] as ChainedEvent, file.events[4] as ChainedEvent];
    file.events[3] = b;
    file.events[4] = a;
    await refused(file, /The chain breaks at event/);
  });

  it("09. un événement doublé", async () => {
    const file = example();
    file.events.splice(5, 0, file.events[5] as ChainedEvent);
    await refused(file, /The chain breaks at event/);
  });

  it("10. le dernier événement retiré, la racine corrigée", async () => {
    const file = example();
    file.events.pop();
    file.root = file.events.at(-1)?.hash;
    await refused(file, /The seal names event \d+ .*not in this chain/);
  });

  it("11. le sceau retiré : avec --key, le dossier échoue ; sans, il le dit", async () => {
    const file = example();
    delete file.seal;
    const { plain, trusted } = await both(file);
    assert.equal(trusted.ok, false, trusted.message);
    assert.match(trusted.message, /\[KO\] Not sealed: you gave --key/);
    assert.equal(plain.ok, true, plain.message);
    assert.match(plain.message.split("\n")[0] ?? "", /Not sealed/);
  });

  it("12. la signature attribuée à une autre clé que celle de l'énoncé", async () => {
    const file = example();
    (((file.seal as Obj).signatures as Obj[])[0] as Obj).keyid = `sha256:${"0".repeat(64)}`;
    await refused(file, /no signature of the key the statement names/);
  });

  it("13. un événement changé, la chaîne refaite, re-signé : le témoin nomme encore l'ancienne tête", async () => {
    const file = example();
    (file.events[1]?.data as Obj).text = "Nothing to see here";
    await refused(resign(rechain(file, file.events)), /The witness names event \d+/);
  });

  it("14. re-signé par une autre clé, la chaîne intacte : avec --key il échoue ; sans, la première ligne le dit", async () => {
    const { plain, trusted } = await both(resign(example()));
    assert.equal(trusted.ok, false, trusted.message);
    assert.match(trusted.message, /not by the key you trust/);
    assert.equal(plain.ok, true, plain.message);
    assert.match(plain.message.split("\n")[0] ?? "", /anyone can make this seal/);
    assert.doesNotMatch(plain.message, /\[ok\] Sealed/);
  });

  it("15. un sceau dont le sujet n'est pas la racine qu'il nomme", async () => {
    await refused(resign(example(), { subject: "0".repeat(64) }), /The seal's subject .* is not the root it names/);
  });

  it("16. un texte ajouté, que la chaîne ne nomme pas", async () => {
    const file = example();
    const salt = randomBytes(16).toString("hex");
    const words = "Approved by the security team";
    const hash = `sha256:${createHash("sha256").update(`${salt}${words}`, "utf8").digest("hex")}`;
    file.texts = { ...file.texts, [hash]: { salt, text: words } };
    await refused(file, /not named by the chain/);
  });

  it("17. un champ de l'en-tête que la chaîne couvre, retiré", async () => {
    const file = example();
    delete file.mission.issue;
    await refused(file, /The header has no issue/);
  });

  it("18. le trou et le témoin retirés, la chaîne refaite, le sceau ôté : avec --key il échoue", async () => {
    const file = scrubbed();
    delete file.seal;
    const { plain, trusted } = await both(file);
    assert.equal(trusted.ok, false, trusted.message);
    assert.match(trusted.message, /\[KO\] Not sealed: you gave --key/);
    assert.match(plain.message.split("\n")[0] ?? "", /Not sealed/);
  });

  it("19. le trou et le témoin retirés, la chaîne refaite, re-signé : avec --key il échoue ; sans, la première ligne le dit", async () => {
    const { plain, trusted } = await both(resign(scrubbed()));
    assert.equal(trusted.ok, false, trusted.message);
    assert.match(trusted.message, /not by the key you trust/);
    assert.match(plain.message.split("\n")[0] ?? "", /anyone can make this seal/);
    assert.match(plain.message, /\[!!\] Sealed at event \d+ .*by the key the file carries/);
  });
});
