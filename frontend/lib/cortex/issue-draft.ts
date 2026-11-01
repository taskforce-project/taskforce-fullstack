// ---------------------------------------------------------------------------
// L'issue que Cortex prépare en carte (R78, séance n°13) : ce que l'outil create_issue a proposé, que la personne relit,
// modifie et crée. La carte renvoie au serveur les arguments de l'outil, modifiés ; il les rejuge et crée l'issue avec
// les droits de la personne.
// ---------------------------------------------------------------------------

export interface IssueDraft {
  /** La clé ou le nom du projet, tel que Cortex l'a écrit, puis tel que la personne l'a choisi. */
  project: string;
  title: string;
  description: string;
  subtasks: string[];
  /** AAAA-MM-JJ, ou vide. */
  dueDate: string;
  /** Le nom de la colonne, ou vide : le Backlog du projet. */
  status: string;
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

const DAY = /^\d{4}-\d{2}-\d{2}$/;

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/** Lit les arguments que Cortex a donnés à create_issue ; un champ absent ou illisible reste vide. */
export function readIssueDraft(input: string | null): IssueDraft {
  let args: Record<string, unknown> = {};
  try {
    const parsed: unknown = input ? JSON.parse(input) : {};
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) args = parsed as Record<string, unknown>;
  } catch {
    args = {};
  }
  const due = text(args.dueDate);
  return {
    project: text(args.project),
    title: text(args.title),
    description: text(args.description),
    subtasks: Array.isArray(args.subtasks) ? args.subtasks.map(text).filter(Boolean) : [],
    dueDate: DAY.test(due) ? due : "",
    status: text(args.status),
  };
}

/** Les arguments que la carte renvoie pour créer l'issue : seulement ce qui est rempli. */
export function issueDraftInput(draft: IssueDraft): string {
  const args: Record<string, unknown> = { project: draft.project.trim(), title: draft.title.trim() };
  const description = draft.description.trim();
  if (description) args.description = description;
  const subtasks = draft.subtasks.map((s) => s.trim()).filter(Boolean);
  if (subtasks.length > 0) args.subtasks = subtasks;
  if (draft.dueDate) args.dueDate = draft.dueDate;
  const status = draft.status.trim();
  if (status) args.status = status;
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
