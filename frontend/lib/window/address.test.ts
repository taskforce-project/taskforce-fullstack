import { afterEach, describe, expect, it } from "vitest"

import {
  closeIssueHref, conversationOf, hrefWith, issueHref, issueOf, issueRefOfUrl, missionOf, missionPath, previousAddress,
  sameAddress, screenUnder, withConversation,
} from "./address"

const params = (query: string) => new URLSearchParams(query)

/** Chaque état de la fenêtre a son adresse (R120) : le chemin dit le volet, la requête l'issue et la conversation. */
describe("issueOf : l'issue que l'adresse ouvre par-dessus le volet", () => {
  it.each([
    ["/acme/projects/3", "issue=34", { projectId: 3, issueId: 34, key: null }],
    ["/acme/projects/3/list", "c=9&issue=34", { projectId: 3, issueId: 34, key: null }],
    ["/acme/projects/3", "issue=ops-35", { projectId: 3, issueId: null, key: "OPS-35" }],
    ["/acme/inbox", "issue=34&project=3", { projectId: 3, issueId: 34, key: null }],
  ])("sur %s?%s, ouvre %o", (pathname, query, target) => {
    expect(issueOf(pathname, params(query))).toEqual(target)
  })

  it.each([
    ["/acme/projects/3", ""],
    ["/acme/projects/3", "issue="],
    ["/acme/projects/3", "issue=not a key"],
    ["/acme/inbox", "issue=34"],
    ["/acme", "issue=34&project=3"],
  ])("n'ouvre rien sur %s?%s", (pathname, query) => {
    expect(issueOf(pathname, params(query))).toBeNull()
  })

  it("ne lit rien sans requête", () => {
    expect(issueOf("/acme/projects/3", null)).toBeNull()
  })
})

describe("issueHref : où s'ouvre une issue", () => {
  it.each([
    // Par-dessus l'écran de son projet qui la liste, la conversation et les filtres de l'adresse gardés.
    ["/acme/projects/3", "?c=9", { projectId: 3, issueId: 34 }, "/acme/projects/3?c=9&issue=34"],
    ["/acme/projects/3/list", "", { projectId: 3, issueId: 34 }, "/acme/projects/3/list?issue=34"],
    ["/acme/projects/3/backlog", "?issue=12", { projectId: 3, issueId: 34 }, "/acme/projects/3/backlog?issue=34"],
    ["/acme/projects/3", "", { projectId: 3, key: "OPS-35" }, "/acme/projects/3?issue=OPS-35"],
    // Par-dessus une liste de l'espace, son projet dans la requête.
    ["/acme/inbox", "?c=9", { projectId: 3, issueId: 34 }, "/acme/inbox?c=9&issue=34&project=3"],
    ["/acme/my-work", "", { projectId: 3, issueId: 34 }, "/acme/my-work?issue=34&project=3"],
    // Ailleurs, par-dessus le tableau de son projet, avec la conversation seulement.
    ["/acme/inbox", "?tab=mentions", { projectId: 3, key: "OPS-35" }, "/acme/projects/3?issue=OPS-35"],
    ["/acme/projects/4", "?c=9", { projectId: 3, issueId: 34 }, "/acme/projects/3?c=9&issue=34"],
    ["/acme/projects/3/settings", "", { projectId: 3, issueId: 34 }, "/acme/projects/3?issue=34"],
    ["/acme/dashboard", "?c=9&tab=x", { projectId: 3, issueId: 34 }, "/acme/projects/3?c=9&issue=34"],
    ["/acme", "", { projectId: 3, issueId: 34 }, "/acme/projects/3?issue=34"],
  ])("depuis %s%s, %o s'ouvre sur %s", (pathname, search, issue, href) => {
    expect(issueHref(pathname, search, "acme", issue)).toBe(href)
  })
})

describe("les adresses autour de l'issue et de la conversation", () => {
  it("ferme l'issue sur l'écran qu'elle recouvre, la conversation gardée", () => {
    expect(closeIssueHref("/acme/projects/3", "?c=9&issue=34")).toBe("/acme/projects/3?c=9")
    expect(closeIssueHref("/acme/inbox", params("issue=34&project=3"))).toBe("/acme/inbox")
  })

  it("change la requête, et ne garde que la conversation pour un autre écran", () => {
    expect(hrefWith("/acme", "?a=1", { b: "2", a: null })).toBe("/acme?b=2")
    expect(hrefWith("/acme", undefined, {})).toBe("/acme")
    expect(withConversation("/acme/projects/3", "?c=9&issue=34")).toBe("/acme/projects/3?c=9")
    expect(withConversation("/acme/projects/3", null)).toBe("/acme/projects/3")
  })

  it.each([
    ["/acme/projects/3", "board"],
    ["/acme/projects/3/list", "list"],
    ["/acme/projects/3/backlog", "backlog"],
    ["/acme/inbox", "inbox"],
    ["/acme/my-work/issues", "my-work"],
    [null, ""],
  ])("sous l'issue, %s est l'écran %s", (pathname, screen) => {
    expect(screenUnder(pathname)).toBe(screen)
  })

  it("donne son adresse à la vue du travail d'une mission, et la relit", () => {
    expect(missionPath("acme", 42)).toBe("/acme/missions/42")
    expect(missionOf("/acme/missions/42")).toBe(42)
    expect(missionOf("/acme/missions")).toBeNull()
    expect(missionOf("/acme/missions/abc")).toBeNull()
    expect(missionOf(undefined)).toBeNull()
  })

  it("lit la conversation de l'adresse", () => {
    expect(conversationOf(params("c=12"))).toBe(12)
    expect(conversationOf(params("c=new"))).toBeNull()
    expect(conversationOf(null)).toBeNull()
  })

  it("reconnaît la même adresse, ses paramètres dans n'importe quel ordre", () => {
    expect(sameAddress("/acme/projects/3?c=9&issue=1", "/acme/projects/3?issue=1&c=9")).toBe(true)
    expect(sameAddress("/acme/projects/3", "/acme/projects/3?c=9")).toBe(false)
    expect(sameAddress("/acme/projects/3", "/acme/projects/4")).toBe(false)
  })

  it.each([
    ["/acme/projects/3/issues/34", { projectId: 3, issueId: 34 }],
    ["https://app.example/acme/projects/3/issues/34?from=mail", { projectId: 3, issueId: 34 }],
    ["/acme/projects/3?issue=34", { projectId: 3, issueId: 34 }],
    ["/acme/projects/3?c=2&issue=34&x=1", { projectId: 3, issueId: 34 }],
    ["/acme/members/5", null],
    [null, null],
  ])("l'adresse %s désigne l'issue %o", (url, ref) => {
    expect(issueRefOfUrl(url)).toEqual(ref)
  })
})

describe("previousAddress : l'entrée d'avant dans l'historique", () => {
  const scope = globalThis as { navigation?: unknown }
  afterEach(() => { delete scope.navigation })

  it("la lit dans la Navigation API, sur ce site seulement", () => {
    const origin = globalThis.location.origin
    scope.navigation = {
      currentEntry: { index: 2 },
      entries: () => [{ url: `${origin}/a` }, { url: `${origin}/acme/projects/3?c=9` }, { url: `${origin}/acme/projects/3?c=9&issue=1` }],
    }
    expect(previousAddress()).toBe("/acme/projects/3?c=9")

    scope.navigation = { currentEntry: { index: 1 }, entries: () => [{ url: "https://elsewhere.example/x" }, { url: `${origin}/b` }] }
    expect(previousAddress()).toBeNull()
  })

  it("ne dit rien sans Navigation API, au début de l'historique, ou sur une adresse illisible", () => {
    expect(previousAddress()).toBeNull()
    scope.navigation = { currentEntry: { index: 0 }, entries: () => [{ url: "/x" }] }
    expect(previousAddress()).toBeNull()
    scope.navigation = { currentEntry: { index: 1 }, entries: () => [{ url: "::" }, { url: "/x" }] }
    expect(previousAddress()).toBeNull()
    scope.navigation = { currentEntry: { index: 1 }, entries: () => [{ url: null }, { url: "/x" }] }
    expect(previousAddress()).toBeNull()
  })
})
