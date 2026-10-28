/**
 * Plus ancienne version de Claude Code qui tient la porte du runner : en dessous, il refuse la mission
 * (`taskforce-runner/src/version.ts`, même valeur).
 */
export const MIN_CLAUDE_CODE = "2.1.295"

/** `2.1.293 (Claude Code)` ou `2.1.293` : vrai si au moins {@link MIN_CLAUDE_CODE}. Illisible : faux. */
export function claudeCodeUpToDate(version: string | null | undefined): boolean {
  const found = /(\d+)\.(\d+)\.(\d+)/.exec(version ?? "")
  if (!found) return false
  const min = MIN_CLAUDE_CODE.split(".").map(Number)
  for (let i = 0; i < 3; i++) {
    const part = Number(found[i + 1])
    const floor = min[i] ?? 0
    if (part !== floor) return part > floor
  }
  return true
}
