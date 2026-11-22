import { chainOf, readDossier, type Line } from "./dossier.js";
import { bundleDigest, type RulesBundle } from "./engine/rules-engine.js";

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
 * est recalculée et la racine doit être celle du dernier événement ; puis l'en-tête, les textes, le paquet de règles et
 * chaque décision rejugée, les trous, le sceau et le témoin ({@link readDossier}). Un verdict, jamais d'exception : la
 * première ligne dit si la chaîne tient, les suivantes ce que le reste prouve ou ne prouve pas.
 */
export interface Verdict {
  ok: boolean;
  message: string;
  lines: Line[];
}

export interface VerifyOptions {
  /** La clé que l'on croit : son identifiant `sha256:...`, ou sa clé publique. */
  key?: string;
}

const MARK: Record<Line["level"], string> = { ok: "[ok]", info: "[--]", warn: "[!!]", fail: "[KO]" };

export function verifyEvidence(text: string, options: VerifyOptions = {}): Verdict {
  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch {
    return { ok: false, message: "Not a JSON file.", lines: [] };
  }
  if (!file || typeof file !== "object" || Array.isArray(file)) {
    return { ok: false, message: "Not a TaskForce evidence file (taskforce-evidence/1) with events.", lines: [] };
  }
  const record = file as Record<string, unknown>;
  const chain = chainOf(record);
  if (!chain.ok) return { ok: false, message: chain.message, lines: [] };
  const head = `Every hash holds: ${chain.events.length} events, root ${String(record.root)}.`;
  const lines = readDossier(record, options);
  const ok = lines.every((line) => line.level !== "fail");
  return {
    ok,
    message: [head, ...lines.map((line) => `${MARK[line.level]} ${line.text}`)].join("\n"),
    lines,
  };
}
