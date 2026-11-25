import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { chain, type ChainedEvent, type EventInput } from "../src/harness/engine/rules-engine.js";
import { verifyEvidence } from "../src/harness/verify.js";

/**
 * R159 de #551, troisième tour, c-d : un témoin que GitHub empêche se reprend pendant sept jours, et le dossier en garde
 * au plus deux notes, le premier échec puis l'issue. Le vérificateur les lisait chacune comme un témoin manquant : « No
 * witness » puis « Witness » pour un témoin écrit au second essai.
 */

type Obj = Record<string, unknown>;
type File = Obj & { events: ChainedEvent[]; root?: string; seal?: Obj };

const EXAMPLE = readFileSync(new URL("../../contracts/evidence/example-mission.json", import.meta.url), "utf8");
const bare = ({ seq, at, type, actor, data }: ChainedEvent): EventInput => ({ seq, at, type, actor, data });
const PR = "https://github.com/acme/website/pull/212";

/** L'exemple sans sceau ni témoin, puis ces notes du témoin, sur la tête de la chaîne d'avant elles. */
function withWitness(...notes: Obj[]): File {
  const file = JSON.parse(EXAMPLE) as File;
  const events = file.events.filter((e) => !(e.type === "note" && (e.data as Obj | null)?.kind === "witness")).map(bare)
    .map((e, i) => ({ ...e, seq: i + 1 }));
  const head = chain(events).at(-1) as ChainedEvent;
  for (const note of notes) {
    events.push({ seq: events.length + 1, at: "2026-11-24T14:00:00.000Z", type: "note", actor: { kind: "server", id: "taskforce" },
      data: { kind: "witness", where: "github-pull-request", pullRequest: PR, root: head.hash, seq: head.seq, ...note } });
  }
  const chained = chain(events);
  const { seal: _seal, ...rest } = file;
  return { ...rest, events: chained, root: chained.at(-1)?.hash };
}

const FIRST = { written: false, retrying: true, reason: "GitHub can't be reached: nothing changed. Try again in a moment." };

describe("c-d : le vérificateur lit les deux notes du témoin", () => {
  it("un premier échec puis le témoin écrit : l'échec se dit comme tel, sans « No witness »", async () => {
    const verdict = await verifyEvidence(JSON.stringify(withWitness(FIRST, { written: true, comment: `${PR}#issuecomment-2` })));
    assert.equal(verdict.ok, true, verdict.message);
    assert.ok(verdict.message.includes("[--] The witness was not written at first: GitHub can't be reached: nothing changed. "
      + "Try again in a moment. TaskForce tried again."), verdict.message);
    assert.match(verdict.message, /\[ok\] Witness: the head sha256:[0-9a-f]{64} \(event \d+\) was written on https:\/\/github\.com\/acme\/website\/pull\/212#issuecomment-2\./);
    assert.doesNotMatch(verdict.message, /No witness/);
  });

  it("un premier échec seul : TaskForce reprend encore, le dossier le dit", async () => {
    const verdict = await verifyEvidence(JSON.stringify(withWitness(FIRST)));
    assert.ok(verdict.message.includes("[!!] No witness yet: GitHub can't be reached: nothing changed. Try again in a moment. "
      + "TaskForce tries again during the seven days after the mission ended."), verdict.message);
  });

  it("un premier échec puis l'abandon au bout de sept jours", async () => {
    const verdict = await verifyEvidence(JSON.stringify(withWitness(FIRST, { written: false, abandoned: true,
      reason: "TaskForce could not write it in the pull request within the seven days after the mission ended, and stopped trying" })));
    assert.match(verdict.message, /\[--\] The witness was not written at first: /);
    assert.ok(verdict.message.includes("[!!] No witness: TaskForce could not write it in the pull request within the seven days "
      + "after the mission ended, and stopped trying."), verdict.message);
  });

  it("une raison qui finit déjà par un point n'en prend pas un second", async () => {
    const verdict = await verifyEvidence(JSON.stringify(withWitness({ written: false, reason: "This mission has no pull request." })));
    assert.ok(verdict.message.includes("[!!] No witness: This mission has no pull request.\n")
      || verdict.message.endsWith("[!!] No witness: This mission has no pull request."), verdict.message);
    assert.doesNotMatch(verdict.message, /pull request\.\./);
  });
});
