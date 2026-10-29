import { decide, type Facts, type RulesBundle } from "./harness/rules.js";

/**
 * Les sorties du bac à sable que fait le runner, après l'agent : pousser la branche, ouvrir la pull request
 * (spécification de la v2, §8.4). Chacune suit sa règle : autorisée, elle part ; refusée, elle reste sur le poste ;
 * demandée, elle attend la décision de la personne qui a délégué, dans TaskForce.
 */

export interface ExitVerdict {
  go: boolean;
  /** Pourquoi, pour le journal et le résumé du run ; sans point final, la phrase qui le cite met le sien. */
  why: string;
  /** La règle qui a décidé, ou qui a demandé ; absente quand aucune ne s'applique. */
  rule?: string;
  /** Sur un refus, la raison de la règle, écrite pour la personne, sans son identifiant (R38) ; le dossier garde la règle. */
  reason?: string;
}

/** Pose la demande dans TaskForce et rend la décision de la personne (`askInTaskForce`, ou un faux dans les tests). */
export type AskPerson = (tool: string, summary: string) => Promise<boolean>;

export async function judgeExit(rules: RulesBundle, facts: Facts, tool: string, summary: string, ask: AskPerson): Promise<ExitVerdict> {
  const d = decide(rules, facts);
  const rule = d.rule ? { rule: d.rule.id } : {};
  if (d.effect === "allow") return { go: true, why: `allowed by the rule ${d.rule?.id ?? "?"}`, ...rule };
  if (d.effect === "deny") {
    const reason = (d.rule?.reason ?? "").replace(/\.\s*$/, "");
    return { go: false, why: `refused by the rule ${d.rule?.id ?? "?"}: ${reason}`, reason, ...rule };
  }
  const allowed = await ask(tool, summary);
  const asked = d.rule ? `the rule ${d.rule.id} asks` : "no rule covers it";
  return { go: allowed, why: allowed ? `allowed in TaskForce (${asked})` : `not allowed in TaskForce (${asked})`, ...rule };
}

/** Les faits d'une sortie vers le dépôt : la visibilité seulement quand on la connaît (sinon aucune règle qui la demande ne s'applique). */
export function exitFacts(action: "git.push" | "pr.open", branch: string, visibility: "public" | "private" | null): Facts {
  return { action, branch, ...(visibility ? { repoVisibility: visibility } : {}) };
}
