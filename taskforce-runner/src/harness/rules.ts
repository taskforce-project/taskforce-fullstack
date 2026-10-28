import { globMatch } from "./glob.js";

/**
 * Paquet de règles `taskforce-rules/1` (contracts/rules/taskforce-rules-1.schema.json) et sa décision. Code
 * déterministe, sans réseau ni horloge ni modèle : mêmes règles et mêmes faits, même décision (invariant 1).
 */

export type Effect = "allow" | "ask" | "deny";
export type ActionClass = "read" | "sandbox-write" | "reversible-exit" | "irreversible";

export interface Condition {
  action?: string;
  tool?: string;
  command?: string;
  path?: string;
  branch?: string;
  repoVisibility?: "public" | "private";
  server?: string;
  sensitivity?: "public" | "internal" | "confidential";
}

export interface Rule {
  id: string;
  when: Condition;
  class: ActionClass;
  effect: Effect;
  inverse?: string | null;
  owner: string;
  reason: string;
  review: string;
}

export interface RulesBundle {
  format: "taskforce-rules/1";
  workspace: string;
  project?: number | null;
  version: number;
  digest?: string;
  issuedAt?: string;
  rules: Rule[];
}

/** Ce qu'on sait d'une action avant qu'elle parte. Un fait absent ne satisfait jamais une condition qui le demande. */
export type Facts = Partial<Record<keyof Condition, string>>;

export interface Decision {
  effect: Effect;
  /** La règle qui l'emporte ; null quand aucune règle ne s'applique (action inconnue, donc demandée). */
  rule: Rule | null;
}

const EQUALITY: ReadonlySet<keyof Condition> = new Set(["action", "repoVisibility", "sensitivity"]);
const RANK: Record<Effect, number> = { deny: 3, ask: 2, allow: 1 };

function matches(when: Condition, facts: Facts): boolean {
  for (const [key, expected] of Object.entries(when) as Array<[keyof Condition, string | undefined]>) {
    if (expected === undefined) continue;
    const actual = facts[key];
    if (actual === undefined) return false;
    if (EQUALITY.has(key) ? actual !== expected : !globMatch(expected, actual)) return false;
  }
  return true;
}

/** Refuser l'emporte sur demander, qui l'emporte sur autoriser ; à effet égal, la première règle du paquet. */
export function decide(bundle: RulesBundle, facts: Facts): Decision {
  let winner: Rule | null = null;
  for (const rule of bundle.rules) {
    if (!matches(rule.when, facts)) continue;
    if (!winner || RANK[rule.effect] > RANK[winner.effect]) winner = rule;
  }
  return winner ? { effect: winner.effect, rule: winner } : { effect: "ask", rule: null };
}
