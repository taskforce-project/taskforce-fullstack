"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowUpRight, Info, TrendingUp, TrendingDown } from "lucide-react"

import { Card } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/**
 * Carte d'insight façon Cloudflare (QA2-13) : titre + sous-titre (intro de la valeur)
 * + valeur + unité + bouton d'indication (info en tooltip OU lien « aller plus loin »)
 * + mini-visuel optionnel (`children`). À alimenter avec des **données réelles** (pas de mock).
 */

export interface InsightCardProps {
  readonly title: string
  readonly subtitle?: string
  readonly value: React.ReactNode
  readonly unit?: string
  readonly delta?: { readonly value: number; readonly positive?: boolean }
  /** Texte d'aide affiché en tooltip (bouton ⓘ). */
  readonly info?: string
  /** Lien « aller plus loin » (flèche en haut à droite) si pas d'`info`. */
  readonly href?: string
  readonly hrefLabel?: string
  /** Mini-visuel (barre de progression, mini-graph…). */
  readonly children?: React.ReactNode
  readonly className?: string
}

export function InsightCard({
  title,
  subtitle,
  value,
  unit,
  delta,
  info,
  href,
  hrefLabel,
  children,
  className,
}: InsightCardProps) {
  return (
    <Card className={cn("flex flex-col gap-3 p-4 transition-colors hover:border-foreground/15", className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
          {subtitle && <p className="truncate text-xs text-muted-foreground/70">{subtitle}</p>}
        </div>
        {info ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Plus d'informations"
                className="shrink-0 text-muted-foreground/50 transition-colors hover:text-foreground"
              >
                <Info className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-[220px] text-xs">{info}</TooltipContent>
          </Tooltip>
        ) : href ? (
          <Link
            href={href}
            aria-label={hrefLabel ?? "Voir le détail"}
            className="shrink-0 text-muted-foreground/50 transition-colors hover:text-foreground"
          >
            <ArrowUpRight className="size-4" />
          </Link>
        ) : null}
      </div>

      <div className="flex items-end gap-2">
        <span className="text-3xl font-semibold leading-none tracking-tight tabular-nums">{value}</span>
        {unit && <span className="pb-0.5 text-xs text-muted-foreground">{unit}</span>}
        {delta && (
          <span
            className={cn(
              "ml-auto flex items-center gap-0.5 pb-0.5 text-xs font-medium tabular-nums",
              delta.positive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
            )}
          >
            {delta.positive ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
            {delta.positive ? "+" : ""}{delta.value}%
          </span>
        )}
      </div>

      {children && <div className="mt-auto pt-1">{children}</div>}
    </Card>
  )
}

/** Mini barres verticales normalisées (données réelles, ex. charge par projet). */
export function MiniBars({
  values,
  className,
}: {
  readonly values: readonly number[]
  readonly className?: string
}) {
  const max = Math.max(1, ...values)
  return (
    <div className={cn("flex h-10 items-end gap-1", className)}>
      {values.length === 0 ? (
        <div className="h-px w-full self-center bg-border" />
      ) : (
        values.map((v, i) => (
          <div
            key={i}
            className="flex-1 rounded-sm bg-primary/60"
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
