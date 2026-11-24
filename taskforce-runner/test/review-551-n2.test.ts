import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { MAX_FACT, reportedFacts, TaskforceApi } from "../src/api.js";
import { chain, type ChainedEvent, type EventInput, type Json } from "../src/harness/engine/rules-engine.js";
import { verifyEvidence } from "../src/harness/verify.js";

/**
 * R159 de #551, second tour, N2 (sonde A) : un fait de plus de 4 000 caractères faisait refuser tout le lot ; un agent
 * qui le voulait en faisait un trou par commande trop longue, que le serveur marquait.
 */

type Obj = Record<string, unknown>;
type File = Obj & { events: ChainedEvent[]; mission: Obj; root?: string; seal?: Obj };

const EXAMPLE = readFileSync(new URL("../../contracts/evidence/example-mission.json", import.meta.url), "utf8");
const example = (): File => JSON.parse(EXAMPLE) as File;
const bare = ({ seq, at, type, actor, data }: ChainedEvent): EventInput => ({ seq, at, type, actor, data });

/** La chaîne refaite après une réécriture, sans sceau ni témoin : ils nommaient l'ancienne tête. */
function rechain(file: File, events: ChainedEvent[]): File {
  const kept = events.filter((e) => !(e.type === "note" && (e.data as Obj | null)?.kind === "witness"));
  const chained = chain(kept.map((e, i) => ({ ...bare(e), seq: i + 1 })));
  const { seal: _seal, ...rest } = file;
  return { ...rest, events: chained, root: chained.at(-1)?.hash };
}

describe("N2, sonde A : un fait de plus de 4 000 caractères part coupé, et le lot passe", () => {
  it("chaque valeur au plus 4 000 unités, la coupe marquée ; un fait court ne change pas", () => {
    const command = `echo ${"x".repeat(5000)} && rm -rf build`;
    const [part] = reportedFacts([{ action: "shell", tool: "Bash", command }]);
    assert.ok((part?.command ?? "").length <= MAX_FACT);
    assert.ok((part?.command ?? "").endsWith(`\n[TaskForce cut this text here: ${command.length} characters in all]`));
    assert.deepEqual(reportedFacts([{ action: "file.read", path: "src/a.ts" }]), [{ action: "file.read", path: "src/a.ts" }]);
  });

  it("les événements et les demandes d'accord partent avec leurs faits coupés", async () => {
    const sent: Obj[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).endsWith("/auth/runner/token")) {
        return new Response(JSON.stringify({ data: { accessToken: "t", expiresIn: 3600 } }), { status: 200 });
      }
      sent.push(JSON.parse(String(init?.body)) as Obj);
      return new Response(JSON.stringify({ data: { approvalId: 1, status: "PENDING", expiresAt: "x" } }), { status: 200 });
    }) as typeof fetch;
    try {
      const api = new TaskforceApi({ apiUrl: "http://tf.test/api", clientId: "c", clientSecret: "s" });
      const facts = [{ action: "shell", tool: "Bash", command: "y".repeat(4500) }];
      await api.events(7, [{ kind: "decision", text: "yyy", effect: "ask", n: 1, facts }]);
      await api.requestApproval(7, "Bash", "yyy", "agent", { facts });
      const fromEvents = ((sent[0]?.events as Obj[])[0]?.facts as Obj[])[0]?.command as string;
      const fromApproval = (sent[1]?.facts as Obj[])[0]?.command as string;
      for (const value of [fromEvents, fromApproval]) {
        assert.ok(value.length <= MAX_FACT, `${value.length}`);
        assert.match(value, /\[TaskForce cut this text here: 4500 characters in all\]$/);
      }
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("le vérificateur ne rejuge pas une décision prise sur un fait que le dossier n'a gardé qu'en partie, et le dit", async () => {
    const file = example();
    const decided = file.events.find((e) => e.type === "action.decided" && (e.data as Obj).kind === "decision") as ChainedEvent;
    // Le runner a refusé sur le fait entier ; le dossier n'en garde que le début, que les règles laisseraient passer.
    const [cutPart] = reportedFacts([{ ...((decided.data as Obj).facts as Obj[])[0] as Record<string, string>, path: `src/${"a".repeat(4100)}.tsx` }]);
    decided.data = { ...(decided.data as Obj), facts: [cutPart] as unknown as Json, effect: "deny" } as Json;
    const verdict = await verifyEvidence(JSON.stringify(rechain(file, file.events)));
    assert.equal(verdict.ok, true, verdict.message);
    assert.match(verdict.message, /\[--\] 1 recorded action was judged on facts longer than the record keeps \(cut at 4000 characters\): it is not judged again\./);
    // Sans la marque, la même décision se rejuge, et ne tient pas.
    decided.data = { ...(decided.data as Obj), facts: [{ ...(cutPart as Obj), path: "src/a.tsx" }] as unknown as Json } as Json;
    const plain = await verifyEvidence(JSON.stringify(rechain(file, file.events)));
    assert.equal(plain.ok, false, plain.message);
    assert.match(plain.message, /the rules give allow \(read-files\), the record says deny/);
  });
});
