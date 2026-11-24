import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import { exactAction } from "../src/approvals.js";
import { canonicalJson, type Json } from "../src/harness/engine/rules-engine.js";
import { inputHash, jcs, sha256 } from "../src/harness/written.js";

/**
 * R159 de #551, L3 : l'empreinte d'une entrée d'outil retombait sur `JSON.stringify` dès qu'un décimal y paraissait, et
 * une écriture vers `.env` recevait l'empreinte de son contenu. Chaque essai part de la sonde de la relecture.
 */

const WORK = mkdtempSync(join(tmpdir(), "tf-review-551-l3-"));
after(() => rmSync(WORK, { recursive: true, force: true }));
// Un fichier pour que `exactAction` relise une modification ; le dossier de travail est jetable.
writeFileSync(join(WORK, "README.md"), "hello", "utf8");

describe("L3. les nombres d'une entrée d'outil, comme la RFC 8785 les écrit", () => {
  it("un décimal entre dans le JSON canonique de la RFC, plus dans JSON.stringify", () => {
    // RFC 8785, 3.2.2.3 : les nombres comme ECMAScript les écrit ; les clés triées par unités UTF-16.
    assert.equal(jcs({ b: 0.1 + 0.2, a: 1e21, c: [-0, 1e-7, 333333333.3333333] }), '{"a":1e+21,"b":0.30000000000000004,"c":[0,1e-7,333333333.3333333]}');
    assert.equal(jcs({ "\u20ac": 1, "\r": 2, "\ud83d\ude00": 3, "\ufb33": 4 }), "{\"\\r\":2,\"\u20ac\":1,\"\ud83d\ude00\":3,\"\ufb33\":4}");
    // Sans décimal, la même empreinte qu'avant : le JSON canonique du dossier.
    const plain = { file_path: "src/a.ts", content: "x", n: 3 };
    assert.equal(inputHash(plain), sha256(canonicalJson(plain as Json)));
    assert.equal(inputHash({ timeout: 1.5 }), sha256('{"timeout":1.5}'));
  });

  it("le JSON canonique de la chaîne refuse un entier que JavaScript ne tient pas exactement, au lieu d'en écrire un autre", () => {
    // La sonde : le moteur compilé écrivait 1e21 en 3875820019684212736, sans erreur.
    assert.equal(canonicalJson({ n: 9007199254740991, m: -9007199254740991 } as Json), '{"m":-9007199254740991,"n":9007199254740991}');
    assert.throws(() => canonicalJson({ n: 1e21 } as Json));
    assert.throws(() => canonicalJson({ n: 9007199254740992 } as Json));
    assert.throws(() => canonicalJson({ n: 0.5 } as Json));
  });

  it("une demi-paire seule n'est pas du I-JSON : pas d'empreinte plutôt qu'une empreinte fausse", () => {
    assert.equal(inputHash({ text: "abc\ud83d" }), null);
  });

  it("une écriture vers un fichier qui peut porter un secret n'a d'empreinte ni de son contenu ni de son entrée", () => {
    const secret = exactAction("Write", { file_path: join(WORK, ".env"), content: "DB_PASSWORD=hunter2" }, WORK);
    assert.equal(secret.input, undefined);
    assert.deepEqual(secret.written, { path: ".env" });
    const edit = exactAction("Edit", { file_path: join(WORK, "keys/id_ed25519"), old_string: "a", new_string: "b" }, WORK);
    assert.equal(edit.input, undefined);
    const plain = exactAction("Write", { file_path: join(WORK, "README.md"), content: "hello" }, WORK);
    assert.ok(plain.input?.startsWith("sha256:"));
    assert.ok(plain.written?.sha256?.startsWith("sha256:"));
  });
});
