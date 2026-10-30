import type { DeliveryRunApproval } from "@/lib/api/delivery-service";
import type { CONSTANTS_EN } from "@/lib/constants_en";

// ---------------------------------------------------------------------------
// La demande d'accord dite en mots (R78, séance n°13 ; R46, R49) : ce que l'agent veut faire, pourquoi on la pose, ce
// qui se passe si l'on refuse. La raison vient de la règle qui demande ; une demande d'un runner plus ancien, sans
// action connue, garde le nom de l'outil.
// ---------------------------------------------------------------------------

type MissionTexts = (typeof CONSTANTS_EN)["missions"];
type ActionKey = keyof MissionTexts["actions"];

export interface ApprovalWords {
  /** « Claude Code wants to search the web » */
  title: string;
  will: string;
  why: string;
  ifRefused: string;
}

type Asked = Pick<DeliveryRunApproval, "tool" | "askedBy" | "action" | "reason">;

const isAction = (action: string | null | undefined, t: MissionTexts): action is ActionKey =>
  Boolean(action) && action !== "other" && Object.prototype.hasOwnProperty.call(t.actions, action as string);

export function approvalWords(approval: Asked, t: MissionTexts): ApprovalWords {
  const actor = approval.askedBy === "runner" ? t.taskforce : t.agent;
  const known = isAction(approval.action, t) ? t.actions[approval.action] : null;
  const words = known ?? t.actions.other;
  return {
    title: `${actor} ${t.wantsTo} ${known ? words.want : `${words.want} ${approval.tool}`}`,
    will: words.will,
    why: approval.reason?.trim() || t.noRule,
    ifRefused: words.ifRefused,
  };
}

/** Le délai avant qu'une demande sans réponse vaille refus, en minutes entières. */
export function deadlineText(minutesLeft: number, t: MissionTexts): string {
  return minutesLeft <= 1 ? t.noAnswerSoon : t.noAnswerMeansNo.replace("{minutes}", String(minutesLeft));
}

/** Ce qu'est devenue une demande, pour la chronologie ; null tant qu'elle attend. */
export function approvalOutcome(
  approval: Pick<DeliveryRunApproval, "status" | "scope" | "decidedBy">,
  t: MissionTexts,
): string | null {
  const who = approval.decidedBy ?? t.theDelegator;
  switch (approval.status) {
    case "ALLOWED":
      return (approval.scope === "MISSION" ? t.outcomeAllowedForMission : t.outcomeAllowed).replace("{who}", who);
    case "DENIED":
      return t.outcomeRefused.replace("{who}", who);
    case "EXPIRED":
      return t.outcomeNoAnswer;
    default:
      return null;
  }
}
