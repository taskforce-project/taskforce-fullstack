import { createHash } from "node:crypto";

/**
 * Dossier de preuve `taskforce-evidence/1` (contracts/evidence/taskforce-evidence-1.schema.json) : JSON canonique et
 * chaîne d'empreintes. Le serveur calcule la même chaîne à la réception ; un export se vérifie sans TaskForce.
 */

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export const ZERO_HASH = `sha256:${"0".repeat(64)}`;

/**
 * Clés triées par unités UTF-16, aucun espace, entiers seulement, chaînes échappées comme JSON.stringify.
 * Un nombre décimal est refusé : les événements n'en portent jamais.
 */
export function canonicalJson(value: Json): string {
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isInteger(value)) throw new Error("Decimal numbers are not allowed in evidence events.");
    return String(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k] as Json)}`).join(",")}}`;
}

export function sha256(text: string): string {
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
}

export interface EventInput {
  seq: number;
  at: string;
  type: string;
  actor: { kind: string; id: string };
  data: { [key: string]: Json };
}

export interface ChainedEvent extends EventInput {
  prev: string;
  hash: string;
}

/** Empreinte d'un événement : SHA-256 de `prev`, d'un saut de ligne, puis du JSON canonique de l'événement sans `hash`. */
export function link(prev: string, event: EventInput): ChainedEvent {
  const withPrev = { ...event, prev };
  const hash = sha256(`${prev}\n${canonicalJson(withPrev as unknown as Json)}`);
  return { ...withPrev, hash };
}

export function chain(events: EventInput[]): ChainedEvent[] {
  let prev = ZERO_HASH;
  return events.map((e) => {
    const chained = link(prev, e);
    prev = chained.hash;
    return chained;
  });
}

/** Recalcule la chaîne : rend l'indice du premier événement qui ne tient pas, ou -1 si tout tient. */
export function firstBrokenLink(events: ChainedEvent[]): number {
  let prev = ZERO_HASH;
  for (let i = 0; i < events.length; i++) {
    const event = events[i] as ChainedEvent;
    const { hash, prev: claimedPrev, ...input } = event;
    if (claimedPrev !== prev || link(prev, input).hash !== hash) return i;
    prev = hash;
  }
  return -1;
}
