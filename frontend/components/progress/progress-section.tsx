"use client"

import type { ReactNode } from "react"

import { Named } from "@/components/progress/named"

/**
 * Une partie d'un onglet du volet « Progress » (R129, R130) : son titre, un mot ou deux, ce qu'elle mesure au survol, son
 * geste à droite, puis son contenu. Des séparateurs d'un pixel plutôt que des cadres, jamais une carte dans une carte (R124).
 */
export function ProgressSection({ title, hint, actions, children }: Readonly<{
  title: string
  /** Ce qu'elle mesure : au survol du titre, plus au premier regard (R129). */
  hint?: string
  /** Ce qu'on fait depuis la partie (rejouer), à droite du titre. */
  actions?: ReactNode
  children: ReactNode
}>) {
  const heading = <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
  return (
    <section aria-label={title} className="flex flex-col gap-2 border-t border-border pt-4 first:border-t-0 first:pt-0">
      <div className="flex min-h-7 flex-wrap items-center justify-between gap-2">
        {hint ? <Named name={hint} wide>{heading}</Named> : heading}
        {actions}
      </div>
      {children}
    </section>
  )
}
