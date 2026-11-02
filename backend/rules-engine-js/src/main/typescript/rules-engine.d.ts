/**
 * Déclarations de rules-engine.js : le moteur de règles de backend/tf-api (RulesEngine, Glob, RulesDigest, CanonicalJson,
 * EvidenceChain), compilé en JavaScript par TeaVM pour le runner (R90, ADR-025). Ce fichier se modifie dans
 * backend/rules-engine-js/src/main/typescript, à côté de l'adaptateur Java qu'il décrit (RulesEngineJs) ; le build Maven
 * le copie dans taskforce-runner/src/harness/engine avec le module, et la CI refuse un écart entre les deux.
 *
 * Les types sont ceux des contrats : taskforce-rules/1 (contracts/rules) et taskforce-evidence/1 (contracts/evidence).
 * Code déterministe, sans réseau ni horloge ni modèle : mêmes règles et mêmes faits, même décision (invariant 1). Une
 * erreur du moteur arrive comme une `Error`, avec son message.
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
  /** La règle qui l'emporte, l'objet même du paquet donné ; null quand aucune règle ne s'applique. */
  rule: Rule | null;
}

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export interface EventInput {
  seq: number;
  at: string;
  type: string;
  actor: { kind: string; id: string };
  data: { [key: string]: Json };
}

export interface ChainedEvent extends EventInput {
  prev: string;
  hash: string;
}

/** Refuser l'emporte sur demander, qui l'emporte sur autoriser ; à effet égal, la première règle ; aucune règle : demander. */
export function decide(bundle: RulesBundle, facts: Facts): Decision;

/** Plusieurs faits pour un appel : le plus strict l'emporte ; aucun fait (outil interne de l'agent) : autorisé, sans règle. */
export function decideAll(bundle: RulesBundle, factsList: Facts[]): Decision;

/** Un motif de condition (`*`, `**`, `{a,b}`) couvre-t-il la valeur entière ? */
export function globMatch(pattern: string, value: string): boolean;

/** L'empreinte d'un paquet (contracts/README.md, règle 6) : sans son champ `digest` ni aucun membre nul. */
export function bundleDigest(bundle: RulesBundle): string;

/** Le JSON canonique d'une valeur : clés triées par unités UTF-16, entiers seulement (un décimal est refusé). */
export function canonicalJson(value: Json): string;

/** Les événements chaînés depuis l'empreinte nulle, chacun avec `prev` et `hash`. */
export function chain(events: EventInput[]): ChainedEvent[];

/** L'indice du premier événement dont l'empreinte ne tient pas, ou -1 si toute la chaîne tient. */
export function firstBrokenLink(events: ChainedEvent[]): number;

/** L'empreinte qui précède le premier événement : `sha256:` suivi de 64 zéros. */
export function zeroHash(): string;
