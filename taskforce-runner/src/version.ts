/**
 * Plus ancienne version de Claude Code qui tient la porte : le mode `manual` et le hook HTTP (vérifiés sur la 2.1.293),
 * plus `onFailure: "block"`, qui ferme la garde quand le serveur local ne répond pas (2.1.295, journal des versions).
 */
export const MIN_CLAUDE_CODE = "2.1.295";

/** `2.1.293 (Claude Code)` -> vrai si au moins {@link MIN_CLAUDE_CODE}. */
export function supportsApprovals(versionLine: string): boolean {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(versionLine);
  if (!match) return false;
  const found = match.slice(1, 4).map(Number);
  const min = MIN_CLAUDE_CODE.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((found[i] ?? 0) !== (min[i] ?? 0)) return (found[i] ?? 0) > (min[i] ?? 0);
  }
  return true;
}
