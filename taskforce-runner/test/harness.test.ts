import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { canonicalJson, chain, firstBrokenLink, ZERO_HASH, type EventInput, type Json } from "../src/harness/evidence.js";
import { globMatch } from "../src/harness/glob.js";
import { bundleDigest, decide, verifiedBundle, type Facts, type RulesBundle } from "../src/harness/rules.js";

// Tests de contrat (R16) : les cas partagés de contracts/, que le serveur rejoue à l'identique.
const contract = <T>(path: string): T => JSON.parse(readFileSync(new URL(`../../contracts/${path}`, import.meta.url), "utf8")) as T;

interface RuleCases {
  digest: { expected: string };
  globs: Array<{ pattern: string; value: string; match: boolean }>;
  decisions: Array<{ name: string; facts: Facts; expect: { effect: string; rule: string | null } }>;
}
interface ChainCases {
  zero: string;
  canonical: Array<{ name: string; value: Json; canonical: string }>;
  chain: { events: EventInput[]; links: Array<{ prev: string; hash: string }>; root: string };
}

const defaults = contract<RulesBundle>("rules/default.rules.json");
const ruleCases = contract<RuleCases>("rules/cases.json");
const chainCases = contract<ChainCases>("evidence/chain-cases.json");

describe("contrat des règles : motifs", () => {
  for (const c of ruleCases.globs) {
    it(`${c.pattern} ${c.match ? "couvre" : "ne couvre pas"} « ${c.value} »`, () => {
      assert.equal(globMatch(c.pattern, c.value), c.match);
    });
  }
});

describe("contrat des règles : décisions avec la table par défaut", () => {
  for (const c of ruleCases.decisions) {
    it(c.name, () => {
      const d = decide(defaults, c.facts);
      assert.equal(d.effect, c.expect.effect);
      assert.equal(d.rule?.id ?? null, c.expect.rule);
    });
  }

  it("chaque règle par défaut a un propriétaire, une raison et une date de revue (R2)", () => {
    for (const r of defaults.rules) {
      assert.ok(r.owner.length > 0 && r.reason.length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(r.review), r.id);
    }
  });

  it("les identifiants de règle sont uniques", () => {
    const ids = defaults.rules.map((r) => r.id);
    assert.equal(new Set(ids).size, ids.length);
  });
});

describe("contrat des règles : empreinte du paquet", () => {
  it("donne l'empreinte du cas de référence, nuls et empreinte compris ou non", () => {
    assert.equal(bundleDigest(defaults), ruleCases.digest.expected);
    const noisy = { ...defaults, digest: `sha256:${"f".repeat(64)}`, issuedAt: null } as unknown as RulesBundle;
    assert.equal(bundleDigest(noisy), ruleCases.digest.expected);
  });

  it("accepte un paquet dont l'empreinte tient", () => {
    const signed = { ...defaults, digest: bundleDigest(defaults) };
    assert.equal(verifiedBundle(signed).version, defaults.version);
  });

  it("refuse un paquet modifié après son empreinte, ou sans règles", () => {
    const signed = { ...defaults, digest: bundleDigest(defaults) };
    const loosened = { ...signed, rules: signed.rules.map((r) => (r.id === "pay" ? { ...r, effect: "allow" as const } : r)) };
    assert.throws(() => verifiedBundle(loosened), /do not match their digest/);
    assert.throws(() => verifiedBundle(undefined), /without rules/);
  });
});

describe("contrat de la preuve : JSON canonique", () => {
  for (const c of chainCases.canonical) {
    it(c.name, () => assert.equal(canonicalJson(c.value), c.canonical));
  }

  it("refuse un nombre décimal", () => {
    assert.throws(() => canonicalJson({ score: 0.5 }), /Decimal numbers/);
  });
});

describe("contrat de la preuve : chaîne d'empreintes", () => {
  it("part de l'empreinte nulle", () => assert.equal(ZERO_HASH, chainCases.zero));

  it("donne les mêmes empreintes que le cas de référence", () => {
    const chained = chain(chainCases.chain.events);
    assert.deepEqual(chained.map((e) => ({ prev: e.prev, hash: e.hash })), chainCases.chain.links);
    assert.equal(chained.at(-1)?.hash, chainCases.chain.root);
  });

  it("un événement modifié se voit, au bon endroit", () => {
    const chained = chain(chainCases.chain.events);
    assert.equal(firstBrokenLink(chained), -1);
    const tampered = chained.map((e) => ({ ...e }));
    const third = tampered[2];
    assert.ok(third);
    third.data = { ...third.data, version: "3.1.1" };
    assert.equal(firstBrokenLink(tampered), 2);
  });

  it("un événement retiré se voit", () => {
    const chained = chain(chainCases.chain.events);
    assert.equal(firstBrokenLink([chained[0], chained[2], chained[3]].filter((e) => e !== undefined)), 1);
  });
});
