import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { chain, type ChainedEvent, type EventInput } from "../src/harness/engine/rules-engine.js";
import { verifyEvidence } from "../src/harness/verify.js";

/**
 * R159 de #551, quatrième tour, d-f : le vérificateur soustrayait au rejugement toute décision dont la règle commençait
 * par « cap: », en silence. Seules les décisions que le runner prend lui-même (une action trop longue pour être accordée,
 * le plafond des changements) restent hors du rejugement, et la première ligne les compte ; tout autre « cap: » se rejuge.
 */

type Obj = Record<string, unknown>;
type File = Obj & { events: ChainedEvent[]; mission: Obj; root?: string; seal?: Obj };

const EXAMPLE = readFileSync(new URL("../../contracts/evidence/example-mission.json", import.meta.url), "utf8");
const example = (): File => JSON.parse(EXAMPLE) as File;
const bare = ({ seq, at, type, actor, data }: ChainedEvent): EventInput => ({ seq, at, type, actor, data });

/** L'exemple dont une décision des règles porte une autre règle et un autre effet, la chaîne refaite, sans sceau ni témoin. */
function decidedBy(rule: string, effect: (data: Obj) => string): File {
  const file = example();
  const index = file.events.findIndex((e) => e.type === "action.decided" && e.actor.kind === "rule" && Array.isArray((e.data as Obj).facts));
  const events = file.events.filter((e) => !(e.type === "note" && (e.data as Obj | null)?.kind === "witness")).map((e, i) =>
    (i === index ? { ...e, actor: { ...e.actor, id: rule }, data: { ...(e.data as Obj), effect: effect(e.data as Obj) } } : e));
  const chained = chain(events.map((e, i) => ({ ...bare(e), seq: i + 1 } as EventInput)));
  const { seal: _seal, ...rest } = file;
  return { ...rest, events: chained, root: chained.at(-1)?.hash };
}

const inverted = (data: Obj): string => (data.effect === "allow" ? "deny" : "allow");

describe("d-f : seules les décisions que le runner prend lui-même échappent au rejugement", () => {
  it("cap:fact-length, le refus du runner, ne se rejuge pas, et la première ligne le compte", async () => {
    const verdict = await verifyEvidence(JSON.stringify(decidedBy("cap:fact-length", () => "deny")));
    assert.equal(verdict.ok, true, verdict.message);
    assert.match(verdict.message.split("\n")[0] ?? "",
      /1 recorded decision was not judged again: 1 made by the runner itself, which no rule judges\.$/);
  });

  it("cap:taskforce-changes, le plafond des changements, de même", async () => {
    const verdict = await verifyEvidence(JSON.stringify(decidedBy("cap:taskforce-changes", () => "deny")));
    assert.equal(verdict.ok, true, verdict.message);
    assert.match(verdict.message.split("\n")[0] ?? "", /1 made by the runner itself, which no rule judges\.$/);
  });

  it("un « cap: » que le runner n'émet pas se rejuge : la décision inversée se voit", async () => {
    const verdict = await verifyEvidence(JSON.stringify(decidedBy("cap:anything", inverted)));
    assert.equal(verdict.ok, false, verdict.message);
    assert.match(verdict.message, /\[KO\] Event \d+: the rules give .* the record says .* \(cap:anything\)\./);
    assert.doesNotMatch(verdict.message.split("\n")[0] ?? "", /made by the runner itself/);
  });
});
