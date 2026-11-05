import { describe, expect, it } from "vitest"

import { screenFrom, type OpenIssue } from "./screen"

/** Ce que la barre envoie de l'écran (R114) : le projet de la route, l'issue de la route ou de la fiche ouverte. */
describe("screenFrom", () => {
  const sheet: OpenIssue = { projectId: 3, issueId: 55 }

  it.each([
    ["/acme/projects/12", null, { projectId: 12 }],
    ["/acme/projects/12/list", null, { projectId: 12 }],
    ["/acme/projects/12/issues/34", null, { projectId: 12, issueId: 34 }],
    ["/acme/projects/12?issue=34", null, { projectId: 12 }],
    ["/acme/projects/12", sheet, { projectId: 3, issueId: 55 }],
    ["/acme/my-work/issues", sheet, { projectId: 3, issueId: 55 }],
    ["/acme/dashboard", null, null],
    ["/acme/projects", null, null],
    ["/acme/projects/new", null, null],
    [null, null, null],
  ])("%s with the sheet %o → %o", (pathname, open, expected) => {
    expect(screenFrom(pathname, open)).toEqual(expected)
  })
})
