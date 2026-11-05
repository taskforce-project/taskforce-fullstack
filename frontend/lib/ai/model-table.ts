import type { CONSTANTS_EN } from "@/lib/constants_en";
import type { ModelCapabilityScore, ModelCapabilityTable } from "@/lib/api/model-capability-service";

// ---------------------------------------------------------------------------
// La table de ce que sait faire chaque modèle (R113), dans les mots de l'interface : une cellule par capacité (« 2/2 »,
// « 1/2 · holds 500 words »), sa couleur, et ce que TaskForce propose. Du texte seulement, pour que le composant reste
// un rendu et que la règle se teste.
// ---------------------------------------------------------------------------

type ModelTexts = (typeof CONSTANTS_EN)["models"];

/** Le ton d'une cellule : réussie, au moins un cas échoué, ou rien à dire (pas mesurée, ou en partie et sans échec). */
export type ScoreTone = "good" | "bad" | "none";

const fill = (text: string, values: Record<string, string | number>): string =>
  text.replace(/\{(\w+)\}/g, (all, key: string) => (key in values ? String(values[key]) : all));

export function scoreTone(score: ModelCapabilityScore): ScoreTone {
  if (score.capable) return "good";
  if (score.measured > 0 && score.passed < score.measured) return "bad";
  return "none";
}

/** « 2/2 », « 1 of 2 measured », « Not measured » ; le contexte dit en plus la taille tenue. */
export function scoreText(score: ModelCapabilityScore, t: ModelTexts): string {
  if (score.measured === 0) return t.notMeasured;
  const base = score.measured === score.total
    ? `${score.passed}/${score.total}`
    : fill(t.partial, { passed: score.passed, measured: score.measured });
  if (score.capability !== "context" || score.heldWords === null) return base;
  const held = score.heldWords === 0 ? t.heldNone : fill(t.heldWords, { words: score.heldWords.toLocaleString("en-US") });
  return `${base} · ${held}`;
}

/** Ce que TaskForce propose : le premier modèle capable de tout, puis, pour chaque capacité, le premier capable. */
export function proposalLines(table: ModelCapabilityTable, t: ModelTexts): { overall: string; each: string[] } {
  const overall = table.proposed ? fill(t.proposalEverything, { model: table.proposed }) : t.proposalNone;
  const each = table.capabilities.map((capability) => {
    const proposal = table.proposals.find((p) => p.capability === capability.key);
    return fill(t.proposalFor, { capability: capability.label, model: proposal ? proposal.model : t.nobodyYet });
  });
  return { overall, each };
}

export { fill as fillModelText };
