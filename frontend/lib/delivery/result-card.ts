import type { DeliveryRun, DeliveryRunActivity } from "@/lib/api/delivery-service";
import type { CONSTANTS_EN } from "@/lib/constants_en";
import { parseServerDate } from "@/lib/utils/server-date";

// ---------------------------------------------------------------------------
// La carte de résultat d'une mission (R78, séance n°13 ; J3, R50) : ce qui est rendu, les contrôles tirés du dossier
// (jamais du résumé de l'agent), ce qui changera si l'on applique, et comment ce fut fait.
// ---------------------------------------------------------------------------

type ResultTexts = (typeof CONSTANTS_EN)["missions"]["result"];

export interface PullRequest {
  number: number;
  repo: string;
  url: string;
}

export interface Check {
  label: string;
  value: string;
  /** Vrai : passé ; faux : à regarder ; null : un fait sans jugement. */
  ok: boolean | null;
}

export interface Change {
  text: string;
  final: boolean;
}

export interface ResultCardModel {
  pr: PullRequest | null;
  /** Minutes de travail, du moment où le runner a pris la mission à sa fin ; null sans fin connue. */
  minutes: number | null;
  checks: Check[];
  changes: Change[];
  /** « Rules v12 · 38 steps · 2 requests, 2 answered » */
  how: string;
}

const PULL = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/pull\/(\d{1,9})(?:[/?#].*)?$/;

const fill = (text: string, values: Record<string, string | number>): string =>
  Object.entries(values).reduce((out, [key, value]) => out.replaceAll(`{${key}}`, String(value)), text);

/** La pull request que l'adresse du résultat désigne, si c'en est une de GitHub. */
export function pullRequestOf(url: string | null | undefined): PullRequest | null {
  const match = url ? PULL.exec(url) : null;
  return match ? { number: Number(match[2]), repo: match[1] ?? "", url: url as string } : null;
}

/** Les minutes de travail, arrondies au-dessus ; null tant que la mission n'a pas de fin. */
export function workMinutes(run: Pick<DeliveryRun, "claimedAt" | "createdAt" | "endedAt">): number | null {
  const start = run.claimedAt ?? run.createdAt;
  if (!run.endedAt || !start) return null;
  const ms = parseServerDate(run.endedAt).getTime() - parseServerDate(start).getTime();
  return Math.max(0, Math.ceil(ms / 60_000));
}

function testsCheck(run: DeliveryRun, t: ResultTexts): Check {
  const tests = run.tests;
  if (!tests) return { label: t.noTestCommand, value: "", ok: null };
  if (!tests.ran) return { label: t.testsNotRun, value: t.testsNotRunValue, ok: false };
  const counted = tests.passedCount != null && tests.total != null;
  const value = counted
    ? fill(t.testsCount, { passed: tests.passedCount as number, total: tests.total as number })
    : tests.passed ? t.testsPassedNoCount : t.testsFailedNoCount;
  return { label: tests.passed ? t.testsRan : t.testsFailed, value, ok: tests.passed };
}

export function resultCard(
  run: DeliveryRun,
  activity: DeliveryRunActivity | undefined,
  issueKey: string | null,
  t: ResultTexts,
): ResultCardModel {
  const pr = pullRequestOf(run.resultUrl);
  const approvals = activity?.approvals ?? [];
  const asked = approvals.length;
  const answered = approvals.filter((a) => a.status === "ALLOWED" || a.status === "DENIED").length;
  const checks: Check[] = [testsCheck(run, t)];
  if (asked > 0) checks.push({ label: t.requestsAnswered, value: fill(t.requestsCount, { answered, asked }), ok: answered === asked });
  const changes: Change[] = pr
    ? [
        { text: fill(t.mergeChange, { number: pr.number }), final: true },
        ...(issueKey ? [{ text: fill(t.moveChange, { key: issueKey }), final: false }] : []),
      ]
    : [];
  return {
    pr,
    minutes: workMinutes(run),
    checks,
    changes,
    how: fill(t.howItWasDoneValue, {
      version: run.rulesVersion ?? "?", actions: activity?.events.length ?? 0, asked, answered,
    }),
  };
}

/** La phrase du résultat : la pull request, sinon la branche, sinon rien à changer. */
export function resultLine(run: DeliveryRun, t: ResultTexts): string {
  const pr = pullRequestOf(run.resultUrl);
  if (pr) return fill(t.pullRequest, { number: pr.number, repo: pr.repo });
  if (run.branch && run.commits) return fill(t.branchOnly, { commits: run.commits, branch: run.branch });
  return t.noChange;
}

export { fill as fillText };
