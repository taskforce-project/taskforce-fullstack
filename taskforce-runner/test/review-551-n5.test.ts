import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { canonicalJson, chain, type ChainedEvent, type EventInput, type Json } from "../src/harness/engine/rules-engine.js";
import { pae, PAYLOAD_TYPE, PREDICATE_TYPE, STATEMENT_TYPE } from "../src/harness/verifier/dossier.js";
import { verifyEvidence } from "../src/harness/verify.js";

/**
 * R159 de #551, second tour, N5 : un dossier fini avant ce lot n'a pas de sceau, et `npm run verify --key`, que la doc
 * demande toujours, échouait sur un dossier authentique. Le serveur le scelle une fois, tard, et le vérificateur le dit.
 */

type Obj = Record<string, unknown>;
type File = Obj & { events: ChainedEvent[]; mission: Obj; root?: string; seal?: Obj };

const EXAMPLE = readFileSync(new URL("../../contracts/evidence/example-mission.json", import.meta.url), "utf8");
const example = (): File => JSON.parse(EXAMPLE) as File;
const bare = ({ seq, at, type, actor, data }: ChainedEvent): EventInput => ({ seq, at, type, actor, data });
const keyId = (spki: Buffer): string => `sha256:${createHash("sha256").update(spki).digest("hex")}`;

/** La chaîne refaite après une réécriture, sans sceau ni témoin : ils nommaient l'ancienne tête. */
function rechain(file: File, events: ChainedEvent[]): File {
  const kept = events.filter((e) => !(e.type === "note" && (e.data as Obj | null)?.kind === "witness"));
  const chained = chain(kept.map((e, i) => ({ ...bare(e), seq: i + 1 })));
  const { seal: _seal, ...rest } = file;
  return { ...rest, events: chained, root: chained.at(-1)?.hash };
}

/** Le sceau du serveur sur la tête du fichier, par une clé tirée ici ; `late` : posé tard, comme le passage au démarrage. */
function sealed(file: File, late: boolean): { file: File; key: string } {
  const pair = generateKeyPairSync("ed25519");
  const spki = Buffer.from(pair.publicKey.export({ format: "der", type: "spki" }));
  const root = String(file.root);
  const predicate: Obj = { format: "taskforce-evidence/1", mission: file.mission, root, seq: file.events.length,
    sealedAt: "2026-11-25T08:00:00.000Z",
    key: { id: keyId(spki), algorithm: "ed25519", publicKey: spki.toString("base64"), custody: "same-machine", kept: true } };
  if (late) predicate.late = true;
  const statement = { _type: STATEMENT_TYPE, subject: [{ name: `taskforce-mission-${String(file.mission.id)}`, digest: { sha256: root.slice(7) } }],
    predicateType: PREDICATE_TYPE, predicate };
  const payload = Buffer.from(canonicalJson(statement as unknown as Json), "utf8");
  return {
    key: keyId(spki),
    file: { ...file, seal: { payload: payload.toString("base64"), payloadType: PAYLOAD_TYPE,
      signatures: [{ keyid: keyId(spki), sig: sign(null, pae(PAYLOAD_TYPE, new Uint8Array(payload)), pair.privateKey).toString("base64") }] } },
  };
}

describe("N5 : un dossier d'avant ce lot, scellé tard, passe --key, et la première ligne le dit", () => {
  // Un dossier fini avant la 1.18 : la chaîne seule, sans sceau, puis le sceau tardif du passage au démarrage.
  const old = (): File => rechain(example(), example().events.filter((e) => e.seq <= 23));

  it("avec la clé de l'exploitant : il tient, et la première ligne dit quand il a été scellé", async () => {
    const { file, key } = sealed(old(), true);
    const verdict = await verifyEvidence(JSON.stringify(file), { key });
    assert.equal(verdict.ok, true, verdict.message);
    assert.match(verdict.message.split("\n")[0] ?? "",
      /Sealed late, on 2026-11-25T08:00:00\.000Z, by the key you trust: it proves the chain as it was on that date, not what happened before\./);
    assert.match(verdict.message, /\[!!\] This record was sealed late, on 2026-11-25T08:00:00\.000Z, after its mission had ended/);
    assert.match(verdict.message, /\[ok\] Sealed late at event 23 on 2026-11-25T08:00:00\.000Z by the key you trust/);
  });

  it("sans la clé, il le dit aussi ; un sceau ordinaire ne parle pas de retard", async () => {
    const { file } = sealed(old(), true);
    assert.match((await verifyEvidence(JSON.stringify(file))).message.split("\n")[0] ?? "", /Sealed late, on .+ by a key the file carries itself/);
    const { file: timely, key } = sealed(old(), false);
    const verdict = await verifyEvidence(JSON.stringify(timely), { key });
    assert.equal(verdict.ok, true, verdict.message);
    assert.doesNotMatch(verdict.message, /sealed late/i);
  });

  it("sans sceau, --key échoue toujours", async () => {
    const verdict = await verifyEvidence(JSON.stringify(old()), { key: `sha256:${"0".repeat(64)}` });
    assert.equal(verdict.ok, false);
    assert.match(verdict.message, /Not sealed: you gave --key/);
  });
});
