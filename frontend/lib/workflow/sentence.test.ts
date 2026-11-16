import { describe, expect, it } from "vitest"

import { CONSTANTS_EN } from "@/lib/constants_en"
import { buildWorkflow, type WorkflowNode } from "@/lib/workflow/model"
import {
  countWords, dayWords, firstName, governanceOf, momentWords, nodeAction, nodeSentence, whoActs,
} from "@/lib/workflow/sentence"
import {
  approval, deliveryRun, DOING, DONE, issue, ME, projectRun, relation, STATUSES,
} from "@/lib/workflow/__tests__/fixtures"

const texts = { workflow: CONSTANTS_EN.workflow, sequence: CONSTANTS_EN.missionSequence, rules: CONSTANTS_EN.rules }
const now = new Date(2026, 10, 13, 15, 0)
const context = { me: ME, now }

function nodeOf(...args: Parameters<typeof buildWorkflow>): WorkflowNode {
  const model = buildWorkflow(...args)
  return [...model.byKey.values()][0]
}
const base = { statuses: STATUSES, relations: [], documents: {}, me: ME, today: "2026-11-13" }

/** Ce qu'un nœud dit en mots (séance n°25, §11.4) : jamais un identifiant, un nom d'outil ni une empreinte. */
describe("la phrase d'un nœud", () => {
  it("une demande pour la personne : ce que l'agent veut faire, en mots", () => {
    const node = nodeOf({ ...base, issues: [issue(1, { status: DOING })], runs: [projectRun(deliveryRun(1, 1), [approval(4)])] })
    expect(nodeSentence(node, texts, context)).toBe("Waiting for your approval: build the project.")
    expect(nodeAction(node, ME)).toBe("decide")
  })

  it("une demande pour d'autres : qui elle attend", () => {
    const named = approval(4, { canDecide: false, waitingFor: [["Alex Chen"], ["role:admin"]] })
    const node = nodeOf({ ...base, issues: [issue(1, { status: DOING })], runs: [projectRun(deliveryRun(1, 1), [named])] })
    expect(nodeSentence(node, texts, context)).toBe("Waiting for Alex Chen, and an admin.")
    const byRole = nodeOf({ ...base, issues: [issue(1, { status: DOING })], runs: [projectRun(deliveryRun(1, 1), [approval(4, { canDecide: false, waitingFor: [["role:admin"]] })])] })
    // Le rôle en mots (R161, M7), jamais « the people your rules name ».
    expect(nodeSentence(byRole, texts, context)).toBe("Waiting for an admin.")
    const plain = nodeOf({ ...base, issues: [issue(1, { status: DOING })], runs: [projectRun(deliveryRun(1, 1, { startedByName: "Sam" }), [approval(4, { canDecide: false })])] })
    expect(nodeSentence(plain, texts, context)).toBe("Waiting for Sam.")
    expect(nodeAction(plain, ME)).toBeNull()
  })

  it("une revue : à la personne, ou à celle qui a délégué", () => {
    const mine = nodeOf({ ...base, issues: [issue(1, { status: DOING })], runs: [projectRun(deliveryRun(1, 1, { status: "DONE" }))] })
    expect(nodeSentence(mine, texts, context)).toBe("Ready for your review.")
    expect(nodeAction(mine, ME)).toBe("review")
    const theirs = nodeOf({ ...base, me: "8", issues: [issue(1, { status: DOING })], runs: [projectRun(deliveryRun(1, 1, { status: "DONE" }))] })
    expect(nodeSentence(theirs, texts, { ...context, me: "8" })).toBe("Ready for review by Pierre Martin.")
  })

  it("une mission en file : « your runner » pour qui l'a déléguée, son nom pour les autres", () => {
    const queued = { ...base, issues: [issue(1)], runs: [projectRun(deliveryRun(1, 1, { status: "QUEUED" }))] }
    expect(nodeSentence(nodeOf(queued), texts, context)).toBe("Waiting for your runner to pick it up.")
    expect(nodeSentence(nodeOf({ ...queued, me: "8" }), texts, { ...context, me: "8" })).toBe("Waiting for Pierre Martin.")
  })

  it("bloquée : par une issue nommée, ou par plusieurs", () => {
    const a = issue(1)
    const b = issue(2)
    const c = issue(3)
    const one = buildWorkflow({ ...base, runs: [], issues: [a, b], relations: [relation(1, a, b)] }).byKey.get("issue-2") as WorkflowNode
    expect(nodeSentence(one, texts, context)).toBe("Blocked by WEB-1: Issue 1.")
    const many = buildWorkflow({ ...base, runs: [], issues: [a, b, c], relations: [relation(1, a, c), relation(2, b, c)] }).byKey.get("issue-3") as WorkflowNode
    expect(nodeSentence(many, texts, context)).toBe("Blocked by 2 issues.")
  })

  it("un échec : l'étape où la mission s'est arrêtée, sa cause, et « See why » pour qui l'a déléguée", () => {
    const failed = nodeOf({ ...base, issues: [issue(1, { status: DOING })], runs: [projectRun(deliveryRun(1, 1, { status: "FAILED", error: "The tests failed." }), [], "check")] })
    expect(nodeSentence(failed, texts, context)).toBe("Check failed: The tests failed.")
    expect(nodeAction(failed, ME)).toBe("seeWhy")
    expect(nodeAction(failed, "8")).toBeNull()
    const silent = nodeOf({ ...base, issues: [issue(1, { status: DOING })], runs: [projectRun(deliveryRun(1, 1, { status: "FAILED" }))] })
    expect(nodeSentence(silent, texts, context)).toBe(CONSTANTS_EN.workflow.now.failedNoCause)
  })

  it("au travail : ce que l'agent fait à son étape, ou le nouvel essai et son heure, ou la personne", () => {
    const agent = nodeOf({ ...base, issues: [issue(1, { status: DOING })], runs: [projectRun(deliveryRun(1, 1))] })
    // L'étape en cours, en mots de la séquence, finit aussi par un point : une seule règle pour toutes les phrases (R161, L5).
    expect(nodeSentence(agent, texts, context)).toBe("Doing the work.")
    const checking = nodeOf({ ...base, issues: [issue(1, { status: DOING })], runs: [projectRun(deliveryRun(1, 1), [], "check")] })
    expect(nodeSentence(checking, texts, context)).toBe("Checking the work.")
    const retried = nodeOf({
      ...base, issues: [issue(1, { status: DOING })],
      runs: [
        projectRun(deliveryRun(1, 1, { status: "FAILED", outcome: "RETRIED", createdAt: "2026-11-12T10:00:00" })),
        projectRun(deliveryRun(2, 1, { createdAt: "2026-11-13T09:30:00" })),
      ],
    })
    expect(nodeSentence(retried, texts, { ...context, now: new Date("2026-11-13T12:00:00Z") })).toMatch(/^Tried again today at \d\d:\d\d\. Waiting for the result\.$/)
    const person = nodeOf({ ...base, runs: [], issues: [issue(1, { status: DOING, assignee: { id: 9, email: "alex@acme.dev", displayName: "Alex Chen", avatarUrl: null } as never })] })
    expect(nodeSentence(person, texts, context)).toBe("In progress with Alex.")
    const nobody = nodeOf({ ...base, runs: [], issues: [issue(1, { status: DOING })] })
    expect(nodeSentence(nobody, texts, context)).toBe("In progress, with nobody on it.")
  })

  it("fini, annulé, arrêté, pas commencé : leur mot suffit, ou leur date", () => {
    const done = nodeOf({ ...base, runs: [], issues: [issue(1, { status: DONE, completedAt: "2026-11-10T08:00:00" })] })
    expect(nodeSentence(done, texts, context)).toBe("Done on 10 Nov.")
    // Fini malgré l'échec de sa dernière mission : la colonne l'emporte, l'échec se dit à la suite (R161, N8).
    const failedRun = projectRun(deliveryRun(1, 1, { status: "FAILED", error: "Tests failed" }))
    const doneAnyway = nodeOf({ ...base, runs: [failedRun], issues: [issue(1, { status: DONE, completedAt: "2026-11-10T08:00:00" })] })
    expect(doneAnyway.state).toBe("done")
    expect(nodeSentence(doneAnyway, texts, context)).toBe("Done on 10 Nov. Last mission failed.")
    const undated = nodeOf({ ...base, runs: [failedRun], issues: [issue(1, { status: DONE })] })
    expect(nodeSentence(undated, texts, context)).toBe("Last mission failed.")
    const cancelled = nodeOf({ ...base, runs: [failedRun], issues: [issue(1, { status: STATUSES[3] })] })
    expect(cancelled.state).toBe("skipped")
    expect(nodeSentence(cancelled, texts, context)).toBe("Last mission failed.")
    expect(nodeSentence(nodeOf({ ...base, runs: [], issues: [issue(1, { status: DONE })] }), texts, context)).toBeNull()
    expect(nodeSentence(nodeOf({ ...base, runs: [], issues: [issue(1, { status: STATUSES[3] })] }), texts, context)).toBeNull()
    const stopped = nodeOf({ ...base, issues: [issue(1)], runs: [projectRun(deliveryRun(1, 1, { status: "FAILED", outcome: "STOPPED" }))] })
    expect(nodeSentence(stopped, texts, context)).toBe("Stopped by you.")
    expect(nodeSentence(stopped, texts, { ...context, me: "8" })).toBe("Stopped by Pierre Martin.")
    expect(nodeSentence(nodeOf({ ...base, runs: [], issues: [issue(1, { dueDate: "2026-11-14" })] }), texts, context)).toBe("Due tomorrow.")
    expect(nodeSentence(nodeOf({ ...base, runs: [], issues: [issue(1, { dueDate: "2026-11-10" })] }), texts, context)).toBe("Was due on 10 Nov.")
    expect(nodeSentence(nodeOf({ ...base, runs: [], issues: [issue(1)] }), texts, context)).toBeNull()
    const refused = nodeOf({ ...base, issues: [issue(1)], runs: [projectRun(deliveryRun(1, 1, { status: "FAILED", refused: true, error: "A rule asks first" }))] })
    expect(nodeSentence(refused, texts, context)).toBe("Not started: A rule asks first.")
    // Une raison qui finit déjà par un point n'en prend pas un second.
    const dotted = nodeOf({ ...base, issues: [issue(1)], runs: [projectRun(deliveryRun(1, 1, { status: "FAILED", refused: true, error: "A rule asks first." }))] })
    expect(nodeSentence(dotted, texts, context)).toBe("Not started: A rule asks first.")
  })

  it("qui doit agir, en un mot, pour Summary", () => {
    const assigneeOf = () => ({ id: 9, email: "alex@acme.dev", displayName: "Alex Chen", avatarUrl: null }) as never
    const t = CONSTANTS_EN.workflow
    const needs = nodeOf({ ...base, issues: [issue(1, { status: DOING })], runs: [projectRun(deliveryRun(1, 1), [approval(4)])] })
    expect(whoActs(needs, ME, t, assigneeOf)).toBe("You")
    const failed = nodeOf({ ...base, issues: [issue(1, { status: DOING })], runs: [projectRun(deliveryRun(1, 1, { status: "FAILED" }))] })
    expect(whoActs(failed, ME, t, assigneeOf)).toBe("You")
    expect(whoActs(failed, "8", t, assigneeOf)).toBe("Pierre")
    const a = issue(1)
    const b = issue(2)
    const blocked = buildWorkflow({ ...base, runs: [], issues: [a, b], relations: [relation(1, a, b)] }).byKey.get("issue-2") as WorkflowNode
    expect(whoActs(blocked, ME, t, assigneeOf)).toBe("Alex")
    expect(whoActs(blocked, ME, t, () => null)).toBe("WEB-1")
    expect(whoActs(nodeOf({ ...base, runs: [], issues: [issue(1)] }), ME, t, assigneeOf)).toBe("Nobody")
  })

  it("la gouvernance : les règles qui demandent, les signatures, les documents", () => {
    const rules = [
      approval(4, { rule: "deploy", reason: "Deploys need a second look", signatures: 2, signedBy: ["Alex"] }),
      approval(5, { rule: "deploy", reason: "Deploys need a second look" }),
      approval(6, { rule: "secrets", reason: "" }),
    ]
    const node = nodeOf({ ...base, documents: { 1: 2 }, issues: [issue(1, { status: DOING })], runs: [projectRun(deliveryRun(1, 1), rules)] })
    expect(governanceOf(node)).toEqual({
      rules: 2, ruleReasons: ["Deploys need a second look", "secrets"], signed: { signed: 1, needed: 2 }, documents: 2,
    })
    expect(countWords(1, "1 rule", "{count} rules")).toBe("1 rule")
    expect(countWords(3, "1 rule", "{count} rules")).toBe("3 rules")
  })
})

describe("les mots du temps et des personnes", () => {
  it("un jour en mots", () => {
    expect(dayWords("2026-11-13", now)).toBe("today")
    expect(dayWords("2026-11-14", now)).toBe("tomorrow")
    expect(dayWords("2026-11-12", now)).toBe("yesterday")
    expect(dayWords("2026-12-19", now)).toBe("on 19 Dec")
    expect(dayWords("2027-01-05", now)).toBe("on 5 Jan 2027")
  })

  it("un moment du serveur en mots", () => {
    expect(momentWords("not a date", now)).toBe("")
    expect(momentWords("2026-11-02T10:00:00", now)).toBe("on 2 Nov")
  })

  it("le prénom d'une personne", () => {
    expect(firstName({ displayName: "Alex Chen", email: "alex@acme.dev" })).toBe("Alex")
    expect(firstName({ displayName: null, email: "sam@acme.dev" } as never)).toBe("sam")
    expect(firstName(null)).toBeNull()
  })
})
