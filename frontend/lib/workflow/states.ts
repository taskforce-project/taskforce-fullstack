/**
 * Les dix états d'un nœud du workflow (séance n°25, spécification d'UX §4.4), dans l'ordre du tri d'une colonne. Chaque
 * état a sa marque et son mot, jamais sa couleur seule ; seul « Working » bouge.
 */
export const WORKFLOW_STATES = [
  "needsYou", "failed", "missing", "blocked", "working", "waiting", "notStarted", "done", "skipped", "stopped",
] as const

export type WorkflowState = (typeof WORKFLOW_STATES)[number]

/** Le rang du tri dans une colonne : Skipped et Stopped se rangent avec Done, après lui. */
export const STATE_RANK: Readonly<Record<WorkflowState, number>> = {
  needsYou: 1,
  failed: 2,
  missing: 3,
  blocked: 4,
  working: 5,
  waiting: 6,
  notStarted: 7,
  done: 8,
  skipped: 9,
  stopped: 9,
}

/** Ce qui est fini : au-delà de cinq de ces cartes, une colonne les replie (« Show {count} done »). */
export const TERMINAL: ReadonlySet<WorkflowState> = new Set<WorkflowState>(["done", "skipped", "stopped"])

/** Les exceptions : en Summary, seules elles gardent une carte (avec ce qui a passé sa date). */
export const EXCEPTIONS: ReadonlySet<WorkflowState> = new Set<WorkflowState>(["needsYou", "failed", "missing", "blocked"])

/** Ce qui demande l'attention, dans l'ordre où `f` y mène : Needs you, puis Failed, puis Missing. */
export const ATTENTION: readonly WorkflowState[] = ["needsYou", "failed", "missing"]

/** Les filtres de l'en-tête, un à la fois (`?filter=`), et l'état de chacun. */
export const FILTERS = ["needs-you", "blocked", "missing", "failed"] as const
export type WorkflowFilter = (typeof FILTERS)[number]

/**
 * Ce que la vue offre aujourd'hui : Missing vient avec les processus (W5), rien ne le produit encore. Le filtre et la légende
 * ne l'offrent pas, pour ne pas montrer ce qui ne marche pas ; l'adresse le garde, et son compteur se montre s'il a un nombre.
 */
export const OFFERED_FILTERS: readonly WorkflowFilter[] = FILTERS.filter((filter) => filter !== "missing")
export const LEGEND_STATES: readonly WorkflowState[] = WORKFLOW_STATES.filter((state) => state !== "missing")

export const FILTER_STATE: Readonly<Record<WorkflowFilter, WorkflowState>> = {
  "needs-you": "needsYou",
  blocked: "blocked",
  missing: "missing",
  failed: "failed",
}

/** Les trois densités (§4.2, §4.3) : une carte, trois lectures. */
export const DENSITIES = ["summary", "plan", "detail"] as const
export type Density = (typeof DENSITIES)[number]

export const isDensity = (value: string | null | undefined): value is Density =>
  value === "summary" || value === "plan" || value === "detail"

export const isFilter = (value: string | null | undefined): value is WorkflowFilter =>
  value === "needs-you" || value === "blocked" || value === "missing" || value === "failed"

/**
 * La largeur d'une colonne et d'une carte, par densité (§3, §4.3). En Summary, c'est un minimum : les colonnes se partagent
 * la largeur libre de la vue (R161, H5).
 */
export const COLUMN_WIDTH: Readonly<Record<Density, number>> = { summary: 160, plan: 264, detail: 304 }
