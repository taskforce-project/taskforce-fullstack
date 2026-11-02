import type { IssueActivity } from "@/lib/api/issue-service";
import type { CONSTANTS_EN } from "@/lib/constants_en";

// ---------------------------------------------------------------------------
// Une ligne de l'activité d'une issue : qui a fait quoi (recette du 01/11/2026). « Pierre created, prepared by Cortex »,
// puis ce que l'agent d'une mission a fait au nom de la personne qui l'a déléguée (« Claude Code checked "Update the
// README" for Pierre », « Claude Code opened pull request #1 for Pierre »), puis le geste de la personne sur le résultat
// (« Pierre applied the result »).
// ---------------------------------------------------------------------------

type ActivityTexts = (typeof CONSTANTS_EN)["issueActivity"];

export interface ActivityLine {
  /** Qui l'a fait : la personne, ou l'agent qui a agi pour elle. */
  who: string;
  /** Ce qui a été fait. */
  what: string;
  /** Ce qui a changé, de l'ancienne valeur à la nouvelle ; null quand il n'y a rien à montrer. */
  change: { from: string; to: string } | null;
  /** Le lien de ce dont la ligne parle (la pull request) ; null sinon. */
  link: { label: string; href: string } | null;
  /** Au nom de qui l'agent a agi (« for Pierre ») ; null quand la personne a agi elle-même. */
  forWhom: string | null;
}

const PULL = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/(\d{1,9})(?:[/?#].*)?$/;

const fill = (text: string, values: Record<string, string>): string =>
  text.replace(/\{(\w+)\}/g, (all, key: string) => values[key] ?? all);

/** La ligne d'activité, dans les mots de l'interface. */
export function describeActivity(a: IssueActivity, t: ActivityTexts): ActivityLine {
  const actor = a.actor ? (a.actor.displayName ?? a.actor.email) : t.system;
  const via = a.via?.trim() || null;
  const line: ActivityLine = { who: actor, what: "", change: null, link: null, forWhom: null };
  // Une issue créée depuis la carte de Cortex : la personne l'a créée, Cortex l'a préparée.
  if (a.action === "CREATED") {
    return { ...line, what: via ? fill(t.createdVia, { via }) : t.created };
  }
  // Ce qu'un agent a fait au nom de la personne : l'agent le dit, pour elle (si elle a encore un compte).
  if (via) {
    line.who = via;
    line.forWhom = a.actor ? fill(t.forWhom, { who: actor }) : null;
  }
  const item = a.newValue ?? "";
  switch (a.action) {
    case "CHECKLIST_CHECKED":
      return { ...line, what: fill(t.checked, { item }) };
    case "CHECKLIST_UNCHECKED":
      return { ...line, what: fill(t.unchecked, { item }) };
    case "PULL_REQUEST_OPENED": {
      const pr = PULL.exec(item);
      return pr
        ? { ...line, what: t.openedPullRequest, link: { label: `#${pr[1]}`, href: item } }
        : { ...line, what: t.openedAPullRequest };
    }
    case "MISSION_APPLIED":
      return { ...line, what: t.applied };
    case "MISSION_DISCARDED":
      return { ...line, what: t.discarded };
    case "MISSION_RETRIED":
      return { ...line, what: t.retried };
    // La mission n'a rien changé : la personne a terminé l'issue (rejeu de la 1.8.0).
    case "MISSION_MARKED_DONE":
      return { ...line, what: t.markedDone };
    default:
      return {
        ...line,
        what: a.action.replaceAll("_", " ").toLowerCase(),
        change: a.oldValue && a.newValue ? { from: a.oldValue, to: a.newValue } : null,
      };
  }
}
