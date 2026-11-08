import type { CONSTANTS_EN } from "@/lib/constants_en";
import type { ModelCapabilityRow, ModelCapabilityScore, ModelCapabilityTable } from "@/lib/api/model-capability-service";

// ---------------------------------------------------------------------------
// Ce que sait faire chaque modèle (R113), dans les mots et les signes de l'interface : un signe par capacité (R130), sa
// note en mots (« 2/2 », « 1/2 · holds 500 words »), ce que TaskForce propose. Du texte seulement, pour que le composant
// reste un rendu et que la règle se teste.
// ---------------------------------------------------------------------------

type ModelTexts = (typeof CONSTANTS_EN)["models"];

/** Le signe d'une capacité (« Le dessin », séance n°19) : point plein, demi-point, cercle, tiret. */
export type CapabilitySign = "passed" | "partly" | "failed" | "none";

const fill = (text: string, values: Record<string, string | number>): string =>
  text.replace(/\{(\w+)\}/g, (all, key: string) => (key in values ? String(values[key]) : all));

/** Réussie : tous ses cas mesurés et réussis ; ratée : aucun de ses cas mesurés n'a réussi ; en partie, le reste. */
export function scoreSign(score: ModelCapabilityScore): CapabilitySign {
  if (score.measured === 0) return "none";
  if (score.capable) return "passed";
  return score.passed === 0 ? "failed" : "partly";
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

/** Les capacités d'un modèle en mots, pour son détail (R130) : « Tools 2/2 · Long context 1/2 · holds 500 words ». */
export function scoreLine(table: ModelCapabilityTable, row: ModelCapabilityRow, t: ModelTexts): string {
  return row.scores
    .map((score) => `${table.capabilities.find((c) => c.key === score.capability)?.label ?? score.capability} ${scoreText(score, t)}`)
    .join(" · ");
}

/** Les titres des cas ratés d'un modèle à leur dernière note, dans l'ordre de la suite ; un cas inconnu garde sa clé. */
export function failedCaseTitles(table: ModelCapabilityTable, row: ModelCapabilityRow): string[] {
  return (row.failedCases ?? []).map((key) => table.cases.find((c) => c.key === key)?.title ?? key);
}

/** Ce pour quoi TaskForce propose ce modèle, dans son détail (R130) ; null quand il n'est proposé pour rien. */
export function proposedFor(table: ModelCapabilityTable, model: string, t: ModelTexts): string | null {
  if (table.proposed === model) return t.proposedEverything;
  const capabilities = table.proposals
    .filter((proposal) => proposal.model === model)
    .map((proposal) => table.capabilities.find((c) => c.key === proposal.capability)?.label ?? proposal.capability);
  return capabilities.length === 0 ? null : fill(t.proposedFor, { capabilities: capabilities.join(", ") });
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
