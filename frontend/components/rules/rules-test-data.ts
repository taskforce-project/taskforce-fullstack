import type { RuleCaseView, RuleDraft, RuleStatement, RulesOverview } from "@/lib/api/rules-service"

// Des règles telles que le serveur les rend, pour les tests des écrans des règles : la règle du CEO, ses cas, et l'espace
// où elle vit. Aucune n'est montrée à l'écran hors des tests.

export const CEO_RULE = "No change in the accounting module without the approval of the finance lead"

export const MARIE = { ref: "person:42", name: "Marie Martin", detail: "Finance lead" }

export const CEO_CASE: RuleCaseView = {
  text: "Claude Code changes src/accounting/ledger.ts",
  facts: { action: "file.write", path: "src/accounting/ledger.ts", actor: "agent" },
  expect: "ask",
  expectApprovers: [MARIE],
  decision: {
    effect: "ask", rule: "ws-no-change-abc123", ruleText: CEO_RULE, layer: "workspace", layerName: null,
    approvers: [[MARIE]], signatures: 1, separate: false,
  },
  passed: true,
  source: "model",
}

export const BESIDE_CASE: RuleCaseView = {
  text: null,
  facts: { action: "file.write", path: "docs/notes.md", actor: "agent" },
  expect: "allow",
  expectApprovers: null,
  decision: {
    effect: "allow", rule: "write-sandbox-files", ruleText: "Free but supervised.", layer: "taskforce", layerName: null,
    approvers: [], signatures: 1, separate: false,
  },
  passed: true,
  source: "taskforce",
}

export const CEO_STATEMENT: RuleStatement = {
  group: "ws-no-change-abc123",
  text: CEO_RULE,
  effect: "ask",
  parts: [{
    id: "ws-no-change-abc123", action: "file.write", when: { action: "file.write", path: "**/accounting/**" }, effect: "ask",
    raw: { id: "ws-no-change-abc123", when: { action: "file.write", path: "**/accounting/**" }, effect: "ask" },
  }],
  approvers: [MARIE],
  signatures: 1,
  separate: false,
  addedBy: "Pierre",
  addedAt: "2026-11-11T20:00:00",
  cases: [CEO_CASE, BESIDE_CASE],
}

export function overview(patch: Partial<RulesOverview> = {}): RulesOverview {
  return {
    version: 2,
    digest: "sha256:" + "a".repeat(64),
    floor: ["floor-no-secret", "floor-no-agent-rules", "floor-irreversible", "floor-three-at-once"],
    defaults: [{ id: "read-files", action: "file.read", when: { action: "file.read" }, effect: "allow", reason: "Reading changes nothing." }],
    layers: [{
      scope: "workspace", ref: null, name: null, version: 2, author: "Pierre", at: "2026-11-11T20:00:00",
      digest: "sha256:" + "b".repeat(64), canEdit: true, rules: [CEO_STATEMENT],
    }],
    versions: [{ version: 2, scope: "workspace", ref: null, name: null, author: "Pierre", at: "2026-11-11T20:00:00",
      digest: "sha256:" + "b".repeat(64), rules: 1 }],
    members: [{ id: 42, name: "Marie Martin", jobTitle: "Finance lead", role: "MEMBER" },
      { id: 7, name: "Pierre", jobTitle: null, role: "ADMIN" }],
    projects: [{ id: 12, name: "Accounting", canEdit: true }],
    canEdit: true,
    ...patch,
  }
}

export function draft(patch: Partial<RuleDraft> = {}): RuleDraft {
  return {
    text: CEO_RULE,
    scope: "workspace",
    ref: null,
    rules: [{ when: { action: "file.write", path: "**/accounting/**" }, effect: "ask", require: { approvers: ["person:42"] } }],
    modelCases: [{ text: CEO_CASE.text, facts: CEO_CASE.facts, expect: { effect: "ask" }, source: "model" }],
    cases: [CEO_CASE, BESIDE_CASE],
    broken: [],
    problems: [],
    approverNeeded: null,
    unclear: null,
    passed: true,
    ...patch,
  }
}
