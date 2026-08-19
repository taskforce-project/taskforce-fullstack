import { describe, it, expect } from "vitest"
import type { Issue } from "./api/issue-service"
import {
  EMPTY_ISSUE_FILTERS,
  countActiveFilters,
  applyIssueFilters,
  deriveAssigneeOptions,
  deriveLabelOptions,
  type IssueFilterState,
} from "./issue-filters"

// Fabrique d'issue minimale (seuls les champs lus par les filtres sont peuplés).
function issue(partial: Partial<Issue>): Issue {
  return {
    id: 1,
    priority: "NONE",
    assignee: null,
    labels: [],
    ...partial,
  } as Issue
}

const filters = (p: Partial<IssueFilterState> = {}): IssueFilterState => ({
  ...EMPTY_ISSUE_FILTERS,
  ...p,
})

describe("issue-filters", () => {
  describe("countActiveFilters", () => {
    it("retourne 0 pour des filtres vides", () => {
      expect(countActiveFilters(EMPTY_ISSUE_FILTERS)).toBe(0)
    })

    it("additionne priorités + assignés + labels", () => {
      expect(
        countActiveFilters(filters({ priorities: ["HIGH", "LOW"], assigneeIds: [1, null], labelIds: [5] })),
      ).toBe(5)
    })
  })

  describe("applyIssueFilters", () => {
    const issues: Issue[] = [
      issue({ id: 1, priority: "HIGH", assignee: { id: 10, displayName: "Alice", email: "a@x.dev" } as Issue["assignee"], labels: [{ id: 1, name: "bug", color: "#f00" }] as Issue["labels"] }),
      issue({ id: 2, priority: "LOW", assignee: null, labels: [{ id: 2, name: "doc", color: "#0f0" }] as Issue["labels"] }),
      issue({ id: 3, priority: "HIGH", assignee: { id: 11, displayName: null, email: "b@x.dev" } as Issue["assignee"], labels: [] }),
    ]

    it("renvoie toutes les issues quand aucun filtre n'est actif", () => {
      expect(applyIssueFilters(issues, EMPTY_ISSUE_FILTERS)).toHaveLength(3)
    })

    it("filtre par priorité (OU à l'intérieur de la catégorie)", () => {
      const res = applyIssueFilters(issues, filters({ priorities: ["HIGH"] }))
      expect(res.map((i) => i.id)).toEqual([1, 3])
    })

    it("filtre par assigné, y compris 'non assigné' (null)", () => {
      expect(applyIssueFilters(issues, filters({ assigneeIds: [null] })).map((i) => i.id)).toEqual([2])
      expect(applyIssueFilters(issues, filters({ assigneeIds: [10] })).map((i) => i.id)).toEqual([1])
    })

    it("filtre par label (OU à l'intérieur)", () => {
      expect(applyIssueFilters(issues, filters({ labelIds: [1, 2] })).map((i) => i.id)).toEqual([1, 2])
    })

    it("combine les catégories en ET (priorité HIGH ET assigné 10)", () => {
      expect(applyIssueFilters(issues, filters({ priorities: ["HIGH"], assigneeIds: [10] })).map((i) => i.id)).toEqual([1])
    })

    it("renvoie une liste vide quand aucune issue ne matche", () => {
      expect(applyIssueFilters(issues, filters({ assigneeIds: [999] }))).toHaveLength(0)
    })
  })

  describe("deriveAssigneeOptions", () => {
    it("dédoublonne les assignés et ajoute 'Non assigné' si présent", () => {
      const issues: Issue[] = [
        issue({ assignee: { id: 10, displayName: "Alice", email: "a@x.dev" } as Issue["assignee"] }),
        issue({ assignee: { id: 10, displayName: "Alice", email: "a@x.dev" } as Issue["assignee"] }),
        issue({ assignee: null }),
      ]
      const opts = deriveAssigneeOptions(issues)
      expect(opts.filter((o) => o.id === 10)).toHaveLength(1)
      expect(opts).toContainEqual({ id: null, name: "Non assigné" })
    })

    it("utilise l'email en repli quand le displayName est null", () => {
      const opts = deriveAssigneeOptions([issue({ assignee: { id: 11, displayName: null, email: "b@x.dev" } as Issue["assignee"] })])
      expect(opts).toContainEqual({ id: 11, name: "b@x.dev" })
    })

    it("n'ajoute pas 'Non assigné' quand toutes les issues sont assignées", () => {
      const opts = deriveAssigneeOptions([issue({ assignee: { id: 10, displayName: "Alice", email: "a@x.dev" } as Issue["assignee"] })])
      expect(opts.some((o) => o.id === null)).toBe(false)
    })
  })

  describe("deriveLabelOptions", () => {
    it("dédoublonne les labels par id", () => {
      const issues: Issue[] = [
        issue({ labels: [{ id: 1, name: "bug", color: "#f00" }] as Issue["labels"] }),
        issue({ labels: [{ id: 1, name: "bug", color: "#f00" }, { id: 2, name: "doc", color: "#0f0" }] as Issue["labels"] }),
      ]
      const opts = deriveLabelOptions(issues)
      expect(opts).toHaveLength(2)
      expect(opts.map((o) => o.id).sort()).toEqual([1, 2])
    })

    it("renvoie une liste vide sans labels", () => {
      expect(deriveLabelOptions([issue({ labels: [] })])).toHaveLength(0)
    })
  })
})
