import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { reportedFacts } from "../src/api.js";
import { chain, type ChainedEvent, type EventInput } from "../src/harness/engine/rules-engine.js";
import { verifyEvidence } from "../src/harness/verify.js";

/**
 * R159 de #551, troisième tour, c-b : le vérificateur acceptait la marque de coupe sur un fait de toute longueur, et ne
 * rejugeait plus la décision ; sa première ligne n'en disait rien, pas plus que d'une décision sans faits. Les cas 26 et
 * 27 de la relecture.
 */

type Obj = Record<string, unknown>;
type File = Obj & { events: ChainedEvent[]; mission: Obj; root?: string; seal?: Obj };

const EXAMPLE = readFileSync(new URL("../../contracts/evidence/example-mission.json", import.meta.url), "utf8");
const example = (): File => JSON.parse(EXAMPLE) as File;
const bare = ({ seq, at, type, actor, data }: ChainedEvent): EventInput => ({ seq, at, type, actor, data });

/** L'exemple dont une décision des règles est changée, la chaîne refaite, sans sceau ni témoin. */
function withDecision(change: (data: Obj) => Obj): File {
  const file = example();
  const index = file.events.findIndex((e) => e.type === "action.decided" && e.actor.kind === "rule" && Array.isArray((e.data as Obj).facts));
  const events = file.events.filter((e) => !(e.type === "note" && (e.data as Obj | null)?.kind === "witness")).map((e, i) =>
    (i === index ? { ...e, data: change(e.data as Obj) } : e));
  const chained = chain(events.map((e, i) => ({ ...bare(e), seq: i + 1 } as EventInput)));
  const { seal: _seal, ...rest } = file;
  return { ...rest, events: chained, root: chained.at(-1)?.hash };
}

const inverted = (data: Obj): string => (data.effect === "allow" ? "deny" : "allow");

describe("c-b : la marque de coupe ne soustrait au rejugement que le fait que le runner a coupé", () => {
  it("cas 26 : la marque ajoutée à un fait court ne l'exempte pas ; la décision inversée se voit", async () => {
    const file = withDecision((data) => {
      const facts = (data.facts as Obj[]).map((part) => ({ ...part, path: `${String(part.path)}\n[TaskForce cut this text here: 9000 characters in all]` }));
      return { ...data, facts, effect: inverted(data) };
    });
    const verdict = await verifyEvidence(JSON.stringify(file));
    assert.equal(verdict.ok, false, verdict.message);
    assert.match(verdict.message, /\[KO\] Event \d+: the rules give/);
  });

  it("un fait que le runner a vraiment coupé ne se rejuge pas, et la première ligne le compte", async () => {
    const long = `src/${"a".repeat(5000)}.ts`;
    const file = withDecision((data) => {
      const facts = reportedFacts((data.facts as Obj[]).map((part) => ({ ...part, path: long })) as never);
      return { ...data, facts };
    });
    const decided = file.events.find((e) => e.type === "action.decided" && e.actor.kind === "rule" && Array.isArray((e.data as Obj).facts));
    const path = String(((decided?.data as Obj).facts as Obj[])[0]?.path);
    assert.equal(path.length, 4000);
    assert.match(path, /\n\[TaskForce cut this text here: 5007 characters in all\]$/);
    const verdict = await verifyEvidence(JSON.stringify(file));
    assert.equal(verdict.ok, true, verdict.message);
    assert.match(verdict.message.split("\n")[0] ?? "", /1 recorded decision was not judged again: 1 on a fact cut to fit the record\.$/);
  });

  it("cas 27 : une décision sans ses faits ne se rejuge pas, et la première ligne le dit", async () => {
    const file = withDecision((data) => {
      const { facts: _facts, ...rest } = data;
      return { ...rest, effect: inverted(data) };
    });
    const verdict = await verifyEvidence(JSON.stringify(file));
    assert.match(verdict.message.split("\n")[0] ?? "", /1 recorded decision was not judged again: 1 without its facts\.$/);
  });

  it("l'exemple, dont chaque décision se rejuge, ne compte rien", async () => {
    const verdict = await verifyEvidence(EXAMPLE);
    assert.doesNotMatch(verdict.message.split("\n")[0] ?? "", /not judged again/);
  });
});
