import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

import type { RunnerChanges, RunnerFileChange } from "./api.js";
import { log } from "./log.js";
import { run, runOrThrow } from "./proc.js";

/**
 * Les changements d'une mission, sous les yeux (R139, séance n°20) : le runner lit l'état réel de son dossier de travail
 * (`git diff --numstat` et le patch contre la base, ou les fichiers du dossier jetable) après chaque écriture de l'agent,
 * et l'envoie à TaskForce. Rien ne vient de ce que l'agent dit avoir fait : un compte de lignes faux est le signal d'arrêt.
 */

/** Plafonds : le compte de lignes de chaque fichier part toujours, le texte seulement dans ces limites. */
export const MAX_FILES = 300;
export const MAX_BODY = 60_000;
export const MAX_SEND_BODY = 400_000;
/** Envois par mission, le dernier compris : au-delà, seul l'état final part encore. */
export const MAX_SENDS = 300;

export interface SnapshotFile extends Omit<RunnerFileChange, "body"> {
  body: string | null;
}

export interface ChangeSnapshot {
  mode: "repo" | "scratch";
  /** Le commit d'avant la mission ; absent d'un dossier jetable. */
  base: string | null;
  files: SnapshotFile[];
  /** Les fichiers au-delà du plafond, comptés dans les totaux mais pas listés. */
  more: number;
  added: number;
  removed: number;
}

/**
 * Un fichier qui peut porter un secret : son compte de lignes part, son contenu jamais (R133 : le détail reste un clic
 * plus loin, sur le poste ou dans la pull request). Le dossier de preuve n'en garde pas plus.
 */
const SENSITIVE = [
  /(^|\/)\.env(\.(?!example$|sample$|template$|dist$)[^/]+)?$/i,
  /\.(pem|key|p12|pfx|jks|keystore|asc|gpg)$/i,
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i,
  /(^|\/)\.(npmrc|pypirc|netrc|git-credentials)$/i,
  /(^|\/)(credentials|secrets?)(\.[a-z0-9]+)?$/i,
];

export function isSensitive(path: string): boolean {
  return SENSITIVE.some((pattern) => pattern.test(path));
}

const hash = (text: string | Buffer): string => createHash("sha256").update(text).digest("hex").slice(0, 32);

/** `12\t1\tsrc/a.ts\0-\t-\tlogo.png\0` : les comptes de chaque fichier ; un binaire n'a pas de lignes. */
export function parseNumstat(text: string): Array<{ path: string; added: number | null; removed: number | null }> {
  return text.split("\0").filter(Boolean).map((record) => {
    const [added = "", removed = "", ...rest] = record.split("\t");
    const lines = (value: string): number | null => (value === "-" ? null : Number.parseInt(value, 10));
    return { path: rest.join("\t"), added: lines(added), removed: lines(removed) };
  });
}

/**
 * Un patch complet, coupé par fichier. Une ligne de contenu commence par une espace, `+`, `-` ou `\` : seul un en-tête
 * commence par `diff --git `. On cherche les débuts de ligne à la main : le `^` multiligne des expressions régulières
 * s'arrête aussi sur un `\r` seul, qu'un fichier peut contenir.
 */
export function splitPatch(patch: string): string[] {
  const sections: string[] = [];
  const header = "diff --git ";
  let start = patch.startsWith(header) ? 0 : -1;
  let from = 0;
  for (;;) {
    const newline = patch.indexOf("\n", from);
    if (newline < 0) break;
    from = newline + 1;
    if (patch.startsWith(header, from)) {
      if (start >= 0) sections.push(patch.slice(start, from));
      start = from;
    }
  }
  if (start >= 0) sections.push(patch.slice(start));
  return sections;
}

/** Ce qu'une section de patch garde pour l'écran : ses blocs `@@`, sans son en-tête. */
export function hunksOf(section: string): string {
  const at = section.startsWith("@@ ") ? 0 : section.indexOf("\n@@ ");
  return at < 0 ? "" : section.slice(at === 0 ? 0 : at + 1).replace(/\n$/, "");
}

function statusOf(section: string): RunnerFileChange["status"] {
  const head = section.slice(0, Math.max(section.indexOf("\n@@ "), 0) || 600);
  if (/\nnew file mode /.test(head)) return "added";
  if (/\ndeleted file mode /.test(head)) return "deleted";
  return "modified";
}

/** Le texte borné, coupé à une fin de ligne. */
function clipped(body: string): { body: string; truncated: boolean } {
  if (body.length <= MAX_BODY) return { body, truncated: false };
  const end = body.lastIndexOf("\n", MAX_BODY);
  return { body: body.slice(0, end > 0 ? end : MAX_BODY), truncated: true };
}

function summed(mode: ChangeSnapshot["mode"], base: string | null, all: SnapshotFile[]): ChangeSnapshot {
  return {
    mode, base,
    files: all.slice(0, MAX_FILES),
    more: Math.max(0, all.length - MAX_FILES),
    added: all.reduce((sum, file) => sum + (file.added ?? 0), 0),
    removed: all.reduce((sum, file) => sum + (file.removed ?? 0), 0),
  };
}

/** Jamais un programme désigné par le dépôt ou sa configuration : ni diff externe, ni filtre, ni `core.fsmonitor`. */
const SAFE_GIT = ["-c", "core.quotePath=false", "-c", "core.fsmonitor=false"];
const DIFF = ["--no-renames", "--no-ext-diff", "--no-textconv", "--no-color"];

/**
 * Ce que le dépôt porte contre sa base. Avec `liveIndex` : l'état du dossier de travail, ce que l'agent n'a pas encore
 * commité compris, lu avec un index temporaire pour ne jamais toucher à l'index de l'agent (`git add -N` le changerait
 * sous ses pieds). Sans lui : ce que les commits portent, une fois l'agent parti ; ce que les tests laissent ne compte pas.
 */
export async function repoChanges(dir: string, base: string, liveIndex?: string): Promise<ChangeSnapshot> {
  const git = (args: string[], env?: NodeJS.ProcessEnv) =>
    runOrThrow("git", ["-C", dir, ...SAFE_GIT, ...args], { timeoutMs: 120_000, env: env ?? process.env, raw: true });
  let target: string[];
  let env: NodeJS.ProcessEnv | undefined;
  if (liveIndex) {
    mkdirSync(dirname(liveIndex), { recursive: true });
    env = { ...process.env, GIT_INDEX_FILE: liveIndex };
    await git(["read-tree", "HEAD"], env);
    // --ignore-errors, et son code de retour ignoré : un fichier que l'agent tient ouvert sous Windows ne coûte pas le relevé.
    await run("git", ["-C", dir, ...SAFE_GIT, "add", "-A", "--ignore-errors"], { timeoutMs: 120_000, env });
    target = ["--cached", base];
  } else {
    target = [base, "HEAD"];
  }
  const numstat = parseNumstat(await git(["diff", "--numstat", "-z", ...DIFF, ...target], env));
  const sections = splitPatch(await git(["diff", "-U3", ...DIFF, ...target], env));
  const known = sections.length === numstat.length;
  if (!known) log.warn(`Changes: ${numstat.length} files but ${sections.length} patch sections, the diffs are not sent.`);

  const files = numstat.map(({ path, added, removed }, index): SnapshotFile => {
    const section = known ? (sections[index] ?? "") : "";
    const binary = added === null || removed === null;
    const withheld = isSensitive(path);
    const { body, truncated } = binary || withheld || !known
      ? { body: null, truncated: !known && !binary && !withheld }
      : clipped(hunksOf(section));
    return {
      path, added, removed, binary, withheld, truncated,
      status: known ? statusOf(section) : "modified",
      // L'empreinte d'un fichier sensible ne doit rien dire de son contenu.
      revision: withheld ? `withheld-${added}-${removed}` : hash(section || `${added}/${removed}`),
      body: body === "" ? null : body,
    };
  });
  return summed("repo", base, files);
}

/** Pas d'historique à relire dans ces dossiers : l'outillage de l'agent, pas son travail. */
const SKIPPED_DIRS = new Set([".git", ".claude", "node_modules", ".cache"]);
const MAX_WALKED = 2_000;

/** Les fichiers d'un dossier, chemins relatifs à barres obliques, dans l'ordre. */
function walk(root: string): string[] {
  const out: string[] = [];
  const visit = (relative: string): void => {
    for (const entry of readdirSync(join(root, relative), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (out.length >= MAX_WALKED) return;
      const path = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRS.has(entry.name)) visit(path);
      } else if (entry.isFile()) {
        out.push(path);
      }
    }
  };
  visit("");
  return out;
}

/** Au-delà, un brouillon du dossier jetable n'est pas relu : son contenu ne tiendrait pas à l'écran. */
const MAX_SCRATCH_READ = 2_000_000;

/**
 * Un dossier jetable n'a ni dépôt ni « avant » : chaque fichier s'y montre écrit, avec son contenu. Il ne se remet pas
 * comme avant (il n'y a pas d'avant), et n'est pas livré : seul ce que l'agent poste dans TaskForce compte (R15).
 */
export function scratchChanges(dir: string): ChangeSnapshot {
  const files = walk(dir).map((path): SnapshotFile => {
    const size = statSync(join(dir, path)).size;
    const withheld = isSensitive(path);
    const big = size > MAX_SCRATCH_READ;
    const bytes = big ? Buffer.alloc(0) : readFileSync(join(dir, path));
    const binary = !big && bytes.subarray(0, 8000).includes(0);
    const text = big || binary ? "" : bytes.toString("utf8");
    const lines = text === "" ? 0 : text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
    const { body, truncated } = big || binary || withheld ? { body: null, truncated: big } : clipped(text);
    return {
      path, added: binary || big ? null : lines, removed: binary || big ? null : 0, binary: binary || big, withheld, truncated,
      status: "written",
      revision: withheld ? `withheld-${lines}` : big ? `big-${size}` : hash(bytes),
      body: body === "" ? null : body,
    };
  });
  return summed("scratch", null, files);
}

export interface ChangeSink {
  changes(runId: number, changes: RunnerChanges): Promise<void>;
}

export interface ChangeTrackerOptions {
  /** Attente après la dernière écriture, puis attente maximale tant que l'agent écrit sans s'arrêter. */
  quietMs: number;
  maxWaitMs: number;
  maxSends: number;
}

const DEFAULTS: ChangeTrackerOptions = { quietMs: 1_200, maxWaitMs: 6_000, maxSends: MAX_SENDS };

/**
 * Le relevé en direct d'une mission : `touch` après chaque outil qui a pu écrire, un relevé après un court silence, un à
 * la fois, et un envoi seulement si quelque chose a bougé. Comme la chronologie, un confort : un échec n'arrête jamais
 * l'agent. Un fichier dont le texte n'a pas changé n'est pas renvoyé.
 */
export class ChangeTracker {
  private timer: NodeJS.Timeout | null = null;
  private firstTouch = 0;
  private chain: Promise<void> = Promise.resolve();
  private sends = 0;
  private lastDigest = "";
  private warned = false;
  private closed = false;
  private readonly sentBodies = new Map<string, string>();
  private readonly options: ChangeTrackerOptions;

  constructor(
    private readonly sink: ChangeSink,
    private readonly runId: number,
    private readonly take: () => Promise<ChangeSnapshot> | ChangeSnapshot,
    options: Partial<ChangeTrackerOptions> = {},
  ) {
    this.options = { ...DEFAULTS, ...options };
  }

  /** Un outil vient de pouvoir écrire. */
  touch(): void {
    if (this.closed || this.sends >= this.options.maxSends) return;
    const now = Date.now();
    if (!this.timer) this.firstTouch = now;
    else clearTimeout(this.timer);
    const wait = Math.max(0, Math.min(this.options.quietMs, this.firstTouch + this.options.maxWaitMs - now));
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.enqueue(this.take, false);
    }, wait);
  }

  /** Le relevé de départ : ce que la branche porte déjà, sur une reprise. */
  publish(): Promise<void> {
    return this.enqueue(this.take, false);
  }

  /** L'agent a fini : plus de relevé en direct, et un dernier, l'état final, quel que soit le plafond. */
  finish(last: () => Promise<ChangeSnapshot> | ChangeSnapshot = this.take, final = true): Promise<void> {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    return this.enqueue(last, final);
  }

  /** L'état que TaskForce a déjà ne se renvoie pas ; un relevé qui échoue attend le suivant. */
  private enqueue(take: () => Promise<ChangeSnapshot> | ChangeSnapshot, final: boolean): Promise<void> {
    this.chain = this.chain.then(async () => {
      try {
        const snapshot = await take();
        const digest = hash(JSON.stringify([snapshot.more, snapshot.files.map((f) => [f.path, f.revision, f.added, f.removed])]));
        if (digest === this.lastDigest && !final) return;
        if (final || this.sends < this.options.maxSends) await this.send(snapshot, final, digest);
      } catch (e) {
        if (!this.warned) log.warn(`Changes not sent to TaskForce: ${(e as Error).message}`);
        this.warned = true;
        this.lastDigest = "";
        this.sentBodies.clear();
      }
    });
    return this.chain;
  }

  private async send(snapshot: ChangeSnapshot, final: boolean, digest: string): Promise<void> {
    let budget = MAX_SEND_BODY;
    const sending = new Map<string, string>();
    const files = snapshot.files.map(({ body, ...file }): RunnerFileChange => {
      if (body === null || this.sentBodies.get(file.path) === file.revision) return file;
      if (body.length > budget) return { ...file, truncated: true };
      budget -= body.length;
      sending.set(file.path, file.revision);
      return { ...file, body };
    });
    await this.sink.changes(this.runId, {
      mode: snapshot.mode, ...(snapshot.base ? { base: snapshot.base } : {}), files, more: snapshot.more,
      added: snapshot.added, removed: snapshot.removed, final,
    });
    this.sends++;
    this.lastDigest = digest;
    for (const [path, revision] of sending) this.sentBodies.set(path, revision);
  }
}

/** Le chemin de l'index temporaire d'un run, hors du dossier de travail ; à supprimer à la fin. */
export function liveIndexPath(home: string, runId: number): string {
  return join(home, "tmp", `run-${runId}-index`);
}

export function removeLiveIndex(path: string): void {
  rmSync(path, { force: true });
  rmSync(`${path}.lock`, { force: true });
}

/** `git rev-list --count` sur la branche : les commits qu'elle porte depuis sa base. */
export async function commitsSince(dir: string, base: string): Promise<number> {
  const result = await run("git", ["-C", dir, "rev-list", "--count", `${base}..HEAD`]);
  return Number.parseInt(result.stdout.trim(), 10) || 0;
}
