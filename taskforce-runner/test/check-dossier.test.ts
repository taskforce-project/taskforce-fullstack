import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { checkDossier, chainOf, type Obj } from "../src/harness/verifier/dossier.js";
import { ed25519Supported } from "../src/harness/verifier/crypto.js";

/**
 * Ce que le vérificateur établit d'un dossier, champ par champ (`checkDossier`) : l'app le lit pour sa page de vérification
 * (#552, R161 B1), `npm run verify` en tire ses lignes. Le même moteur des deux côtés, le même verdict.
 */

const EXAMPLE = readFileSync(new URL("../../contracts/evidence/example-mission.json", import.meta.url), "utf8");
const example = (): Obj & { events: Obj[]; texts: Record<string, { salt: string; text: string }>; mission: Obj; seal: Obj } =>
  JSON.parse(EXAMPLE) as Obj & { events: Obj[]; texts: Record<string, { salt: string; text: string }>; mission: Obj; seal: Obj };
const keyOf = (file: { seal: Obj }): string =>
  String(((JSON.parse(Buffer.from(String(file.seal.payload), "base64").toString("utf8")) as { predicate: { key: { id: string } } })
    .predicate.key.id));

describe("checkDossier : ce que prouve un dossier dont la chaîne tient", () => {
  it("l'exemple : l'en-tête vient de la chaîne, chaque texte tient, les règles se rejugent, le sceau et le témoin tiennent", async () => {
    const file = example();
    assert.equal(chainOf(file).ok, true);

    const check = await checkDossier(file);

    assert.deepEqual(check.header.differs, []);
    assert.deepEqual(check.header.missing, []);
    assert.ok(check.header.covered.includes("requestedBy"));
    assert.equal(check.texts.matches.length, Object.keys(file.texts).length);
    assert.deepEqual(check.texts.changed, []);
    assert.equal(check.rules.digestHolds, true);
    assert.ok(check.rules.judged > 0);
    assert.equal(check.runnerFacts, true);
    assert.equal(check.seal.state, "self");
    assert.equal(check.seal.custody, "same-machine");
    assert.equal(check.seal.kept, false);
    assert.equal(check.seal.after, 0);
    assert.ok(check.witnesses.every((w) => w.holds));
    assert.equal(check.gaps.length, 1);
  });

  it("une instance qui connaît sa clé : le sceau de l'une de ses clés est de confiance, celui d'une autre ne l'est pas", async () => {
    const file = example();

    assert.equal((await checkDossier(file, { keys: [`sha256:${"0".repeat(64)}`, keyOf(file)] })).seal.state, "trusted");
    assert.equal((await checkDossier(file, { keys: [`sha256:${"0".repeat(64)}`] })).seal.state, "self");
    assert.equal((await checkDossier({ ...file, seal: undefined }, { keys: [keyOf(file)] })).seal.state, "none");
  });

  it("un texte changé se dit par son empreinte ; un champ de l'en-tête changé, par son nom", async () => {
    const file = example();
    const [hash] = Object.keys(file.texts);
    file.texts[String(hash)] = { ...file.texts[String(hash)]!, text: "Fix the header links" };
    file.mission.issue = "WEB-1";

    const check = await checkDossier(file);

    assert.deepEqual(check.texts.changed, [hash]);
    assert.deepEqual(check.header.differs, ["issue"]);
  });

  it("une plateforme qui ne sait pas Ed25519 ne dit pas le sceau faux : elle sait le vérifier ici", async () => {
    assert.equal(await ed25519Supported(), true);
  });
});
