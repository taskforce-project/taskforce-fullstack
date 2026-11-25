import {
  bundleDigest, canonicalJson, decideAll, firstBrokenLink, type ChainedEvent, type Facts, type Json, type RulesBundle,
} from "../engine/rules-engine.js";
import { concat, ed25519Key, ed25519Supported, fromBase64, sha256, text, utf8, verifyEd25519, type Bytes } from "./crypto.js";

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
 * sceau qui ne tient pas (`broken`), ou un sceau que cette plateforme ne sait pas vérifier, faute d'Ed25519 (`unchecked`).
 */
export type SealState = "trusted" | "self" | "none" | "broken" | "unchecked";

export interface Reading {
  lines: Line[];
  seal: SealState;
  /**
   * Le sceau qui tient a été posé tard (R159, second tour, N5) : sur un dossier fini avant que TaskForce ne scelle, à
   * cette date. Il prouve la chaîne telle qu'elle était ce jour-là, rien de ce qui précède. Null sinon.
   */
  lateOn: string | null;
  /**
   * Les décisions que le vérificateur n'a pas pu rejuger (R159, troisième tour, c-b) : prises sur un fait coupé pour tenir
   * au dossier, ou sans leurs faits. La première ligne les compte.
   */
  notJudged: { cut: number; noFacts: number };
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
const CUT_MARK = /\n\[TaskForce cut this text here: (\d+) characters in all\]$/;

/**
 * Un fait que le runner a coupé pour tenir au dossier (R159 de #551, troisième tour, c-b) : la marque au bout d'un fait de
 * la longueur de la coupe, {@link MAX_FACT} unités, ou une de moins quand la coupe a reculé devant une paire de
 * substitution, et qui annonce plus de {@link MAX_FACT} caractères. Une marque ailleurs ne soustrait rien au rejugement.
 */
function cutToFit(value: unknown): boolean {
  if (typeof value !== "string" || (value.length !== MAX_FACT && value.length !== MAX_FACT - 1)) return false;
  const mark = CUT_MARK.exec(value);
  return mark !== null && Number(mark[1]) > MAX_FACT;
}

/** Des faits dont l'un a été coupé pour tenir au dossier : les règles ont jugé le fait entier, qu'on n'a plus. */
const cutFacts = (facts: readonly Facts[]): boolean => facts.some((part) => isObj(part) && Object.values(part).some(cutToFit));

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

/** Ce que `definitionChanged` porte quand le réglage de test du projet, dans TaskForce, a changé (R159, second tour, L-b). */
export const TEST_SETTING = "taskforce:test-command";

const RUNNER_FACTS = "The runner's facts (its tests, the agent and its model, the numbers of its events) come from the computer "
  + "where the agent works: they are worth what that computer is worth, whatever the custody of the key.";

/** Les champs de l'en-tête qu'un dossier d'avant la 1.18 peut porter sans que la chaîne les couvre. */
const HEADER_FIELDS = ["id", "workspace", "project", "issue", "requestedBy", "agent", "rules"];

/** L'en-tête face à la chaîne : les champs qu'elle couvre, ceux qui diffèrent, ceux que le fichier n'a plus, et le reste. */
export interface HeaderCheck {
  readonly covered: readonly string[];
  readonly differs: readonly string[];
  readonly missing: readonly string[];
  readonly uncovered: readonly string[];
}

/**
 * Les textes gardés à côté de la chaîne, chacun par son empreinte : ceux qui la tiennent, ceux qui ont changé, ceux que
 * la chaîne ne nomme pas (ajoutés après coup), et ceux qu'elle nomme sans que le fichier les porte (effacés, ou pas exportés).
 */
export interface TextsCheck {
  readonly referenced: number;
  readonly matches: readonly string[];
  readonly changed: readonly string[];
  readonly unnamed: readonly string[];
  readonly absent: readonly string[];
}

/** Le paquet de règles : là ou non, son empreinte, et chaque décision rejugée qui ne donne pas la même chose. */
export interface RulesCheck {
  readonly present: boolean;
  readonly digestHolds: boolean;
  readonly judged: number;
  /** Les décisions prises sur un fait que le dossier n'a gardé qu'en partie : elles ne se rejugent pas (second tour, N2). */
  readonly cut: number;
  /** Les décisions des règles qui ne gardent pas leurs faits : elles ne se rejugent pas non plus (troisième tour, c-b). */
  readonly noFacts: number;
  readonly differ: ReadonlyArray<{ readonly seq: number; readonly effect: string; readonly rule: string; readonly recorded: string; readonly recordedRule: string }>;
}

/** Le sceau : ce qu'il prouve, et ce que son énoncé dit de lui. */
export interface SealCheck {
  readonly state: SealState;
  /** Pourquoi il ne tient pas, ou pourquoi la clé donnée ne se lit pas. */
  readonly reason: string | null;
  readonly kind: "signature" | "subject" | "head" | "header" | "key" | "unreadableKey" | "noSeal" | "unsupported" | null;
  readonly seq: number | null;
  readonly sealedAt: string | null;
  readonly keyId: string | null;
  readonly custody: "same-machine" | "separate-machine" | null;
  readonly kept: boolean | null;
  /** Les événements venus après le sceau : rien ne les signe. */
  readonly after: number;
  /** Un sceau tardif, posé sur un dossier fini avant que TaskForce ne scelle (R159, second tour, N5). */
  readonly late: boolean;
}

/** Un témoin : écrit ou non, et si la tête qu'il nomme est dans cette chaîne. */
export interface WitnessCheck {
  readonly seq: number;
  readonly written: boolean;
  readonly holds: boolean;
  readonly root: string | null;
  readonly at: number | null;
  readonly where: string | null;
  /** La clé qui a scellé la tête, que le commentaire porte aussi (R159, second tour, N6) ; nulle pour une note plus ancienne. */
  readonly key: string | null;
  readonly reason: string | null;
  /** Un premier échec, que TaskForce reprend pendant les sept jours qui suivent la fin (R159 de #551, troisième tour, c-d). */
  readonly retrying: boolean;
  /** L'issue d'un témoin que TaskForce n'a pas pu écrire en sept jours : il a cessé d'essayer (c-d). */
  readonly abandoned: boolean;
}

/** Ce qu'un dossier dont la chaîne tient prouve, et ne prouve pas, champ par champ ; {@link readDossier} le dit en lignes. */
export interface DossierCheck {
  readonly header: HeaderCheck;
  readonly texts: TextsCheck;
  readonly rules: RulesCheck;
  readonly gaps: ReadonlyArray<{ readonly seq: number; readonly text: string }>;
  /** Le runner a pris la mission : ses faits viennent du poste de l'agent (R159, M5). */
  readonly runnerFacts: boolean;
  readonly definitionChanged: ReadonlyArray<{ readonly seq: number; readonly paths: readonly string[] }>;
  /** Ce que le runner a regardé de la définition des tests, changé ou non : une liste, pas une preuve (second tour, L-b). */
  readonly definitions: ReadonlyArray<{ readonly seq: number; readonly paths: readonly string[] }>;
  readonly seal: SealCheck;
  readonly witnesses: readonly WitnessCheck[];
}

export interface CheckOptions {
  /** La clé que l'on croit, comme `--key` : un dossier sans sceau, ou scellé par une autre clé, ne tient pas. */
  readonly key?: string;
  /**
   * Les clés qu'une instance de TaskForce dit siennes (sa clé d'aujourd'hui et celles qui ont déjà scellé) : un sceau de
   * l'une d'elles est de confiance ; sans sceau, rien n'échoue pour autant.
   */
  readonly keys?: readonly string[];
}

/**
 * Ce que prouve un dossier dont la chaîne tient ({@link chainOf}), sans rien écrire : l'en-tête face à la chaîne, les
 * textes face à leurs empreintes, le paquet de règles et chaque décision rejugée, les trous, ce que le runner rapporte, le
 * sceau, le témoin. L'app et le vérificateur du runner lisent tous deux ce résultat : le même moteur, le même verdict.
 */
export async function checkDossier(file: Obj, options: CheckOptions = {}): Promise<DossierCheck> {
  const events = file.events as ChainedEvent[];
  const dataOf = (event: ChainedEvent): Obj | null => (isObj(event.data) ? (event.data as Obj) : null);

  // L'en-tête : chaque champ que la chaîne couvre doit être là, et être celui du fichier.
  const mission = isObj(file.mission) ? file.mission : {};
  const { header, covered } = headerOf(events);
  const differs: string[] = [];
  const missingFields: string[] = [];
  for (const field of covered) {
    if (!Object.hasOwn(mission, field)) missingFields.push(field);
    else if (!sameJson(mission[field], header[field])) differs.push(field);
  }
  const uncovered = HEADER_FIELDS.filter((f) => !covered.includes(f) && Object.hasOwn(mission, f));

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
  const matches: string[] = [];
  const changed: string[] = [];
  const unnamed: string[] = [];
  for (const [hash, entry] of Object.entries(texts)) {
    if (!referenced.has(hash)) unnamed.push(hash);
    else if (await textMatches(hash, entry)) matches.push(hash);
    else changed.push(hash);
  }
  const absent = [...referenced].filter((h) => !Object.hasOwn(texts, h));

  // Le paquet de règles : son empreinte, puis chaque décision rejugée avec les faits que la chaîne garde. Sans ses membres
  // nuls, comme le runner le lit à la réclamation (verifiedBundle) et comme l'empreinte le lit.
  const rules = isObj(file.rules)
    ? (JSON.parse(JSON.stringify(file.rules, (_key, v: unknown) => (v === null ? undefined : v))) as RulesBundle)
    : null;
  const declared = isObj(mission.rules) ? mission.rules.digest : undefined;
  let digestHolds = false;
  let judged = 0;
  let cut = 0;
  let noFacts = 0;
  const differ: Array<{ seq: number; effect: string; rule: string; recorded: string; recordedRule: string }> = [];
  if (rules) {
    let digest: string | null = null;
    try {
      digest = bundleDigest(rules);
    } catch {
      digest = null;
    }
    digestHolds = digest === rules.digest && (declared === undefined || digest === declared);
    if (digestHolds) {
      for (const event of events) {
        const data = dataOf(event);
        if (event.type !== "action.decided" || data?.kind !== "decision") continue;
        const ruleId = event.actor?.id ?? "none";
        if (RUNNER_GATES.test(ruleId)) continue;
        // Une décision sans ses faits ne se rejuge pas : la première ligne la compte (R159, troisième tour, c-b).
        if (!Array.isArray(data.facts) || data.facts.length === 0) {
          if (event.actor?.kind === "rule") noFacts++;
          continue;
        }
        // Les règles ont jugé le fait entier ; le dossier n'en garde que le début (R159, second tour, N2).
        if (cutFacts(data.facts as Facts[])) {
          cut++;
          continue;
        }
        const decision = decideAll(rules, data.facts as Facts[]);
        judged++;
        if (decision.effect !== data.effect || (decision.rule?.id ?? "none") !== ruleId) {
          differ.push({ seq: event.seq, effect: decision.effect, rule: decision.rule?.id ?? "no rule", recorded: String(data.effect), recordedRule: ruleId });
        }
      }
    }
  }

  // Les trous, ce que le runner rapporte, et des tests dont la branche a changé la définition (R159, M5).
  const gaps = events.filter((e) => e.type === "note" && dataOf(e)?.kind === "gap").map((e) => ({ seq: e.seq, text: String(dataOf(e)?.text) }));
  const definitionChanged = events.flatMap((event) => {
    const data = dataOf(event);
    if (event.type !== "test.result" || !Array.isArray(data?.definitionChanged) || data.definitionChanged.length === 0) return [];
    return [{ seq: event.seq, paths: data.definitionChanged.map(String) }];
  });
  const definitions = events.flatMap((event) => {
    const data = dataOf(event);
    if (event.type !== "test.result" || !Array.isArray(data?.definitions) || data.definitions.length === 0) return [];
    return [{ seq: event.seq, paths: data.definitions.map(String) }];
  });

  // Le sceau. Sans la clé de l'exploitant, une signature qui tient ne prouve que l'accord entre le fichier et la clé
  // qu'il porte lui-même : n'importe qui peut en faire une (R159, B1).
  const seal = await sealCheck(file, events, mission, options);

  // Le témoin : la tête écrite là où l'exploitant n'est pas seul à écrire.
  const witnesses = events.filter((e) => e.type === "note" && dataOf(e)?.kind === "witness").map((witness) => {
    const data = dataOf(witness) as Obj;
    const at = typeof data.seq === "number" ? data.seq : null;
    const written = data.written === true;
    return {
      seq: witness.seq,
      written,
      holds: written && at !== null && events[at - 1]?.hash === data.root,
      root: typeof data.root === "string" ? data.root : null,
      at,
      where: typeof data.comment === "string" ? data.comment : typeof data.pullRequest === "string" ? data.pullRequest : null,
      key: typeof data.key === "string" ? data.key : null,
      reason: typeof data.reason === "string" ? data.reason : null,
      retrying: !written && data.retrying === true,
      abandoned: !written && data.abandoned === true,
    };
  });

  return {
    header: { covered, differs, missing: missingFields, uncovered },
    texts: { referenced: referenced.size, matches, changed, unnamed, absent },
    rules: { present: rules !== null, digestHolds, judged, cut, noFacts, differ },
    gaps,
    runnerFacts: header.runnerFacts === "agent-machine",
    definitionChanged,
    definitions,
    seal,
    witnesses,
  };
}

/** Le sceau du fichier, ouvert et comparé à sa chaîne, à son en-tête et aux clés que l'on croit. */
async function sealCheck(file: Obj, events: readonly ChainedEvent[], mission: Obj, options: CheckOptions): Promise<SealCheck> {
  const empty = { seq: null, sealedAt: null, keyId: null, custody: null, kept: null, after: 0, late: false } as const;
  if (file.seal === undefined) {
    return { ...empty, state: "none", reason: null, kind: options.key !== undefined ? "noSeal" : null };
  }
  const seal = await openSeal(file.seal);
  const statement = seal.statement ?? {};
  const predicate = isObj(statement.predicate) ? statement.predicate : {};
  const seq = typeof predicate.seq === "number" ? predicate.seq : -1;
  const sealed = events[seq - 1];
  const subject = Array.isArray(statement.subject) && isObj(statement.subject[0]) ? statement.subject[0] : {};
  const subjectDigest = isObj(subject.digest) ? subject.digest.sha256 : undefined;
  const key = isObj(predicate.key) ? predicate.key : {};
  const described = {
    seq: seq !== -1 ? seq : null,
    sealedAt: typeof predicate.sealedAt === "string" ? predicate.sealedAt : null,
    keyId: seal.keyId,
    custody: key.custody === "separate-machine" ? "separate-machine" as const : key.custody === "same-machine" ? "same-machine" as const : null,
    kept: typeof key.kept === "boolean" ? key.kept : null,
    after: seq > 0 && seq < events.length ? events.length - seq : 0,
    // Un sceau tardif (R159, second tour, N5) : posé sur un dossier fini avant que TaskForce ne scelle.
    late: predicate.late === true,
  };
  const broken = (kind: SealCheck["kind"], reason: string): SealCheck => ({ ...described, state: "broken", kind, reason });
  if (!seal.valid && !(await ed25519Supported())) return { ...described, state: "unchecked", kind: "unsupported", reason: null };
  if (!seal.valid) return broken("signature", seal.reason ?? "unknown reason");
  if (typeof predicate.root !== "string" || subjectDigest !== predicate.root.replace(/^sha256:/, "")
    || subject.name !== `taskforce-mission-${String(mission.id ?? (isObj(predicate.mission) ? predicate.mission.id : ""))}`) {
    return broken("subject", `${String(subject.name)}, ${shortHash(subjectDigest)} ; ${shortHash(predicate.root)}`);
  }
  if (!sealed || sealed.hash !== predicate.root) return broken("head", shortHash(predicate.root));
  const prefix = headerOf(events.slice(0, seq));
  const expected: Obj = { ...mission };
  for (const field of prefix.covered) expected[field] = prefix.header[field];
  if (!sameJson(predicate.mission, expected)) return broken("header", "the header was changed after it was sealed");
  if (options.key !== undefined) {
    const trusted = await trustedKeyId(options.key);
    if (trusted === null) return { ...described, state: "broken", kind: "unreadableKey", reason: null };
    if (trusted !== seal.keyId) return { ...described, state: "broken", kind: "key", reason: trusted };
    return { ...described, state: "trusted", kind: null, reason: null };
  }
  const known = await Promise.all((options.keys ?? []).map((k) => trustedKeyId(k)));
  if (seal.keyId !== null && known.includes(seal.keyId)) return { ...described, state: "trusted", kind: null, reason: null };
  return { ...described, state: "self", kind: null, reason: null };
}

/**
 * Lit un dossier, ligne à ligne, depuis {@link checkDossier}. Une ligne `fail` fait échouer la vérification : la chaîne,
 * l'en-tête, un texte, le paquet, une décision rejugée, le sceau ou le témoin ne tiennent pas. Une ligne `warn` dit ce
 * que le dossier ne prouve pas (un trou, pas de sceau, un sceau que n'importe qui peut faire, une clé sur la machine de
 * l'agent) sans faire échouer. Avec `key`, la clé que l'exploitant publie : un dossier sans sceau, ou scellé par une autre
 * clé, échoue.
 */
export async function readDossier(file: Obj, options: { key?: string } = {}): Promise<Reading> {
  const check = await checkDossier(file, options);
  const events = file.events as ChainedEvent[];
  const mission = isObj(file.mission) ? file.mission : {};
  const lines: Line[] = [];

  // L'en-tête.
  const { header } = headerOf(events);
  const failedHeader = check.header.differs.length > 0 || check.header.missing.length > 0;
  for (const field of check.header.covered) {
    if (check.header.missing.includes(field)) {
      lines.push({ level: "fail", text: `The header has no ${field}, which the chain gives: the header was changed after it was written.` });
    } else if (check.header.differs.includes(field)) {
      lines.push({ level: "fail", text: `The header says ${field} ${JSON.stringify(mission[field])}, the chain says ${JSON.stringify(header[field])}: the header was changed after it was written.` });
    }
  }
  if (check.header.covered.length > 0 && check.header.uncovered.length > 0) {
    lines.push({ level: "warn", text: `The chain does not cover ${check.header.uncovered.join(", ")} of the header (a mission written before TaskForce 1.18).` });
  } else if (check.header.covered.length > 0 && !failedHeader) {
    lines.push({ level: "ok", text: "The header comes from the chain." });
  }

  // Les textes.
  for (const hash of [...check.texts.unnamed, ...check.texts.changed].sort((a, b) => textOrder(file, a) - textOrder(file, b))) {
    lines.push(check.texts.unnamed.includes(hash)
      ? { level: "fail", text: `A text kept beside the chain is not named by the chain (${shortHash(hash)}): it was added after the record was written.` }
      : { level: "fail", text: `A text kept beside the chain does not match its digest ${shortHash(hash)}: it was changed.` });
  }
  const referenced = check.texts.referenced;
  const missing = check.texts.absent.length;
  if (referenced > 0 && check.texts.unnamed.length === 0 && check.texts.changed.length === 0) {
    lines.push({ level: missing > 0 ? "info" : "ok", text: missing > 0
      ? `${referenced - missing} of ${referenced} texts kept beside the chain match their digest; ${missing} were erased or not exported (the chain keeps their digest).`
      : `The ${referenced} texts kept beside the chain match their digests.` });
  }

  // Le paquet de règles.
  if (!check.rules.present) {
    lines.push({ level: "warn", text: "The rules bundle is not in this file: a third party cannot judge the decisions again." });
  } else if (!check.rules.digestHolds) {
    lines.push({ level: "fail", text: "The rules bundle in this file is not the one the mission received (its digest does not match)." });
  } else {
    for (const d of check.rules.differ) {
      lines.push({ level: "fail", text: `Event ${d.seq}: the rules give ${d.effect} (${d.rule}), the record says ${d.recorded} (${d.recordedRule}).` });
    }
    if (check.rules.differ.length === 0) {
      lines.push({ level: "ok", text: check.rules.judged > 0
        ? `The rules bundle matches its digest, and judging the ${check.rules.judged} recorded actions again gives the same decisions.`
        : "The rules bundle matches its digest." });
    }
    if (check.rules.cut > 0) {
      lines.push({ level: "info", text: `${check.rules.cut === 1 ? "1 recorded action was" : `${check.rules.cut} recorded actions were`} judged on facts longer than the record keeps (cut at ${MAX_FACT} characters): ${check.rules.cut === 1 ? "it is" : "they are"} not judged again.` });
    }
  }

  // Les trous, et ce que le runner rapporte.
  for (const gap of check.gaps) lines.push({ level: "warn", text: `Event ${gap.seq}: ${gap.text}` });
  if (check.runnerFacts) lines.push({ level: "warn", text: RUNNER_FACTS });
  for (const d of check.definitionChanged) {
    const what = d.paths.map((path) => (path === TEST_SETTING ? "the project's test command in TaskForce" : path)).join(", ");
    lines.push({ level: "warn", text: `Event ${d.seq}: what defines how its tests run changed during the mission (${what}): the tests' result only says that the agent's version of the tests passes.` });
  }
  // Une liste de ce que TaskForce cherche, pas la preuve que les tests sont les mêmes (R159, second tour, L-b).
  for (const d of check.definitions) {
    if (check.definitionChanged.some((c) => c.seq === d.seq)) continue;
    lines.push({ level: "info", text: `Event ${d.seq}: none of these files, which define how the tests run, changed: ${d.paths.join(", ")}. It is the list TaskForce looks for, not a proof that the tests are the same.` });
  }

  // Le sceau.
  const s = check.seal;
  if (file.seal === undefined) {
    lines.push(options.key !== undefined
      ? { level: "fail", text: "Not sealed: you gave --key, and this record carries no seal, so nothing shows that this key saw its chain." }
      : { level: "warn", text: "Not sealed: the mission had not ended when this file was exported, or it ended before TaskForce signed its evidence." });
  } else if (s.kind === "unsupported") {
    lines.push({ level: "warn", text: "The seal was not checked: this platform cannot check an Ed25519 signature. Check the file with a recent Node or browser." });
  } else if (s.state === "broken" && s.kind === "signature") {
    lines.push({ level: "fail", text: `The seal does not hold: ${s.reason ?? "unknown reason"}.` });
  } else if (s.state === "broken" && s.kind === "subject") {
    const statement = (await openSeal(file.seal)).statement ?? {};
    const predicate = isObj(statement.predicate) ? statement.predicate : {};
    const subject = Array.isArray(statement.subject) && isObj(statement.subject[0]) ? statement.subject[0] : {};
    const subjectDigest = isObj(subject.digest) ? subject.digest.sha256 : undefined;
    lines.push({ level: "fail", text: `The seal's subject (${String(subject.name)}, ${shortHash(subjectDigest)}) is not the root it names (${shortHash(predicate.root)}): an in-toto tool and this check would not agree.` });
  } else if (s.state === "broken" && s.kind === "head") {
    lines.push({ level: "fail", text: `The seal names event ${s.seq ?? -1} with ${s.reason ?? "?"}, which is not in this chain.` });
  } else if (s.state === "broken" && s.kind === "header") {
    lines.push({ level: "fail", text: "The seal does not hold the header of this file: the header was changed after it was sealed." });
  } else {
    const at = `${s.late ? "Sealed late" : "Sealed"} at event ${s.seq ?? -1} on ${String(s.sealedAt ?? undefined)}`;
    if (s.late) {
      // Ne dire que ce que la chaîne montre : une mission supprimée en cours de route n'a pas de fin (R159, troisième
      // tour, c-f).
      const ended = events.some((e) => e.type === "mission.ended");
      lines.push({ level: "warn", text: `This record was sealed late, on ${String(s.sealedAt)}${ended ? ", after its mission had ended" : ""}: the seal proves the chain as it was on that date, not what happened before.` });
    }
    if (s.kind === "unreadableKey") {
      lines.push({ level: "fail", text: "The key given with --key cannot be read (a key id sha256:..., or an Ed25519 public key)." });
    } else if (s.kind === "key") {
      lines.push({ level: "fail", text: `The seal was signed by ${String(s.keyId)}, not by the key you trust (${String(s.reason)}).` });
    } else if (s.state === "trusted") {
      lines.push({ level: "ok", text: `${at} by the key you trust (${String(s.keyId)}): the signature holds.` });
    } else {
      lines.push({ level: "warn", text: `${at} by the key the file carries (${String(s.keyId)}): the signature holds, but anyone can make such a seal. Check it against the key the operator publishes: npm run verify -- <file> --key <key id>.` });
    }
    if (s.after > 0 && s.seq !== null) lines.push({ level: "warn", text: `Events ${s.seq + 1} to ${events.length} came after the last seal: they are not signed.` });
    const custody = CUSTODY[String(s.custody)] ?? CUSTODY["same-machine"];
    lines.push({ level: s.custody === "separate-machine" ? "info" : "warn", text: `Key custody: ${custody}.` });
    if (s.kept === false) lines.push({ level: "warn", text: "The key was drawn when the server started and is not kept: the operator cannot publish it." });
  }

  // Le témoin. Au plus deux notes (R159 de #551, troisième tour, c-d) : un premier échec, que TaskForce reprend pendant
  // sept jours, puis l'issue.
  for (const [i, w] of check.witnesses.entries()) {
    if (!w.written) {
      const reason = w.reason === null ? "it was not written" : w.reason.replace(/\.$/, "");
      if (w.retrying && i < check.witnesses.length - 1) {
        lines.push({ level: "info", text: `The witness was not written at first: ${reason}. TaskForce tried again.` });
      } else if (w.retrying) {
        lines.push({ level: "warn", text: `No witness yet: ${reason}. TaskForce tries again during the seven days after the mission ended.` });
      } else {
        lines.push({ level: "warn", text: `No witness: ${reason}.` });
      }
    } else if (!w.holds) {
      lines.push({ level: "fail", text: `The witness names event ${w.at ?? -1} with ${shortHash(w.root)}, which is not in this chain.` });
    } else if (w.key !== null) {
      // Le commentaire porte aussi la clé qui a scellé cette tête : datée par GitHub, elle ancre ce que la liste des clés de
      // l'exploitant ne peut pas ancrer (R159, second tour, N6).
      lines.push({ level: "ok", text: `Witness: the head ${String(w.root)} (event ${w.at ?? -1}), sealed by the key ${w.key}, was written on ${String(w.where)}. Check that the comment there shows the same digest and the same key, and that this key is the one you were given.` });
    } else {
      lines.push({ level: "ok", text: `Witness: the head ${String(w.root)} (event ${w.at ?? -1}) was written on ${String(w.where)}. Check that the comment there shows the same digest.` });
    }
  }
  if (check.witnesses.length === 0) {
    const ended = [...events].reverse().find((e) => e.type === "mission.ended");
    const url = ended && isObj(ended.data) ? (ended.data as Obj).resultUrl : null;
    lines.push({ level: typeof url === "string" && /\/pull\/\d+/.test(url) ? "warn" : "info",
      text: typeof url === "string" && /\/pull\/\d+/.test(url)
        ? "No witness was written in the pull request: only the operator holds this chain."
        : "No witness: this mission has no pull request, so only the operator holds this chain." });
  }
  const state = s.kind === "noSeal" || s.kind === "unreadableKey" || s.kind === "key" ? sealStateOf(s) : s.state;
  return { lines, seal: state, lateOn: s.late && (state === "trusted" || state === "self") ? s.sealedAt : null,
    notJudged: { cut: check.rules.cut, noFacts: check.rules.noFacts } };
}

/** Ce que la première ligne dit d'un sceau qui ne tient pas pour la clé donnée. */
function sealStateOf(s: SealCheck): SealState {
  return s.kind === "noSeal" ? "none" : "broken";
}

/** L'ordre d'un texte dans le fichier : les lignes des textes suivent l'ordre où le fichier les range. */
function textOrder(file: Obj, hash: string): number {
  return Object.keys(isObj(file.texts) ? file.texts : {}).indexOf(hash);
}

/** Pourquoi une chaîne ne tient pas : pas un dossier, un événement illisible, un maillon rompu, une racine qui n'est pas la tête. */
export type ChainFailure = "format" | "unreadable" | "link" | "root";

/**
 * Le dossier est-il bien formé, et sa chaîne tient-elle ? Avant tout le reste. Une chaîne rompue dit le numéro de
 * l'événement où elle casse (`brokenAt`).
 */
export function chainOf(file: Obj): { ok: true; events: ChainedEvent[] }
  | { ok: false; message: string; reason: ChainFailure; brokenAt?: number } {
  if (file.format !== FORMAT || !Array.isArray(file.events) || file.events.length === 0) {
    return { ok: false, reason: "format", message: "Not a TaskForce evidence file (taskforce-evidence/1) with events." };
  }
  const events = file.events as ChainedEvent[];
  let broken: number;
  try {
    broken = firstBrokenLink(events);
  } catch (e) {
    // Un événement que le moteur ne sait pas lire (autre chose qu'un objet, un nombre décimal) : rien ne tient.
    return { ok: false, reason: "unreadable", message: `The chain cannot be checked: ${(e as Error).message}` };
  }
  if (broken >= 0) {
    const at = events[broken]?.seq ?? broken + 1;
    return { ok: false, reason: "link", brokenAt: at, message: `The chain breaks at event ${at}: the file was changed after it was written.` };
  }
  if (events.at(-1)?.hash !== file.root) {
    return { ok: false, reason: "root", message: "Every event holds, but the root is not the hash of the last event: an event was removed at the end." };
  }
  return { ok: true, events };
}
