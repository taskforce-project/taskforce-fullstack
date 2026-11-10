import type {
  BenchmarkCell,
  BenchmarkJudge,
  BenchmarkMatrix,
  BenchmarkVerdict,
} from "@/lib/api/model-benchmark-service";
import type { CapabilitySign } from "@/lib/ai/model-table";
import type { CONSTANTS_EN } from "@/lib/constants_en";
import { fillText } from "@/lib/delivery/result-card";

// ---------------------------------------------------------------------------
// Le banc des modèles (R131), dans les mots de l'interface : le verdict d'une cellule, ce qu'elle dit au survol, un temps,
// une durée approchée. Du texte seulement, pour que les composants restent un rendu et que la règle se teste.
// ---------------------------------------------------------------------------

type BenchmarkTexts = (typeof CONSTANTS_EN)["benchmark"];

/** Le budget d'un cas et d'un chargement, en minutes, tel que le serveur l'applique (`BenchmarkSuite`, R142). */
export const BUDGET_MINUTES = 5;

const SIGNS: Record<BenchmarkVerdict, CapabilitySign> = { give_it: "passed", with_review: "partly", not_yet: "failed", too_slow: "slow" };

/** Le signe d'un verdict dans la matrice, le même que ceux des capacités (R130) ; un tiret quand la tâche n'a pas été passée. */
export const verdictSign = (verdict: BenchmarkVerdict | null): CapabilitySign => (verdict ? SIGNS[verdict] : "none");

/** Le verdict en mots : « Give it », « With review », « Not yet », « Not run ». */
export const verdictWord = (verdict: BenchmarkVerdict | null, t: BenchmarkTexts): string =>
  verdict ? t.verdicts[verdict] : t.verdicts.none;

/** Qui l'a retourné, en mots ; rien quand la note est celle du code. */
export const judgeWord = (judge: BenchmarkJudge | null, t: BenchmarkTexts): string | null =>
  judge === "you" ? t.yourVerdict : judge === "member" ? t.memberVerdict : null;

/** Ce qu'une cellule dit au survol et aux lecteurs d'écran : la tâche, le mot, sur combien de cas, de qui il est. */
export function cellTitle(taskLabel: string, cell: BenchmarkCell, t: BenchmarkTexts): string {
  const word = verdictWord(cell.verdict, t);
  if (!cell.verdict) return fillText(t.cellEmpty, { task: taskLabel, verdict: word });
  if (cell.verdict === "too_slow") return fillText(t.cellTooSlow, { task: taskLabel, tooSlow: cell.tooSlow, total: cell.total });
  const judge = judgeWord(cell.judge, t);
  const line = fillText(t.cellVerdict, { task: taskLabel, verdict: word, passed: cell.passed, total: cell.total });
  return judge ? `${line} · ${judge}` : line;
}

/** Le temps d'une réponse : « 12 s », « 1 min 4 s » ; un tiret sans mesure. */
export function timeText(ms: number | null | undefined, t: BenchmarkTexts): string {
  if (ms === null || ms === undefined) return "-";
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 60) return fillText(t.seconds, { seconds });
  return fillText(t.minutesSeconds, { minutes: Math.floor(seconds / 60), seconds: seconds % 60 });
}

/** Combien de temps prendra un passage, à peu près : « About 12 min » ; jamais au-dessous d'une minute. */
export function roughDuration(seconds: number, t: BenchmarkTexts): string {
  return fillText(t.aboutMinutes, { minutes: Math.max(1, Math.round(seconds / 60)) });
}

/** La durée prévue pour ces modèles : la somme de leurs estimations. */
export function estimateOf(matrix: BenchmarkMatrix, models: readonly string[]): number {
  return matrix.models.filter((row) => models.includes(row.model)).reduce((sum, row) => sum + row.estimateSeconds, 0);
}
