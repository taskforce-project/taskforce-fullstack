import { describe, expect, it } from "vitest"

import { PROGRESS, boardPath, homePath, issuePath, paneOf, paneTitle, progressPath } from "./pane"

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

  it("ouvre « Progress » dans le volet, avec son titre (R125)", () => {
    expect(progressPath("acme")).toBe("/acme/progress")
    expect(paneOf(progressPath("acme"))).toEqual({ section: PROGRESS, projectId: null })
    expect(paneTitle({ section: PROGRESS, projectId: null }, PROJECTS, { ...SCREENS, progress: "Progress" })).toBe("Progress")
  })
})
