import type { BenchmarkModelFacts } from "@/lib/api/model-benchmark-service";
import type { CONSTANTS_EN } from "@/lib/constants_en";
import { fillText } from "@/lib/delivery/result-card";

// ---------------------------------------------------------------------------
// Ce qu'est un modèle, en mots (R142) : d'après ce qu'Ollama rapporte (sa famille, sa taille, ses outils, où il tient en
// mémoire) et un petit glossaire des mots de son nom, testé. Rien d'inventé : un mot inconnu ne dit rien, une valeur absente non
// plus. Du texte seulement, pour que le composant reste un rendu et que la règle se teste.
// ---------------------------------------------------------------------------

type AboutTexts = (typeof CONSTANTS_EN)["benchmark"]["about"];

/** Un mot du nom d'un modèle, et ce qu'il veut dire. */
export interface ModelNameWord {
  word: string;
  meaning: string;
}

/** Sous cette part sur le processeur, un modèle tourne à peine moins vite : sa ligne n'a rien à en dire. */
const VISIBLE_SPILL = 0.2;
/** Un octet en Go, comme Ollama les affiche (décimaux). */
const GB = 1e9;
/** Des tailles de la forme `7b`, `0.6b`, `567m` dans un nom. */
const SIZE_WORD = /^(\d+(?:\.\d+)?)([bm])$/;

/** La taille en Go, un chiffre après la virgule : « 9.3 GB ». */
export function gigabytes(bytes: number): string {
  return `${(bytes / GB).toFixed(1)} GB`;
}

/** Les mots du nom d'un modèle, ceux que le glossaire connaît, dans l'ordre où on les lit : `qwen2.5-coder:7b-base` donne coder, 7b, base. */
export function nameWords(model: string, t: AboutTexts): ModelNameWord[] {
  // Après le dernier « / » : un espace de noms (org/modèle) ne dit rien du modèle.
  const name = model.slice(model.lastIndexOf("/") + 1).toLowerCase();
  const words = name.split(/[:\-_]/).filter(Boolean);
  const found: ModelNameWord[] = [];
  for (const word of words) {
    const known = (t.words as Readonly<Record<string, string>>)[word];
    if (known && word !== "size" && word !== "sizeMillion") {
      found.push({ word, meaning: known });
      continue;
    }
    const size = SIZE_WORD.exec(word);
    if (size) {
      found.push({ word, meaning: fillText(size[2] === "b" ? t.words.size : t.words.sizeMillion, { size: size[1] }) });
    }
  }
  return found;
}

/** Une taille telle qu'Ollama la donne, en mots : « 14.8B » devient « 14.8 billion » ; une autre forme reste telle quelle. */
function parametersInWords(parameters: string, t: AboutTexts): string {
  const size = /^(\d+(?:\.\d+)?)\s*([BM])$/i.exec(parameters.trim());
  if (!size) return parameters;
  return fillText(size[2].toUpperCase() === "B" ? t.billion : t.million, { size: size[1] });
}

/** Sa famille et sa taille, en une phrase : « qwen3 family, 14.8 billion parameters. » ; null sans famille dite par Ollama. */
export function familyLine(facts: BenchmarkModelFacts, t: AboutTexts): string | null {
  if (!facts.family) return null;
  return facts.parameters
    ? fillText(t.familySized, { family: facts.family, parameters: parametersInWords(facts.parameters, t) })
    : fillText(t.family, { family: facts.family });
}

/** S'il tient sur la carte graphique, mesuré à son dernier chargement ; null tant qu'il n'a pas été chargé ici. */
export function fitLine(facts: BenchmarkModelFacts, t: AboutTexts): string | null {
  const { memoryBytes: memory, gpuBytes: gpu } = facts;
  if (memory === null || memory <= 0 || gpu === null) return null;
  if (gpu >= memory) return fillText(t.fits, { size: gigabytes(memory) });
  if (gpu <= 0) return fillText(t.noGpu, { memory: gigabytes(memory) });
  return fillText(gpu / memory < 0.5 ? t.spillsMost : t.spills, { memory: gigabytes(memory), gpu: gigabytes(gpu) });
}

/** La raison à montrer sur la ligne : une part qui compte tourne sur le processeur. La petite part d'un modèle qui tient presque ne se dit qu'au détail. */
export function spillsVisibly(facts: BenchmarkModelFacts): boolean {
  const { memoryBytes: memory, gpuBytes: gpu } = facts;
  if (memory === null || memory <= 0 || gpu === null || gpu >= memory) return false;
  return (memory - gpu) / memory >= VISIBLE_SPILL;
}
