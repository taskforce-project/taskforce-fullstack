import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * Gabarit de page unifié (QA2-12 / PROD-8.1).
 *
 * Source unique de cohérence pour le layout des pages : même max-width centrée,
 * même rythme vertical, même en-tête (titre + description + actions). Toutes les
 * pages « contenu » doivent passer par `PageContainer` (+ `PageHeader`) plutôt que
 * de redéclarer leur propre `mx-auto max-w-*` ad-hoc.
 *
 * La largeur du shell (`p-6 md:p-8`) reste gérée par `AppShell` ; ici on ne gère
 * que la largeur de lecture du contenu.
 */

const SIZE_CLASS = {
  /** Pages standard (dashboard, opérations, analytics, membres, équipes…). */
  default: "max-w-screen-2xl",
  /** Pages plus larges (boards denses qui ont besoin d'espace). */
  wide: "max-w-[1800px]",
  /** Flux/feeds focalisés et formulaires (inbox, réglages d'un objet…). */
  narrow: "max-w-3xl",
  /** Aucune contrainte (vues plein écran type kanban). */
  full: "max-w-none",
} as const

export type PageSize = keyof typeof SIZE_CLASS

export function PageContainer({
  size = "default",
  className,
  children,
}: {
  readonly size?: PageSize
  readonly className?: string
  readonly children: React.ReactNode
}) {
  return (
    <div className={cn("mx-auto flex w-full flex-col gap-6", SIZE_CLASS[size], className)}>
      {children}
    </div>
  )
}

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  readonly title: React.ReactNode
  readonly description?: React.ReactNode
  readonly actions?: React.ReactNode
  readonly className?: string
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="min-w-0 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}
