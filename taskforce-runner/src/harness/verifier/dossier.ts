import {
  bundleDigest, canonicalJson, decideAll, firstBrokenLink, type ChainedEvent, type Facts, type Json, type RulesBundle,
} from "../engine/rules-engine.js";
import { concat, ed25519Key, fromBase64, sha256, text, utf8, verifyEd25519, type Bytes } from "./crypto.js";

/**
 * Ce que le vérificateur lit d'un dossier exporté (`taskforce-evidence/1`, contracts/README.md), sans TaskForce ni réseau :
 * la chaîne, l'en-tête tiré de la chaîne, les textes gardés à côté, le paquet de règles et chaque décision rejugée, les
 * trous, le sceau (une enveloppe DSSE d'un énoncé in-toto, signée en Ed25519), et le témoin. L'en-tête et le sceau sont
 * écrits une seconde fois ici, en TypeScript, comme le serveur les écrit en Java (EvidenceHeader, EvidenceSeal) :
 * l'exemple de contracts/evidence les tient ensemble.
 *
 * <p>Rien ici ne dépend de Node : la Web Crypto et le moteur compilé suffisent, et l'app vérifie un dossier avec ce même
 * code (`npm run share:app` le copie dans `frontend/lib/evidence`).</p>
 */

export const FORMAT = "taskforce-evidence/1";
export const PAYLOAD_TYPE = "application/vnd.in-toto+json";
export const STATEMENT_TYPE = "https://in-toto.io/Statement/v1";
export const PREDICATE_TYPE = "https://taskforce-project.fr/contracts/taskforce-evidence/1";

export type Obj = Record<string, unknown>;

const isObj = (value: unknown): value is Obj => value !== null && typeof value === "object" && !Array.isArray(value);

/** L'en-tête tel que la chaîne le donne, et les champs qu'elle couvre (EvidenceHeader côté serveur). */
export function headerOf(events: readonly ChainedEvent[]): { header: Obj; covered: string[] } {
  const header: Obj = {};
  const covered: string[] = [];
  let started: Obj | null = null;
  let agentNote: Obj | null = null;
  for (const event of events) {
    const data = isObj(event.data) ? (event.data as Obj) : null;
    if (!started && event.type === "mission.started") started = data ?? {};
    if (event.type === "note" && data?.kind === "agent") agentNote = data;
  }
  if (!started) return { header, covered };
  const copy = (field: string, as: string): void => {
    if (Object.hasOwn(started as Obj, field)) {
      header[as] = (started as Obj)[field] ?? null;
      covered.push(as);
    }
  };
  copy("mission", "id");
  copy("workspace", "workspace");
  copy("project", "project");
  copy("issue", "issue");
  copy("requestedBy", "requestedBy");
  if (isObj(started.agent)) {
    const agent = started.agent;
    const model = agentNote && agentNote.model !== null && agentNote.model !== undefined ? agentNote.model : agent.model;
    header.agent = { kind: agent.kind ?? null, model: model ?? null, version: agentNote?.version ?? null };
    covered.push("agent");
  }
  if (isObj(started.rules)) {
    header.rules = { version: started.rules.version ?? null, digest: started.rules.digest ?? null };
    covered.push("rules");
  }
  copy("runner", "runner");
  // D'où viennent les faits du runner (R159, M5) : du poste de l'agent. Absent d'une mission sans runner.
  copy("runnerFacts", "runnerFacts");
  copy("taskforce", "taskforce");
  return { header, covered };
}

/** L'encodage préalable à la signature de DSSE (PAE) : `DSSEv1 <len> <type> <len> <corps>`, longueurs en octets. */
export function pae(payloadType: string, payload: Bytes): Bytes {
  const type = utf8(payloadType);
  return concat(utf8(`DSSEv1 ${type.length} ${payloadType} ${payload.length} `), payload);
}

/** L'identifiant d'une clé publique : `sha256:` et l'empreinte de son SubjectPublicKeyInfo en DER. */
export function keyId(spki: Bytes): Promise<string> {
  return sha256(spki);
}

const sameJson = (a: unknown, b: unknown): boolean => {
  try {
    return canonicalJson((a ?? null) as Json) === canonicalJson((b ?? null) as Json);
  } catch {
    return JSON.stringify(a) === JSON.stringify(b);
  }
};

/**
 * Une clé de confiance donnée au vérificateur : son identifiant (`sha256:...`), ou sa clé publique Ed25519 (un bloc PEM
 * `PUBLIC KEY`, ou le SubjectPublicKeyInfo en base64) ; null si elle ne se lit pas.
 */
export async function trustedKeyId(key: string): Promise<string | null> {
  const value = key.trim();
  if (/^sha256:[0-9a-f]{64}$/.test(value)) return value;
  const pem = /-----BEGIN PUBLIC KEY-----([\s\S]*?)-----END PUBLIC KEY-----/.exec(value);
  let spki: Bytes;
  try {
    spki = fromBase64(pem ? (pem[1] ?? "") : value);
  } catch {
    return null;
  }
  return (await ed25519Key(spki)) ? keyId(spki) : null;
}

export type Level = "ok" | "info" | "warn" | "fail";

export interface Line {
  level: Level;
  text: string;
}

/**
 * Ce que le sceau prouve, pour la première ligne du verdict (R159, B1) : signé par la clé que l'on croit (`trusted`),
 * signé par la seule clé que le fichier porte, que n'importe qui peut fabriquer (`self`), pas de sceau (`none`), ou un
 * sceau qui ne tient pas (`broken`).
 */
export type SealState = "trusted" | "self" | "none" | "broken";

export interface Reading {
  lines: Line[];
  seal: SealState;
}

export interface SealReading {
  /** La signature tient avec la clé que l'énoncé porte. */
  valid: boolean;
  statement: Obj | null;
  keyId: string | null;
  reason?: string;
}

/** Ouvre une enveloppe DSSE et vérifie sa signature Ed25519 avec la clé publique de l'énoncé. */
export async function openSeal(envelope: unknown): Promise<SealReading> {
  if (!isObj(envelope) || envelope.payloadType !== PAYLOAD_TYPE || typeof envelope.payload !== "string") {
    return { valid: false, statement: null, keyId: null, reason: "not a DSSE envelope of an in-toto statement" };
  }
  let payload: Bytes;
  let statement: Obj;
  try {
    payload = fromBase64(envelope.payload);
    const parsed: unknown = JSON.parse(text(payload));
    if (!isObj(parsed)) throw new Error("not an object");
    statement = parsed;
  } catch {
    return { valid: false, statement: null, keyId: null, reason: "the envelope does not hold a JSON statement" };
  }
  if (statement._type !== STATEMENT_TYPE || statement.predicateType !== PREDICATE_TYPE) {
    return { valid: false, statement, keyId: null, reason: "the envelope does not hold a TaskForce evidence statement" };
  }
  const key = isObj(statement.predicate) && isObj(statement.predicate.key) ? statement.predicate.key : {};
  if (key.algorithm !== "ed25519" || typeof key.publicKey !== "string") {
    return { valid: false, statement, keyId: null, reason: "the seal is not an Ed25519 signature" };
  }
  let spki: Bytes;
  try {
    spki = fromBase64(key.publicKey);
  } catch {
    return { valid: false, statement, keyId: null, reason: "the public key of the seal is not base64" };
  }
  const id = await keyId(spki);
  if (id !== key.id) return { valid: false, statement, keyId: id, reason: "the key id does not match the public key" };
  const signatures = Array.isArray(envelope.signatures) ? (envelope.signatures as unknown[]) : [];
  const signature = signatures.find((s): s is Obj => isObj(s) && s.keyid === id && typeof s.sig === "string");
  if (!signature) return { valid: false, statement, keyId: id, reason: "no signature of the key the statement names" };
  const publicKey = await ed25519Key(spki);
  if (!publicKey) return { valid: false, statement, keyId: id, reason: "the public key of the seal is not an Ed25519 key" };
  let sig: Bytes;
  try {
    sig = fromBase64(String(signature.sig));
  } catch {
    return { valid: false, statement, keyId: id, reason: "the signature is not base64" };
  }
  return (await verifyEd25519(publicKey, pae(PAYLOAD_TYPE, payload), sig)) ? { valid: true, statement, keyId: id }
    : { valid: false, statement, keyId: id, reason: "the signature does not hold: the statement was changed after it was sealed" };
}

/** Les règles que le runner applique lui-même, et qu'un paquet ne rejuge pas : le plafond, un accord pour la mission. */
const RUNNER_GATES = /^(cap:|allowed for this mission)/;

/** Ce que le dossier garde d'un fait jugé ; au-delà, le runner le coupe et le dit (R159, L4 ; second tour, N2). */
export const MAX_FACT = 4000;
const CUT_MARK = /\n\[TaskForce cut this text here: \d+ characters in all\]$/;

/** Des faits dont l'un a été coupé pour tenir au dossier : les règles ont jugé le fait entier, qu'on n'a plus. */
const cutFacts = (facts: readonly Facts[]): boolean =>
  facts.some((part) => isObj(part) && Object.values(part).some((value) => typeof value === "string" && CUT_MARK.test(value)));

const shortHash = (hash: unknown): string => (typeof hash === "string" ? `${hash.slice(0, 19)}...` : String(hash));

const CUSTODY: Record<string, string> = {
  "same-machine": "the signing key is on the same machine as the agent: the agent could have read it, so this seal does not prove the record was not changed during the mission",
  "separate-machine": "the operator declares the signing key is kept on a machine where no agent runs (TaskForce cannot check this)",
};

/**
 * Un texte gardé à côté de la chaîne, face à l'empreinte que la chaîne porte : `{ salt, text }`, et l'empreinte est le
 * SHA-256 du sel (32 chiffres hexadécimaux) suivi du texte (R159, M6). Un texte sans son sel ne se vérifie pas.
 */
async function textMatches(hash: string, entry: unknown): Promise<boolean> {
  if (!isObj(entry) || typeof entry.salt !== "string" || !/^[0-9a-f]{32}$/.test(entry.salt) || typeof entry.text !== "string") {
    return false;
  }
  return (await sha256(`${entry.salt}${entry.text}`)) === hash;
}

const RUNNER_FACTS = "The runner's facts (its tests, the agent and its model, the numbers of its events) come from the computer "
  + "where the agent works: they are worth what that computer is worth, whatever the custody of the key.";

/**
 * Lit un dossier, ligne à ligne. Une ligne `fail` fait échouer la vérification : la chaîne, l'en-tête, un texte, le
 * paquet, une décision rejugée, le sceau ou le témoin ne tiennent pas. Une ligne `warn` dit ce que le dossier ne prouve
 * pas (un trou, pas de sceau, un sceau que n'importe qui peut faire, une clé sur la machine de l'agent) sans faire
 * échouer. Avec `key`, la clé que l'exploitant publie : un dossier sans sceau, ou scellé par une autre clé, échoue.
 */
export async function readDossier(file: Obj, options: { key?: string } = {}): Promise<Reading> {
  const lines: Line[] = [];
  let sealState: SealState = "none";
  const events = file.events as ChainedEvent[];

  // L'en-tête : chaque champ que la chaîne couvre doit être là, et être celui du fichier.
  const mission = isObj(file.mission) ? file.mission : {};
  const { header, covered } = headerOf(events);
  for (const field of covered) {
    if (!Object.hasOwn(mission, field)) {
      lines.push({ level: "fail", text: `The header has no ${field}, which the chain gives: the header was changed after it was written.` });
      continue;
    }
    if (!sameJson(mission[field], header[field])) {
      lines.push({ level: "fail", text: `The header says ${field} ${JSON.stringify(mission[field])}, the chain says ${JSON.stringify(header[field])}: the header was changed after it was written.` });
    }
  }
  const uncovered = ["id", "workspace", "project", "issue", "requestedBy", "agent", "rules"].filter((f) => !covered.includes(f) && Object.hasOwn(mission, f));
  if (covered.length > 0 && uncovered.length > 0) {
    lines.push({ level: "warn", text: `The chain does not cover ${uncovered.join(", ")} of the header (a mission written before TaskForce 1.18).` });
  } else if (covered.length > 0 && !lines.some((l) => l.level === "fail")) {
    lines.push({ level: "ok", text: "The header comes from the chain." });
  }

  // Les textes gardés à côté : chacun doit être nommé par la chaîne, et avoir l'empreinte qu'elle porte.
  const texts = isObj(file.texts) ? file.texts : {};
  const referenced = new Set<string>();
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (isObj(value)) {
      if (typeof value.sha256 === "string" && typeof value.chars === "number") referenced.add(value.sha256);
      Object.values(value).forEach(walk);
    }
  };
  events.forEach((e) => walk(e.data));
  let badTexts = 0;
  for (const [hash, entry] of Object.entries(texts)) {
    if (!referenced.has(hash)) {
      badTexts++;
      lines.push({ level: "fail", text: `A text kept beside the chain is not named by the chain (${shortHash(hash)}): it was added after the record was written.` });
    } else if (!(await textMatches(hash, entry))) {
      badTexts++;
      lines.push({ level: "fail", text: `A text kept beside the chain does not match its digest ${shortHash(hash)}: it was changed.` });
    }
  }
  const missing = [...referenced].filter((h) => !Object.hasOwn(texts, h)).length;
  if (referenced.size > 0 && badTexts === 0) {
    lines.push({ level: missing > 0 ? "info" : "ok", text: missing > 0
      ? `${referenced.size - missing} of ${referenced.size} texts kept beside the chain match their digest; ${missing} were erased or not exported (the chain keeps their digest).`
      : `The ${referenced.size} texts kept beside the chain match their digests.` });
  }

  // Le paquet de règles : son empreinte, puis chaque décision rejugée avec les faits que la chaîne garde. Sans ses membres
  // nuls, comme le runner le lit à la réclamation (verifiedBundle) et comme l'empreinte le lit.
  const rules = isObj(file.rules)
    ? (JSON.parse(JSON.stringify(file.rules, (_key, v: unknown) => (v === null ? undefined : v))) as RulesBundle)
    : null;
  const declared = isObj(mission.rules) ? mission.rules.digest : undefined;
  if (!rules) {
    lines.push({ level: "warn", text: "The rules bundle is not in this file: a third party cannot judge the decisions again." });
  } else {
    let digest: string | null = null;
    try {
      digest = bundleDigest(rules);
    } catch {
      digest = null;
    }
    if (digest !== rules.digest || (declared !== undefined && digest !== declared)) {
      lines.push({ level: "fail", text: "The rules bundle in this file is not the one the mission received (its digest does not match)." });
    } else {
      let judged = 0;
      let differ = 0;
      let cutShort = 0;
      for (const event of events) {
        const data = isObj(event.data) ? (event.data as Obj) : null;
        if (event.type !== "action.decided" || data?.kind !== "decision" || !Array.isArray(data.facts) || data.facts.length === 0) continue;
        const ruleId = event.actor?.id ?? "none";
        if (RUNNER_GATES.test(ruleId)) continue;
        // Les règles ont jugé le fait entier ; le dossier n'en garde que le début (R159, second tour, N2).
        if (cutFacts(data.facts as Facts[])) {
          cutShort++;
          continue;
        }
        const decision = decideAll(rules, data.facts as Facts[]);
        judged++;
        if (decision.effect !== data.effect || (decision.rule?.id ?? "none") !== ruleId) {
          differ++;
          lines.push({ level: "fail", text: `Event ${event.seq}: the rules give ${decision.effect} (${decision.rule?.id ?? "no rule"}), the record says ${String(data.effect)} (${ruleId}).` });
        }
      }
      if (differ === 0) {
        lines.push({ level: "ok", text: judged > 0
          ? `The rules bundle matches its digest, and judging the ${judged} recorded actions again gives the same decisions.`
          : "The rules bundle matches its digest." });
      }
      if (cutShort > 0) {
        lines.push({ level: "info", text: `${cutShort === 1 ? "1 recorded action was" : `${cutShort} recorded actions were`} judged on facts longer than the record keeps (cut at ${MAX_FACT} characters): ${cutShort === 1 ? "it is" : "they are"} not judged again.` });
      }
    }
  }

  // Les trous : un lot du runner perdu en route, ou un runner qui s'est tu.
  for (const event of events) {
    const data = isObj(event.data) ? (event.data as Obj) : null;
    if (event.type === "note" && data?.kind === "gap") lines.push({ level: "warn", text: `Event ${event.seq}: ${String(data.text)}` });
  }

  // Ce que le runner rapporte vaut ce que vaut le poste de l'agent (R159, M5) ; des tests dont la branche a changé la
  // définition ne disent que ce que donne la version des tests de l'agent.
  if (header.runnerFacts === "agent-machine") lines.push({ level: "warn", text: RUNNER_FACTS });
  for (const event of events) {
    const data = isObj(event.data) ? (event.data as Obj) : null;
    if (event.type !== "test.result" || !Array.isArray(data?.definitionChanged) || data.definitionChanged.length === 0) continue;
    lines.push({ level: "warn", text: `Event ${event.seq}: the branch changed ${data.definitionChanged.map(String).join(", ")}, which defines how its tests run: the tests' result only says that the agent's version of the tests passes.` });
  }

  // Le sceau. Sans la clé de l'exploitant, une signature qui tient ne prouve que l'accord entre le fichier et la clé
  // qu'il porte lui-même : n'importe qui peut en faire une (R159, B1).
  if (file.seal === undefined) {
    lines.push(options.key !== undefined
      ? { level: "fail", text: "Not sealed: you gave --key, and this record carries no seal, so nothing shows that this key saw its chain." }
      : { level: "warn", text: "Not sealed: the mission had not ended when this file was exported, or it ended before TaskForce signed its evidence." });
  } else {
    sealState = "broken";
    const seal = await openSeal(file.seal);
    const statement = seal.statement ?? {};
    const predicate = isObj(statement.predicate) ? statement.predicate : {};
    const seq = typeof predicate.seq === "number" ? predicate.seq : -1;
    const sealed = events[seq - 1];
    const subject = Array.isArray(statement.subject) && isObj(statement.subject[0]) ? statement.subject[0] : {};
    const subjectDigest = isObj(subject.digest) ? subject.digest.sha256 : undefined;
    if (!seal.valid) {
      lines.push({ level: "fail", text: `The seal does not hold: ${seal.reason ?? "unknown reason"}.` });
    } else if (typeof predicate.root !== "string" || subjectDigest !== predicate.root.replace(/^sha256:/, "")
      || subject.name !== `taskforce-mission-${String(mission.id ?? (isObj(predicate.mission) ? predicate.mission.id : ""))}`) {
      lines.push({ level: "fail", text: `The seal's subject (${String(subject.name)}, ${shortHash(subjectDigest)}) is not the root it names (${shortHash(predicate.root)}): an in-toto tool and this check would not agree.` });
    } else if (!sealed || sealed.hash !== predicate.root) {
      lines.push({ level: "fail", text: `The seal names event ${seq} with ${shortHash(predicate.root)}, which is not in this chain.` });
    } else {
      const prefix = headerOf(events.slice(0, seq));
      const expected: Obj = { ...mission };
      for (const field of prefix.covered) expected[field] = prefix.header[field];
      if (!sameJson(predicate.mission, expected)) {
        lines.push({ level: "fail", text: "The seal does not hold the header of this file: the header was changed after it was sealed." });
      } else {
        const key = isObj(predicate.key) ? predicate.key : {};
        const at = `Sealed at event ${seq} on ${String(predicate.sealedAt)}`;
        if (options.key !== undefined) {
          const trusted = await trustedKeyId(options.key);
          if (trusted === null) {
            lines.push({ level: "fail", text: "The key given with --key cannot be read (a key id sha256:..., or an Ed25519 public key)." });
          } else if (trusted !== seal.keyId) {
            lines.push({ level: "fail", text: `The seal was signed by ${String(seal.keyId)}, not by the key you trust (${trusted}).` });
          } else {
            sealState = "trusted";
            lines.push({ level: "ok", text: `${at} by the key you trust (${trusted}): the signature holds.` });
          }
        } else {
          sealState = "self";
          lines.push({ level: "warn", text: `${at} by the key the file carries (${String(seal.keyId)}): the signature holds, but anyone can make such a seal. Check it against the key the operator publishes: npm run verify -- <file> --key <key id>.` });
        }
        if (seq < events.length) lines.push({ level: "warn", text: `Events ${seq + 1} to ${events.length} came after the last seal: they are not signed.` });
        const custody = CUSTODY[String(key.custody)] ?? CUSTODY["same-machine"];
        lines.push({ level: key.custody === "separate-machine" ? "info" : "warn", text: `Key custody: ${custody}.` });
        if (key.kept === false) lines.push({ level: "warn", text: "The key was drawn when the server started and is not kept: the operator cannot publish it." });
      }
    }
  }

  // Le témoin : la tête écrite là où l'exploitant n'est pas seul à écrire.
  const witnesses = events.filter((e) => e.type === "note" && isObj(e.data) && (e.data as Obj).kind === "witness");
  for (const witness of witnesses) {
    const data = witness.data as Obj;
    if (data.written !== true) {
      lines.push({ level: "warn", text: `No witness: ${String(data.reason ?? "it was not written")}.` });
      continue;
    }
    const seq = typeof data.seq === "number" ? data.seq : -1;
    if (events[seq - 1]?.hash !== data.root) {
      lines.push({ level: "fail", text: `The witness names event ${seq} with ${shortHash(data.root)}, which is not in this chain.` });
    } else {
      lines.push({ level: "ok", text: `Witness: the head ${String(data.root)} (event ${seq}) was written on ${String(data.comment ?? data.pullRequest)}. Check that the comment there shows the same digest.` });
    }
  }
  if (witnesses.length === 0) {
    const ended = [...events].reverse().find((e) => e.type === "mission.ended");
    const url = ended && isObj(ended.data) ? (ended.data as Obj).resultUrl : null;
    lines.push({ level: typeof url === "string" && /\/pull\/\d+/.test(url) ? "warn" : "info",
      text: typeof url === "string" && /\/pull\/\d+/.test(url)
        ? "No witness was written in the pull request: only the operator holds this chain."
        : "No witness: this mission has no pull request, so only the operator holds this chain." });
  }
  return { lines, seal: sealState };
}

/** Le dossier est-il bien formé, et sa chaîne tient-elle ? Avant tout le reste. */
export function chainOf(file: Obj): { ok: true; events: ChainedEvent[] } | { ok: false; message: string } {
  if (file.format !== FORMAT || !Array.isArray(file.events) || file.events.length === 0) {
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
  return { ok: true, events };
}
