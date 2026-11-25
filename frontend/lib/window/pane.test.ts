import { describe, expect, it } from "vitest"

import { CONSTANTS_EN } from "@/lib/constants_en"

import { PROGRESS, VERIFICATION, boardPath, homePath, issuePath, paneOf, paneTitle, progressPath, workflowPath } from "./pane"

const SCREENS = { dashboard: "Dashboard", inbox: "Waiting for you", "my-work": "My work", project: "Project" }
const PROJECTS = [{ id: 3, name: "Website" }]

/** Le volet de la fenêtre se lit dans la route : l'accueil de l'espace n'en a pas (R119). */
describe("paneOf : le volet de la route", () => {
  it.each([
    ["/acme", null],
    ["/", null],
    ["", null],
    [null, null],
  ])("n'ouvre pas de volet sur l'accueil de l'espace : %s", (pathname, pane) => {
    expect(paneOf(pathname)).toBe(pane)
  })

  it.each([
    ["/acme/dashboard", { section: "dashboard", projectId: null }],
    ["/acme/inbox/mentions", { section: "inbox", projectId: null }],
    ["/acme/projects", { section: "projects", projectId: null }],
    ["/acme/projects/3", { section: "projects", projectId: 3 }],
    ["/acme/projects/3/issues/34", { section: "projects", projectId: 3 }],
    ["/acme/projects/new", { section: "projects", projectId: null }],
  ])("ouvre %s dans le volet", (pathname, pane) => {
    expect(paneOf(pathname)).toEqual(pane)
  })
})

describe("paneTitle : le titre du volet", () => {
  it.each([
    [{ section: "projects", projectId: 3 }, "Website"],
    [{ section: "projects", projectId: 9 }, "Project"],
    [{ section: "inbox", projectId: null }, "Waiting for you"],
    [{ section: "my-work", projectId: null }, "My work"],
    [{ section: "team-plans", projectId: null }, "Team plans"],
  ])("titre %o « %s »", (pane, title) => {
    expect(paneTitle(pane, PROJECTS, SCREENS)).toBe(title)
  })
})

describe("les adresses de la fenêtre", () => {
  it("ferme le volet vers l'accueil, ouvre un tableau, une issue sur son tableau", () => {
    expect(homePath("acme")).toBe("/acme")
    expect(boardPath("acme", 3)).toBe("/acme/projects/3")
    expect(issuePath("acme", 3, 34)).toBe("/acme/projects/3?issue=34")
  })

  it("R161 M7 : la page de vérification a le nom de la page, pas « Work view »", () => {
    const screens = { ...CONSTANTS_EN.window.screens }
    expect(paneOf("/acme/missions/42/verification")).toEqual({ section: VERIFICATION, projectId: null })
    // Le lien du témoin (second tour de #551, M-b) s'ouvre sous le même nom, le temps de savoir où il mène.
    expect(paneOf(`/verify/${"a".repeat(32)}`)).toEqual({ section: VERIFICATION, projectId: null })
    expect(paneTitle({ section: VERIFICATION, projectId: null }, PROJECTS, screens)).toBe("Verification")
    expect(paneTitle(paneOf("/acme/missions/42") ?? { section: "", projectId: null }, PROJECTS, screens)).toBe("Work view")
  })

  it("ouvre « Progress » dans le volet, avec son titre (R125)", () => {
    expect(progressPath("acme")).toBe("/acme/progress")
    expect(paneOf(progressPath("acme"))).toEqual({ section: PROGRESS, projectId: null })
    expect(paneTitle({ section: PROGRESS, projectId: null }, PROJECTS, { ...SCREENS, progress: "Progress" })).toBe("Progress")
  })
})

// Le workflow d'un projet (séance n°25, W1) : sa route, à côté du tableau, le nœud choisi dans l'adresse.
describe("workflowPath", () => {
  it("is the project's workflow, on a node when one is given", () => {
    expect(workflowPath("acme", 3)).toBe("/acme/projects/3/workflow")
    expect(workflowPath("acme", 3, "issue-4")).toBe("/acme/projects/3/workflow?node=issue-4")
    expect(paneOf(workflowPath("acme", 3))).toEqual({ section: "projects", projectId: 3 })
  })
})
