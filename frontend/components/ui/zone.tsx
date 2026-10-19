import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * `Zone` - conteneur encadré à sémantique de couleur, façon « Danger Zone » de GitHub, réutilisable pour
 * toute mise en garde ou action sensible (suppression, opération CRUD globale…). Un seul composant, plusieurs
 * variantes (`danger` / `warning` / `info` / `success` / `neutral`) pour rester cohérent partout : on choisit
 * la variante, on remplit avec le contenu (texte + action). En-tête optionnel (titre + description).
 *
 * <p>Contraste avec les sections de réglages « card-less » : ici on VEUT une boîte, précisément parce que
 * l'action est sensible et doit se distinguer visuellement du reste du panneau.</p>
 */
const zoneVariants = cva("overflow-hidden rounded-xl border", {
  variants: {
    variant: {
      neutral: "border-border",
      info: "border-primary/30",
      success: "border-shape-green/30",
      warning: "border-shape-yellow/30",
      danger: "border-destructive/40",
    },
  },
  defaultVariants: { variant: "neutral" },
})

type ZoneVariant = NonNullable<VariantProps<typeof zoneVariants>["variant"]>

/** Teinte de l'en-tête (bordure basse + léger fond) par variante. */
const HEADER_TINT: Record<ZoneVariant, string> = {
  neutral: "border-border/70",
  info: "border-primary/20 bg-primary/5",
  success: "border-shape-green/20 bg-shape-green/5",
  warning: "border-shape-yellow/20 bg-shape-yellow/5",
  danger: "border-destructive/25 bg-destructive/5",
}

/** Couleur du titre par variante. */
const TITLE_TINT: Record<ZoneVariant, string> = {
  neutral: "text-foreground",
  info: "text-ink-blue",
  success: "text-ink-green",
  warning: "text-ink-yellow",
  danger: "text-destructive",
}

export interface ZoneProps
  extends React.ComponentProps<"section">,
    VariantProps<typeof zoneVariants> {
  readonly title?: string
  readonly description?: string
  /** Classe du corps (padding par défaut `px-5 py-4`). */
  readonly bodyClassName?: string
}

export function Zone({
  variant = "neutral",
  title,
  description,
  className,
  bodyClassName,
  children,
  ...props
}: ZoneProps) {
  const v: ZoneVariant = variant ?? "neutral"
  return (
    <section className={cn(zoneVariants({ variant }), className)} {...props}>
      {title && (
        <div className={cn("border-b px-5 py-3.5", HEADER_TINT[v])}>
          <h3 className={cn("text-sm font-semibold", TITLE_TINT[v])}>{title}</h3>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
      )}
      <div className={cn("px-5 py-4", bodyClassName)}>{children}</div>
    </section>
  )
}
