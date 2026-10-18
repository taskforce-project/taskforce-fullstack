import type { IssuePriority } from "@/lib/api/issue-service"

/*
 * Couleurs d'accent de l'interface, sur les jetons de la direction artistique (app/globals.css :
 * formes pleines `shape-*`, couleurs de graphique `chart-*`). Les classes sont écrites en entier :
 * Tailwind ne génère que celles qu'il trouve telles quelles dans le code.
 */

/** Pastille de priorité d'une issue : rouge, jaune, bleu, puis gris pour les priorités basses. */
export const PRIORITY_DOT: Record<IssuePriority, string> = {
  URGENT: "bg-shape-red",
  HIGH:   "bg-shape-yellow",
  MEDIUM: "bg-primary",
  LOW:    "bg-subtle",
  NONE:   "bg-muted-foreground/30",
}

const SERIES = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5"] as const

/** Couleur stable d'une série (un projet sur la feuille de route, un membre) : les couleurs de graphique. */
export function seriesColor(id: number): string {
  return SERIES[Math.abs(id) % SERIES.length]
}

/**
 * Formes pleines de la palette, avec l'encre lisible posée dessus (contraste AA, initiales comprises) :
 * blanc sur le bleu, bleu nuit sur toutes les autres formes.
 */
export const SHAPE_FILLS = [
  { bg: "bg-shape-blue",   fg: "text-white" },
  { bg: "bg-shape-green",  fg: "text-night" },
  { bg: "bg-shape-red",    fg: "text-night" },
  { bg: "bg-shape-yellow", fg: "text-night" },
  { bg: "bg-shape-pink",   fg: "text-night" },
  { bg: "bg-shape-sky",    fg: "text-night" },
  { bg: "bg-shape-lime",   fg: "text-night" },
] as const

/** Forme pleine stable pour une graine (un workspace, par exemple). */
export function shapeFill(seed: number): (typeof SHAPE_FILLS)[number] {
  return SHAPE_FILLS[Math.abs(seed) % SHAPE_FILLS.length]
}

/** Encre lisible sur une forme pleine donnée par sa classe (`bg-shape-*`) ; blanc par défaut. */
export function inkOnShape(bg: string): string {
  return SHAPE_FILLS.find((f) => f.bg === bg)?.fg ?? "text-white"
}
