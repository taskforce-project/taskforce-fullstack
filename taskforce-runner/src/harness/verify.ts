import { bundleDigest, firstBrokenLink, type ChainedEvent, type RulesBundle } from "./engine/rules-engine.js";

/**
 * Ce que le runner vérifie avec les empreintes du moteur de règles (celui du serveur, compilé en JavaScript :
 * engine/rules-engine.js) : le paquet de règles qui vient avec une tâche, et un dossier de preuve exporté.
 */

/**
 * Le paquet reçu du serveur, s'il est bien formé et que son empreinte tient ; sinon une erreur : pas de mission sans
 * règles. Il est rendu sans ses membres nuls, comme l'empreinte le lit : le moteur ne voit que ce qui a été signé.
 */
export function verifiedBundle(value: unknown): RulesBundle {
  const bundle = value as RulesBundle | null;
  if (!bundle || bundle.format !== "taskforce-rules/1" || !Array.isArray(bundle.rules)) {
    throw new Error("No valid rules came with the task: the mission does not start without rules.");
  }
  if (!bundle.digest || bundleDigest(bundle) !== bundle.digest) {
    throw new Error("The rules that came with the task do not match their digest: the mission does not start.");
  }
  return JSON.parse(JSON.stringify(bundle, (_key, v: unknown) => (v === null ? undefined : v))) as RulesBundle;
}

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
  let broken: number;
  try {
    broken = firstBrokenLink(events);
  } catch (e) {
    // Un événement que le moteur ne sait pas lire (autre chose qu'un objet, un nombre décimal) : rien ne tient.
    return { ok: false, message: `The chain cannot be checked: ${(e as Error).message}` };
  }
  if (broken >= 0) {
    return { ok: false, message: `The chain breaks at event ${events[broken]?.seq ?? broken + 1}: the file was changed after it was written.` };
  }
  if (events.at(-1)?.hash !== file.root) {
    return { ok: false, message: "Every event holds, but the root is not the hash of the last event: an event was removed at the end." };
  }
  return { ok: true, message: `Every hash holds: ${events.length} events, root ${String(file.root)}.` };
}
