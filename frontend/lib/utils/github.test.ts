import { describe, expect, it } from "vitest"

import { githubUrl, isCommitSha, isGitHubRepoFullName, isGitHubRepoName, isPullRequestNumber } from "./github"

describe("isGitHubRepoFullName", () => {
  it.each(["octo/hello", "my-org/repo.name", "a/b_c-d.e", "Octo-Cat/Hello-World"])("accepte %s", (value) => {
    expect(isGitHubRepoFullName(value)).toBe(true)
  })

  it.each([
    ["", "vide"],
    ["octo", "sans propriétaire"],
    ["octo/hello?per_page=1", "paramètre glissé dans l'URL de l'API"],
    ["octo/../admin", "remontée de chemin"],
    ["-octo/hello", "propriétaire qui commence par un tiret"],
    ["octo/hello/extra", "segment en trop"],
    [" octo/hello", "espace"],
  ])("refuse %s (%s)", (value) => {
    expect(isGitHubRepoFullName(value)).toBe(false)
  })
})

describe("isPullRequestNumber", () => {
  it.each(["1", "42", "123456"])("accepte %s", (value) => {
    expect(isPullRequestNumber(value)).toBe(true)
  })

  it.each(["", "0", "-1", "07", "1.5", "abc", "9999999999"])("refuse %s", (value) => {
    expect(isPullRequestNumber(value)).toBe(false)
  })
})

describe("isCommitSha", () => {
  it.each(["abc1234", "ABCDEF0", "0123456789abcdef0123456789abcdef01234567"])("accepte %s", (value) => {
    expect(isCommitSha(value)).toBe(true)
  })

  it.each(["", "abc123", "not-a-hash", "0123456789abcdef0123456789abcdef012345678"])("refuse %s", (value) => {
    expect(isCommitSha(value)).toBe(false)
  })
})

describe("githubUrl", () => {
  it("déduit la page d'une pull request ou d'un commit", () => {
    expect(githubUrl("octo/hello", "pull", "42")).toBe("https://github.com/octo/hello/pull/42")
    expect(githubUrl("octo/hello", "commit", "abc1234")).toBe("https://github.com/octo/hello/commit/abc1234")
  })
})

describe("isGitHubRepoName", () => {
  it.each(["website", "mobile-app-v2", "repo.name", "a_b"])("accepte %s", (value) => {
    expect(isGitHubRepoName(value)).toBe(true)
  })

  it.each(["", ".", "..", "owner/name", "my repo", "x?y=1"])("refuse %s", (value) => {
    expect(isGitHubRepoName(value)).toBe(false)
  })
})
