/**
 * Les règles de l'entreprise, par couches (R157, séance n°22) : celles que l'espace écrit en mots au-dessus de la table de
 * TaskForce et de son socle. Le serveur rend des données que l'écran dit en phrases (lib/rules/rule-words.ts) ; la
 * traduction d'une règle passe par le modèle de l'espace, sa vérification non.
 */
import axios from "axios"

import { AI_TIMEOUT_MS, apiClient } from "./client"
import { RULES_ROUTES } from "../config/api-routes"

export type RuleEffect = "allow" | "ask" | "deny"
export type RuleScope = "workspace" | "project" | "process" | "role" | "person"
export type WorkspaceRole = "OWNER" | "ADMIN" | "MEMBER"

/** Un seuil sur un argument chiffré d'un outil de l'entreprise. */
export interface RuleThreshold {
  fact: string
  value: number
}

/** Les conditions d'une règle, telles que le moteur les lit. */
export interface RuleConditions {
  action?: string
  tool?: string
  command?: string
  path?: string
  branch?: string
  repoVisibility?: "public" | "private"
  server?: string
  sensitivity?: string
  actor?: "agent" | "person"
  over?: RuleThreshold
}

/** Ce qu'une règle qui demande ajoute : qui accorde (un seul suffit), combien signent, la séparation des rôles. */
export interface RuleRequire {
  approvers?: string[]
  signatures?: number
  separate?: boolean
}

/** Une règle candidate, telle que le serveur la vérifie (la traduction du modèle, ou ce que la personne a choisi). */
export interface CandidateRule {
  when?: RuleConditions
  effect?: string
  require?: RuleRequire
}

/** Une personne désignée : sa référence (`person:42`, `role:admin`, `project-lead`), son nom, son métier. */
export interface RuleApprover {
  ref: string
  name: string | null
  detail: string | null
}

/** Ce que le moteur a décidé, en données ; `layer` vaut `floor`, `taskforce`, ou la couche de l'entreprise. */
export interface RuleDecision {
  effect: RuleEffect
  rule: string | null
  ruleText: string | null
  layer: string | null
  layerName: string | null
  approvers: RuleApprover[][]
  signatures: number
  separate: boolean
}

/** Un cas, rejoué par le moteur. `text` : la phrase du modèle ; null pour un cas que TaskForce a écrit. */
export interface RuleCaseView {
  text: string | null
  facts: Record<string, string>
  expect: RuleEffect
  expectApprovers: RuleApprover[] | null
  decision: RuleDecision
  passed: boolean
  source: "taskforce" | "model"
}

/** Une règle du contrat née de la phrase de la personne. */
export interface RulePart {
  id: string
  action: string | null
  when: RuleConditions | null
  effect: RuleEffect
  raw: Record<string, unknown>
}

/** Une règle de l'entreprise, telle que la personne l'a écrite, et ce que TaskForce en a fait. */
export interface RuleStatement {
  group: string
  text: string
  effect: RuleEffect
  parts: RulePart[]
  approvers: RuleApprover[]
  signatures: number
  separate: boolean
  addedBy: string | null
  addedAt: string | null
  cases: RuleCaseView[]
}

/** Une couche de l'entreprise, dans sa version en vigueur. */
export interface RuleLayer {
  scope: RuleScope
  ref: string | null
  name: string | null
  version: number
  author: string | null
  at: string | null
  digest: string | null
  canEdit: boolean
  rules: RuleStatement[]
}

export interface RuleVersion {
  version: number
  scope: RuleScope
  ref: string | null
  name: string | null
  author: string | null
  at: string | null
  digest: string | null
  rules: number
}

export interface DefaultRule {
  id: string
  action: string | null
  when: RuleConditions
  effect: RuleEffect
  reason: string
}

export interface RulePerson {
  id: number
  name: string
  jobTitle: string | null
  role: WorkspaceRole
}

export interface RuleProject {
  id: number
  name: string
  canEdit: boolean
}

export interface RulesOverview {
  version: number
  digest: string
  /** Les règles du socle, par identifiant : l'écran a leur phrase. */
  floor: string[]
  defaults: DefaultRule[]
  layers: RuleLayer[]
  versions: RuleVersion[]
  members: RulePerson[]
  projects: RuleProject[]
  canEdit: boolean
}

export interface RuleProblem {
  code: string
  detail: string | null
}

/** Une règle en mots, traduite et vérifiée ; elle peut entrer quand `passed` est vrai. */
export interface RuleDraft {
  text: string
  scope: RuleScope
  ref: string | null
  rules: CandidateRule[]
  modelCases: Record<string, unknown>[]
  cases: RuleCaseView[]
  broken: RuleCaseView[]
  problems: RuleProblem[]
  approverNeeded: string | null
  unclear: string | null
  passed: boolean
}

export interface RuleDraftRequest {
  text: string
  scope: RuleScope
  ref?: string | null
  /** La traduction déjà faite, à revérifier telle quelle ; absente, TaskForce la demande au modèle de l'espace. */
  rules?: CandidateRule[]
  cases?: Record<string, unknown>[]
}

/** « What would happen? » : l'action lue en faits, et ce que les règles en décideraient. */
export interface RuleCheck {
  facts: Record<string, string> | null
  decision: RuleDecision | null
  unclear: string | null
}

/** Ce qu'est devenue une règle qu'on a voulu ajouter : entrée, ou refusée avec sa vérification. */
export interface RuleSaveResult {
  saved: boolean
  draft: RuleDraft
}

export async function getRules(slug: string): Promise<RulesOverview> {
  const res = await apiClient.get<{ data: RulesOverview }>(RULES_ROUTES.RULES(slug), { silentError: true })
  return res.data.data
}

/** Traduit (sans `rules`) puis vérifie une règle ; rien n'est écrit. */
export async function draftRule(slug: string, body: RuleDraftRequest): Promise<RuleDraft> {
  const res = await apiClient.post<{ data: RuleDraft }>(RULES_ROUTES.DRAFTS(slug), body, { timeout: AI_TIMEOUT_MS })
  return res.data.data
}

/**
 * Ajoute la règle vérifiée. Une règle refusée (ses cas ne tiennent pas, elle relâcherait le socle) revient en 422 avec
 * sa vérification : c'est une réponse, pas une panne.
 */
export async function addRule(slug: string, body: RuleDraftRequest): Promise<RuleSaveResult> {
  try {
    const res = await apiClient.post<{ data: RuleDraft }>(RULES_ROUTES.RULES(slug), body)
    return { saved: true, draft: res.data.data }
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 422) {
      const draft = (error.response.data as { data?: RuleDraft } | undefined)?.data
      if (draft) return { saved: false, draft }
    }
    throw error
  }
}

export async function removeRule(slug: string, scope: RuleScope, ref: string | null, group: string): Promise<void> {
  await apiClient.delete(RULES_ROUTES.RULE(slug, group), { params: { scope, ...(ref ? { ref } : {}) } })
}

export async function checkAction(slug: string, text: string, projectId: number | null): Promise<RuleCheck> {
  const res = await apiClient.post<{ data: RuleCheck }>(RULES_ROUTES.CHECK(slug), { text, projectId },
    { timeout: AI_TIMEOUT_MS })
  return res.data.data
}
