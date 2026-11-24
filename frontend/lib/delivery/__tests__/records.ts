import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"

import type { MissionEvidence, MissionEvidenceEvent } from "@/lib/api/delivery-service"
import { chain, type EventInput, type Json } from "@/lib/evidence/engine/rules-engine"

/**
 * Les dossiers d'état de la revue des écrans de #552 (R161), gardés comme essais de la page : l'exemple d'une mission
 * entière (contracts/evidence, écrit et scellé par le serveur), puis, tirés de lui ou écrits avec le moteur du runner, une
 * chaîne cassée, un texte changé, une mission en cours, une mission d'avant la 1.18 finie en échec, des coches héritées.
 */
export const EXAMPLE_PATH = path.resolve(__dirname, "../../../../contracts/evidence/example-mission.json")
export const example = (): MissionEvidence => JSON.parse(readFileSync(EXAMPLE_PATH, "utf8")) as MissionEvidence

/** La clé qui a scellé l'exemple : celle que l'instance dirait sienne. */
export function exampleKey(): string {
  const seal = example().seal as { payload: string }
  const statement = JSON.parse(Buffer.from(seal.payload, "base64").toString("utf8")) as { predicate: { key: { id: string } } }
  return statement.predicate.key.id
}

/** Une décision de l'exemple changée sans refaire la chaîne : elle casse à cet événement (le cas du runner). */
export function brokenChain(): { file: MissionEvidence; at: number } {
  const file = example()
  const decided = file.events.find((e) => e.type === "action.decided") as MissionEvidenceEvent
  decided.data = { ...(decided.data ?? {}), effect: "deny" }
  return { file, at: decided.seq }
}

/** Le titre de la demande changé à côté de la chaîne : son empreinte ne tient plus. */
export function tamperedTitle(): { file: MissionEvidence; hash: string } {
  const file = example()
  const started = file.events[0]?.data as { request: { title: { sha256: string } } }
  const hash = started.request.title.sha256
  const texts = file.texts as Record<string, { salt: string; text: string }>
  texts[hash] = { ...(texts[hash] as { salt: string; text: string }), text: "Fix the header links" }
  return { file, hash }
}

/** Une mission en cours : les seize premiers événements de l'exemple, sans fin ni sceau, comme le serveur les exporte. */
export function running(): MissionEvidence {
  const file = example()
  const events = file.events.slice(0, 16)
  const named = new Set(JSON.stringify(events).match(/sha256:[0-9a-f]{64}/g) ?? [])
  const texts = Object.fromEntries(Object.entries(file.texts ?? {}).filter(([hash]) => named.has(hash)))
  return { format: file.format, mission: file.mission, events, root: events.at(-1)?.hash ?? "", rules: file.rules, texts }
}

/** Des événements chaînés par le moteur du runner, en dossier exporté. */
export function chained(events: ReadonlyArray<{ type: string; data: Record<string, unknown>; actor?: { kind: string; id: string }; at?: string }>,
                        extra: Partial<MissionEvidence> = {}): MissionEvidence {
  const inputs: EventInput[] = events.map((e, i) => ({ seq: i + 1, at: e.at ?? "2026-11-22T08:00:00.000Z",
    type: e.type, actor: e.actor ?? { kind: "server", id: "taskforce" }, data: e.data as { [key: string]: Json } }))
  const list = chain(inputs) as unknown as MissionEvidenceEvent[]
  return { format: "taskforce-evidence/1", events: list, root: list.at(-1)?.hash ?? "", ...extra }
}

/** Un texte gardé à côté de la chaîne, salé comme le serveur le garde : sa référence dans la chaîne, et son entrée. */
export function salted(text: string, salt = "0".repeat(32)): { ref: { sha256: string; chars: number }; entry: [string, { salt: string; text: string }] } {
  const sha256 = `sha256:${createHash("sha256").update(salt + text).digest("hex")}`
  return { ref: { sha256, chars: text.length }, entry: [sha256, { salt, text }] }
}

/** Une grosse mission : douze fichiers changés et un long résumé, pour les replis de la page (R161 M1 et M2). */
export function large(): MissionEvidence {
  const summary = salted(["## What I did", ...Array.from({ length: 8 }, (_, i) => `- Step ${i + 1}`)].join("\n"))
  const files = Array.from({ length: 12 }, (_, i) => ({ path: `src/file-${i}.ts`, status: "modified", added: 1, removed: 0 }))
  return chained([
    { type: "mission.started", data: { mission: 9, workspace: "acme", issue: "WEB-60", runnerFacts: "agent-machine" } },
    { type: "note", actor: { kind: "runner", id: "r" }, data: { kind: "changes", files, added: 12, removed: 0, more: 0, mode: "repo" } },
    { type: "mission.ended", data: { status: "DONE", commits: 1, summary: summary.ref } },
  ], { texts: Object.fromEntries([summary.entry]) })
}

/** Une mission d'avant la 1.18, finie en échec : ni la demande, ni le modèle, ni le sceau ne sont dans son dossier. */
export function olderFailed(): MissionEvidence {
  return chained([
    { type: "mission.started", data: { issue: "WEB-12", requestedBy: "ada@example.com", agent: { kind: "claude-code", model: null },
      rules: { version: 1, digest: `sha256:${"a".repeat(64)}` } } },
    { type: "mission.ended", data: { status: "FAILED", error: "Runner lost" } },
  ], { mission: { id: 3, workspace: "acme", issue: "WEB-12", requestedBy: "ada@example.com" } })
}

/** Des coches héritées : la liste dit deux lignes cochées à la fin, que l'agent de cette mission n'a pas cochées. */
export function inheritedTicks(): MissionEvidence {
  return chained([
    { type: "mission.started", data: { mission: 8, workspace: "acme", issue: "WEB-9", runner: "tf-runner-ada", runnerFacts: "agent-machine" } },
    { type: "note", data: { kind: "checklist", items: [{ id: 1, done: true }, { id: 2, done: true }, { id: 3, done: false }] } },
    { type: "mission.ended", data: { status: "DONE", commits: 0 } },
  ])
}
