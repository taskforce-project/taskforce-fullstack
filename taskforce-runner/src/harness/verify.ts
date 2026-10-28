import { firstBrokenLink, type ChainedEvent } from "./evidence.js";

/**
 * Vérifie un dossier de preuve exporté (`taskforce-evidence/1`, contracts/evidence) sans TaskForce : chaque empreinte
 * est recalculée, et la racine doit être celle du dernier événement. Une ligne de verdict, jamais d'exception.
 */
export interface Verdict {
  ok: boolean;
  message: string;
}

export function verifyEvidence(text: string): Verdict {
  let file: { format?: unknown; events?: unknown; root?: unknown };
  try {
    file = JSON.parse(text) as typeof file;
  } catch {
    return { ok: false, message: "Not a JSON file." };
  }
  if (file.format !== "taskforce-evidence/1" || !Array.isArray(file.events) || file.events.length === 0) {
    return { ok: false, message: "Not a TaskForce evidence file (taskforce-evidence/1) with events." };
  }
  const events = file.events as ChainedEvent[];
  const broken = firstBrokenLink(events);
  if (broken >= 0) {
    return { ok: false, message: `The chain breaks at event ${events[broken]?.seq ?? broken + 1}: the file was changed after it was written.` };
  }
  if (events.at(-1)?.hash !== file.root) {
    return { ok: false, message: "Every event holds, but the root is not the hash of the last event: an event was removed at the end." };
  }
  return { ok: true, message: `Every hash holds: ${events.length} events, root ${String(file.root)}.` };
}
