import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { canonicalJson, chain, type ChainedEvent, type EventInput, type Json } from "../src/harness/engine/rules-engine.js";
import { pae, PAYLOAD_TYPE, PREDICATE_TYPE, STATEMENT_TYPE } from "../src/harness/verifier/dossier.js";
import { verifyEvidence } from "../src/harness/verify.js";

/**
 * R159 de #551, troisième tour, c-f : un dossier dont la mission a été supprimée en cours de route se scelle tard, et le
 * vérificateur disait encore qu'il l'avait été « after its mission had ended ». Il ne dit plus que ce que la chaîne montre.
 */

type Obj = Record<string, unknown>;
type File = Obj & { events: ChainedEvent[]; mission: Obj; root?: string; seal?: Obj };

const EXAMPLE = readFileSync(new URL("../../contracts/evidence/example-mission.json", import.meta.url), "utf8");
const bare = ({ seq, at, type, actor, data }: ChainedEvent): EventInput => ({ seq, at, type, actor, data });
const keyId = (spki: Buffer): string => `sha256:${createHash("sha256").update(spki).digest("hex")}`;

/** Les premiers événements de l'exemple, la chaîne refaite, sans sceau ni témoin, avec les textes qu'ils nomment. */
function upTo(last: number): File {
  const file = JSON.parse(EXAMPLE) as File;
  const chained = chain(file.events.filter((e) => e.seq <= last).map(bare));
  const named = JSON.stringify(chained);
  const texts = Object.fromEntries(Object.entries(file.texts as Obj).filter(([hash]) => named.includes(hash)));
  const { seal: _seal, ...rest } = file;
  return { ...rest, texts, events: chained, root: chained.at(-1)?.hash };
}

/** Le sceau tardif du serveur sur la tête du fichier, par une clé tirée ici. */
function sealedLate(file: File): { file: File; key: string } {
  const pair = generateKeyPairSync("ed25519");
  const spki = Buffer.from(pair.publicKey.export({ format: "der", type: "spki" }));
  const root = String(file.root);
  const predicate: Obj = { format: "taskforce-evidence/1", mission: file.mission, root, seq: file.events.length,
    sealedAt: "2026-11-25T08:00:00.000Z", late: true,
    key: { id: keyId(spki), algorithm: "ed25519", publicKey: spki.toString("base64"), custody: "same-machine", kept: true } };
  const statement = { _type: STATEMENT_TYPE, subject: [{ name: `taskforce-mission-${String(file.mission.id)}`, digest: { sha256: root.slice(7) } }],
    predicateType: PREDICATE_TYPE, predicate };
  const payload = Buffer.from(canonicalJson(statement as unknown as Json), "utf8");
  return {
    key: keyId(spki),
    file: { ...file, seal: { payload: payload.toString("base64"), payloadType: PAYLOAD_TYPE,
      signatures: [{ keyid: keyId(spki), sig: sign(null, pae(PAYLOAD_TYPE, new Uint8Array(payload)), pair.privateKey).toString("base64") }] } },
  };
}

describe("c-f : le sceau tardif ne dit que ce que la chaîne montre", () => {
  it("une mission supprimée avant sa fin : scellé tard, sans « after its mission had ended »", async () => {
    const { file, key } = sealedLate(upTo(21));
    const verdict = await verifyEvidence(JSON.stringify(file), { key });
    assert.equal(verdict.ok, true, verdict.message);
    assert.ok(verdict.message.includes("[!!] This record was sealed late, on 2026-11-25T08:00:00.000Z: the seal proves the chain "
      + "as it was on that date, not what happened before."), verdict.message);
    assert.doesNotMatch(verdict.message, /after its mission had ended/);
  });

  it("une mission finie : la fin est dans la chaîne, la ligne la dit", async () => {
    const { file, key } = sealedLate(upTo(23));
    const verdict = await verifyEvidence(JSON.stringify(file), { key });
    assert.match(verdict.message, /\[!!\] This record was sealed late, on 2026-11-25T08:00:00\.000Z, after its mission had ended:/);
  });
});
