/**
 * La place du volet à côté de la conversation (R120 et « Le dessin », séance n°18) : par défaut, la moitié de la place
 * qui reste ; le volet tient 480 px au moins, la conversation 360 px. Sous ces deux largeurs ensemble, le volet prend
 * toute la largeur et la conversation se replie dans le compositeur. La poignée change la largeur, retenue pour la
 * personne ; un double-clic la ramène à la moitié.
 */

export const MIN_PANE = 480
export const MIN_CONVERSATION = 360
/** Un pas des flèches sur la poignée ; avec Maj, un grand pas. */
export const STEP = 16
export const BIG_STEP = 64

export interface PaneSplit {
  /** Trop peu de place pour les deux : le volet prend toute la largeur. */
  readonly narrow: boolean
  /** La largeur du volet, en px ; null tant que la place n'est pas mesurée (le volet garde alors sa moitié en CSS). */
  readonly width: number | null
  /** La plus grande largeur que la conversation laisse au volet. */
  readonly max: number
}

export const clampWidth = (width: number, max: number): number => Math.round(Math.min(Math.max(width, MIN_PANE), max))

/**
 * Le partage de `space`, la largeur à côté de la barre de gauche et de la zone de droite, entre la conversation et le
 * volet ; `wanted`, la largeur retenue pour la personne, ou null pour la moitié.
 */
export function paneSplit(space: number, wanted: number | null): PaneSplit {
  if (!(space > 0)) return { narrow: false, width: null, max: Number.POSITIVE_INFINITY }
  const max = space - MIN_CONVERSATION
  if (max < MIN_PANE) return { narrow: true, width: null, max: MIN_PANE }
  return { narrow: false, width: clampWidth(wanted ?? space / 2, max), max }
}
