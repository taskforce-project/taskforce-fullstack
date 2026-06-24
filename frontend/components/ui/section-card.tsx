import * as React from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

/**
 * Carte à en-tête façon Cloudflare : titre (muted) + action à droite + séparateur,
 * puis un corps flexible. Réutilisable pour lister des lignes, des métriques, etc.
 *
 * <SectionCard title="Active operations" action={<SectionCardLink href="…" />}>
 *   …rows…
 * </SectionCard>
 */
export function SectionCard({
  title,
  icon,
  action,
  href,
  children,
  className,
  bodyClassName,
}: {
  readonly title?: React.ReactNode
  readonly icon?: React.ReactNode
  readonly action?: React.ReactNode
  /** Si fourni : toute l'en-tête devient cliquable (Link) avec une flèche à droite. */
  readonly href?: string
  readonly children: React.ReactNode
  readonly className?: string
  /** padding du corps — défaut `p-4`. Passer `p-0` pour des lignes pleine largeur. */
  readonly bodyClassName?: string
}) {
  // En-tête gris subtil (distinct du blanc du corps), façon Cloudflare.
  const headerBase = "flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-3"
  const titleNode = (
    <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-muted-foreground">
      {icon}
      {title && <span className="truncate">{title}</span>}
    </div>
  )

  return (
    <Card className={cn("gap-0 overflow-hidden py-0", className)}>
      {href ? (
        <Link href={href} className={cn(headerBase, "transition-colors hover:bg-muted/70")}>
          {titleNode}
          <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
        </Link>
      ) : (title || action) ? (
        <div className={headerBase}>
          {titleNode}
          {action && <div className="flex shrink-0 items-center gap-1">{action}</div>}
        </div>
      ) : null}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </Card>
  )
}

/** Lien d'action discret (flèche par défaut) pour l'en-tête d'une SectionCard. */
export function SectionCardLink({
  href,
  children,
  label = "View all",
}: {
  readonly href: string
  readonly children?: React.ReactNode
  readonly label?: string
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      {children ?? <ArrowRight className="size-4" />}
    </Link>
  )
}

/**
 * Rangée de métriques (KPIs) séparées par un filet vertical, façon carte « Security » de Cloudflare.
 * À mettre dans une SectionCard avec `bodyClassName="p-0"`. Accepte 1, 2 ou 3+ <Metric>.
 */
export function MetricSplit({
  children,
  className,
}: {
  readonly children: React.ReactNode
  readonly className?: string
}) {
  return <div className={cn("flex divide-x divide-border", className)}>{children}</div>
}

export function Metric({
  label,
  value,
  delta,
  valueClassName,
}: {
  readonly label: React.ReactNode
  readonly value: React.ReactNode
  readonly delta?: React.ReactNode
  readonly valueClassName?: string
}) {
  return (
    <div className="flex flex-1 flex-col gap-2 px-5 py-4">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <div className="flex items-baseline gap-2">
        <span className={cn("text-2xl font-semibold tabular-nums tracking-tight text-foreground", valueClassName)}>{value}</span>
        {delta}
      </div>
    </div>
  )
}

/** Mini barres verticales normalisées (données réelles, ex. charge par opération). */
export function MiniBars({
  values,
  className,
}: {
  readonly values: readonly number[]
  readonly className?: string
}) {
  const max = Math.max(1, ...values)
  return (
    <div className={cn("flex h-8 items-end gap-1", className)}>
      {values.length === 0 ? (
        <div className="h-px w-full self-center bg-border" />
      ) : (
        values.map((v, i) => (
          <div
            key={i}
            className="flex-1 rounded-sm bg-primary/50"
            style={{ height: `${Math.max(8, (v / max) * 100)}%` }}
          />
        ))
      )}
    </div>
  )
}

/** Barre de répartition segmentée (ex. santé des opérations). */
export function SegmentBar({
  segments,
  className,
}: {
  readonly segments: readonly { readonly value: number; readonly className: string }[]
  readonly className?: string
}) {
  const total = segments.reduce((s, x) => s + x.value, 0)
  return (
    <div className={cn("flex h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      {total > 0 &&
        segments.map((s, i) =>
          s.value > 0 ? (
            <div key={i} className={cn("h-full", s.className)} style={{ width: `${(s.value / total) * 100}%` }} />
          ) : null
        )}
    </div>
  )
}

/**
 * Sous-section libellée À L'INTÉRIEUR d'une carte (ex. My Queue → Issues / Sprints / Pages).
 * À utiliser avec `bodyClassName="p-0"` sur la SectionCard parente.
 */
export function CardSubSection({
  label,
  count,
  children,
  className,
}: {
  readonly label: string
  readonly count?: number
  readonly children: React.ReactNode
  readonly className?: string
}) {
  return (
    <div className={cn("border-b border-border last:border-0", className)}>
      <div className="flex items-center gap-2 px-4 py-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        {count !== undefined && count > 0 && (
          <span className="text-[11px] tabular-nums text-muted-foreground/70">{count}</span>
        )}
      </div>
      <div>{children}</div>
    </div>
  )
}
