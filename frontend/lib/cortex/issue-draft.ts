// ---------------------------------------------------------------------------
// L'issue que Cortex prépare en carte (R78, séance n°13) : ce que l'outil create_issue a proposé, que la personne relit,
// modifie et crée. La carte renvoie au serveur les arguments de l'outil, modifiés ; il les rejuge et crée l'issue avec
// les droits de la personne.
//
// La priorité, l'assigné, les labels, les points et le cycle ne se remplissent que de ce qui existe (recette du
// 01/11/2026) : la carte résout ce que Cortex a écrit parmi les membres, les labels et les cycles du projet, et ce qui ne
// s'y trouve pas reste vide, à remplir sur la carte. Rien n'est inventé.
// ---------------------------------------------------------------------------

export const DRAFT_PRIORITIES = ["NONE", "LOW", "MEDIUM", "HIGH", "URGENT"] as const;

export type DraftPriority = (typeof DRAFT_PRIORITIES)[number];

export interface IssueDraft {
  /** La clé ou le nom du projet, tel que Cortex l'a écrit, puis tel que la personne l'a choisi. */
  project: string;
  title: string;
  description: string;
  /** Les lignes de la checklist de l'issue (pas des sous-issues). */
  checklist: string[];
  /** AAAA-MM-JJ, ou vide. */
  dueDate: string;
  /** Le nom de la colonne, ou vide : le Backlog du projet. */
  status: string;
  /** La priorité, ou vide : celle par défaut. */
  priority: DraftPriority | "";
  /** L'assigné tel que Cortex l'a nommé (nom ou e-mail), puis l'e-mail du membre choisi ; vide : personne. */
  assignee: string;
  /** Les noms des labels. */
  labels: string[];
  /** L'estimation en points (un entier de 1 à 100, en texte), ou vide. */
  points: string;
  /** Le nom du cycle, ou vide. */
  cycle: string;
}

/** Ce qui empêche de créer l'issue. */
export type DraftProblem = "project" | "title" | "past" | "column";

interface NamedProject {
  identifier: string;
  name: string;
}

interface Column {
  name: string;
  category: string;
  isDefault: boolean;
}

interface Member {
  email: string;
  displayName: string | null;
}

interface Named {
  name: string;
}

interface DatedCycle extends Named {
  status: string;
}

/** Les points qu'accepte une issue : de 1 à 100. */
export const MAX_DRAFT_POINTS = 100;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/** Une liste de textes, sans les vides ni ce qui n'est pas du texte. */
const texts = (value: unknown): string[] => (Array.isArray(value) ? value.map(text).filter(Boolean) : []);

const isPriority = (value: string): value is DraftPriority => (DRAFT_PRIORITIES as readonly string[]).includes(value);

/** Des points lisibles : un entier de 1 à 100, en texte ; sinon vide. */
function readPoints(value: unknown): string {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value.trim()) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= MAX_DRAFT_POINTS ? String(n) : "";
}

/**
 * Lit les arguments que Cortex a donnés à create_issue ; un champ absent ou illisible reste vide. `subtasks`, l'ancien
 * nom de la checklist, se lit encore : une carte préparée avant se crée toujours.
 */
export function readIssueDraft(input: string | null): IssueDraft {
  let args: Record<string, unknown> = {};
  try {
    const parsed: unknown = input ? JSON.parse(input) : {};
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) args = parsed as Record<string, unknown>;
  } catch {
    args = {};
  }
  const due = text(args.dueDate);
  const priority = text(args.priority).toUpperCase();
  return {
    project: text(args.project),
    title: text(args.title),
    description: text(args.description),
    checklist: texts(args.checklist ?? args.subtasks),
    dueDate: DAY.test(due) ? due : "",
    status: text(args.status),
    priority: isPriority(priority) ? priority : "",
    assignee: text(args.assignee),
    labels: texts(args.labels),
    points: readPoints(args.points),
    cycle: text(args.cycle),
  };
}

/** Les arguments que la carte renvoie pour créer l'issue : seulement ce qui est rempli. */
export function issueDraftInput(draft: IssueDraft): string {
  const args: Record<string, unknown> = { project: draft.project.trim(), title: draft.title.trim() };
  const description = draft.description.trim();
  if (description) args.description = description;
  const checklist = draft.checklist.map((s) => s.trim()).filter(Boolean);
  if (checklist.length > 0) args.checklist = checklist;
  if (draft.dueDate) args.dueDate = draft.dueDate;
  const status = draft.status.trim();
  if (status) args.status = status;
  if (draft.priority && draft.priority !== "NONE") args.priority = draft.priority;
  const assignee = draft.assignee.trim();
  if (assignee) args.assignee = assignee;
  const labels = draft.labels.map((l) => l.trim()).filter(Boolean);
  if (labels.length > 0) args.labels = labels;
  const points = readPoints(draft.points);
  if (points) args.points = Number(points);
  const cycle = draft.cycle.trim();
  if (cycle) args.cycle = cycle;
  return JSON.stringify(args);
}

/** Le projet que Cortex a nommé : par sa clé, puis par son nom, sans tenir compte de la casse. */
export function findDraftProject<P extends NamedProject>(projects: readonly P[], asked: string): P | null {
  const wanted = asked.trim().toLowerCase();
  if (!wanted) return null;
  return (
    projects.find((p) => p.identifier.toLowerCase() === wanted) ??
    projects.find((p) => p.name.toLowerCase() === wanted) ??
    null
  );
}

/**
 * Le membre du projet que Cortex a nommé, comme le serveur le résout : l'e-mail exact, puis le nom exact, puis une
 * partie du nom ou le début de l'e-mail s'ils ne désignent qu'une personne. Plusieurs, ou aucun : personne, la carte
 * laisse choisir. Jamais un membre pris au hasard.
 */
export function findDraftMember<M extends Member>(members: readonly M[], asked: string): M | null {
  const wanted = asked.trim().toLowerCase();
  if (!wanted) return null;
  const lower = (value: string | null) => (value ?? "").toLowerCase();
  const one = (found: M[]) => (found.length === 1 ? found[0] : null);
  const byName = members.filter((m) => lower(m.displayName) === wanted);
  return (
    one(members.filter((m) => lower(m.email) === wanted)) ??
    one(byName) ??
    (byName.length > 1 ? null : one(members.filter((m) => lower(m.displayName).includes(wanted) || lower(m.email).startsWith(wanted))))
  );
}

/** Le nom d'un membre, ou son e-mail quand il n'en a pas. */
export const memberName = (member: Member): string => member.displayName?.trim() || member.email;

/** Les labels du projet que Cortex a nommés, par leur nom exact sans tenir compte de la casse ; les autres tombent. */
export function draftLabels<L extends Named>(labels: readonly L[], asked: readonly string[]): L[] {
  const found: L[] = [];
  for (const name of asked) {
    const label = labels.find((l) => l.name.toLowerCase() === name.trim().toLowerCase());
    if (label && !found.includes(label)) found.push(label);
  }
  return found;
}

/** Les cycles où une issue peut encore entrer : tous, sauf ceux qui sont terminés. */
export function openCycles<C extends DatedCycle>(cycles: readonly C[]): C[] {
  return cycles.filter((c) => c.status !== "COMPLETED");
}

/** Le cycle que Cortex a nommé, parmi ceux encore ouverts ; un nom inconnu ne donne rien. */
export function draftCycle<C extends DatedCycle>(cycles: readonly C[], asked: string): C | null {
  const wanted = asked.trim().toLowerCase();
  if (!wanted) return null;
  return openCycles(cycles).find((c) => c.name.toLowerCase() === wanted) ?? null;
}

/** La colonne où l'issue arrivera : celle que la carte nomme, sinon la première du Backlog, sinon celle par défaut. */
export function draftColumn<S extends Column>(columns: readonly S[], status: string): S | null {
  const wanted = status.trim().toLowerCase();
  if (wanted) return columns.find((c) => c.name.toLowerCase() === wanted) ?? null;
  return columns.find((c) => c.category === "BACKLOG") ?? columns.find((c) => c.isDefault) ?? null;
}

/**
 * Ce qui empêche de créer l'issue, dans l'ordre où la personne le corrige, ou null. `earliest` est le premier jour
 * accepté (AAAA-MM-JJ) : le serveur laisse un jour de marge, « aujourd'hui » n'étant pas le même jour partout.
 */
export function draftProblem(
  draft: IssueDraft,
  project: NamedProject | null,
  columnFound: boolean,
  earliest: string,
): DraftProblem | null {
  if (!project) return "project";
  if (!draft.title.trim()) return "title";
  if (draft.dueDate && draft.dueDate < earliest) return "past";
  if (draft.status.trim() && !columnFound) return "column";
  return null;
}

/** Une date AAAA-MM-JJ, à afficher : « Friday, Nov 6 ». */
export function formatDraftDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

/** Le jour d'une date locale, AAAA-MM-JJ, décalé de `shift` jours. */
export function localDay(date: Date, shift = 0): string {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate() + shift);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}
