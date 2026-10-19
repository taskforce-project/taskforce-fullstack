/**
 * Règles GitHub partagées par les formulaires (lien d'une issue, dépôt d'un projet). Elles reprennent celles du
 * backend (`GitHubRepoNames`, `GitHubLinkRequest`) : une saisie refusée l'est avant l'appel, avec la même règle.
 */

const REPO_FULL_NAME = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/
const REPO_NAME = /^[A-Za-z0-9_.-]{1,100}$/
const PR_NUMBER = /^[1-9]\d{0,8}$/
const COMMIT_SHA = /^[0-9a-fA-F]{7,40}$/

/** `owner/name`, sans `..` (le nom finit dans l'URL de l'API GitHub). */
export function isGitHubRepoFullName(value: string): boolean {
  return REPO_FULL_NAME.test(value) && !value.includes("..")
}

/** Nom d'un dépôt à créer (sans propriétaire : il est créé sur le compte GitHub connecté). */
export function isGitHubRepoName(value: string): boolean {
  return REPO_NAME.test(value) && value !== "." && value !== ".."
}

/** Numéro de pull request : entier strictement positif, qui tient dans l'entier du backend. */
export function isPullRequestNumber(value: string): boolean {
  return PR_NUMBER.test(value)
}

/** Hash de commit, abrégé (7 caractères) ou complet. */
export function isCommitSha(value: string): boolean {
  return COMMIT_SHA.test(value)
}

/** Page GitHub d'une pull request ou d'un commit, déduite du dépôt quand le lien n'est pas saisi. */
export function githubUrl(repoFullName: string, kind: "pull" | "commit", ref: string): string {
  return `https://github.com/${repoFullName}/${kind}/${ref}`
}
