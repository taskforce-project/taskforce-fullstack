"use client"

import { useId } from "react"
import { ResponsiveContainer, AreaChart, Area, YAxis } from "recharts"

import { cn } from "@/lib/utils"

/** Teintes disponibles - alignées sur le sens produit : bleu = activité, rouge = risque. */
const TONE = {
  blue: "#3b82f6",
  red:  "#ef4444",
} as const

export type SparklineTone = keyof typeof TONE

export interface SparklineProps {
  /** Valeurs dans l'ordre chronologique. */
  readonly values: readonly number[]
  readonly tone?: SparklineTone
  readonly height?: number
  readonly className?: string
  /** Texte affiché à la place de la courbe quand il n'y a rien à montrer. */
  readonly emptyLabel?: string
  /**
   * Rend la courbe même si toutes les valeurs sont à zéro (ligne plate au plancher).
   * Indispensable pour une métrique dont l'objectif EST zéro : une ligne plate en bas
   * est un résultat, pas une absence de données.
   */
  readonly renderZero?: boolean
}

/**
 * Marge basse nulle : le dégradé doit mourir SUR la limite qui suit (bord de carte ou filet
 * séparateur), pas quelques pixels au-dessus. Un aplat qui s'arrête dans le vide donne
 * l'impression d'un graphe qui flotte ; ancré, il se lit comme une surface posée.
 * C'est à l'appelant de coller le conteneur à cette limite (cf. `-mb-*` aux points d'appel).
 */
const CHART_MARGIN = { top: 2, right: 0, left: 0, bottom: 0 } as const

/**
 * Hauteur de la bande pleine réservée SOUS la courbe, en pixels.
 *
 * La courbe ne touche jamais la ligne d'ancrage : elle s'arrête au-dessus, et c'est le dégradé
 * qui occupe l'espace restant jusqu'à la ligne. Un trait posé sur la ligne se confondrait avec
 * elle, et une série à zéro n'aurait plus aucun aplat à montrer.
 */
export const BASELINE_OFFSET_PX = 15

/**
 * Dégradé d'aire - <b>source unique</b> pour toutes les courbes de l'app (sparklines des
 * opérations, cartes du dashboard…). À placer dans un `<defs>`, puis référencer via
 * {@code fill={`url(#${id})`}}.
 *
 * Le bas garde un reste d'opacité au lieu de tomber à 0 : sur fond sombre, un fondu vers le
 * transparent pur s'éteint trop tôt et la bande basse disparaît avant sa ligne d'ancrage.
 */
export function AreaGradient({ id, color }: { readonly id: string; readonly color: string }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={color} stopOpacity={0.28} />
      <stop offset="100%" stopColor={color} stopOpacity={0.06} />
    </linearGradient>
  )
}

/**
 * Borne basse du domaine Y réservant une bande de {@link BASELINE_OFFSET_PX} sous la courbe.
 *
 * À passer à la fois au `domain` de l'axe Y ET au `baseValue` de l'aire : le premier remonte le
 * tracé, le second fait descendre le remplissage jusqu'à la ligne. Sans les deux, soit la courbe
 * colle à la ligne, soit l'aplat s'arrête avant.
 *
 * <p><b>Ne pas utiliser sur un graphe à axes visibles</b> : la graduation afficherait des valeurs
 * négatives et le lecteur croirait à des données sous zéro. Réservé aux courbes muettes.</p>
 */
export function chartBaseline({
  height,
  domainMax,
  marginTop = CHART_MARGIN.top,
}: {
  readonly height: number
  readonly domainMax: number
  readonly marginTop?: number
}): number {
  const plotHeight = Math.max(1, height - marginTop)
  const usableHeight = Math.max(1, plotHeight - BASELINE_OFFSET_PX)
  return -(Math.max(1, domainMax) * BASELINE_OFFSET_PX) / usableHeight
}

/**
 * Micro-courbe de tendance, sans axes ni repères.
 *
 * Volontairement muette sur les valeurs : elle donne la forme (ça monte, ça descend, c'est plat),
 * le chiffre exact étant déjà affiché à côté.
 */
export function Sparkline({
  values,
  tone = "blue",
  height = 36,
  className,
  emptyLabel = "No data",
  renderZero = false,
}: SparklineProps) {
  // `useId` : plusieurs sparklines coexistent sur la page, chacune a besoin d'un
  // identifiant de dégradé unique - sinon toutes héritent du premier rendu.
  const gradientId = useId().replace(/:/g, "")
  const color = TONE[tone]

  const hasSignal = values.some((v) => v > 0)
  if (values.length === 0 || (!hasSignal && !renderZero)) {
    return (
      <div className={cn("flex items-center text-[10px] text-muted-foreground/50", className)} style={{ height }}>
        {emptyLabel}
      </div>
    )
  }

  const data = values.map((value, i) => ({ i, value }))
  const max = Math.max(...values)

  // Domaine forcé à partir de 0 : sans lui, Recharts recadre sur les valeurs et une série plate
  // à 0 se dessine au MILIEU du cadre - visuellement identique à une série plate à 5.
  const domainMax = Math.max(1, max)
  const baseline = chartBaseline({ height, domainMax })

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={CHART_MARGIN}>
          <defs>
            <AreaGradient id={gradientId} color={color} />
          </defs>
          <YAxis hide domain={[baseline, domainMax]} />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#${gradientId})`}
            dot={false}
            isAnimationActive={false}
            // Le remplissage descend jusqu'au bas du domaine (et non jusqu'à 0) : c'est ce qui
            // donne la bande pleine entre la courbe et la ligne.
            baseValue={baseline}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
