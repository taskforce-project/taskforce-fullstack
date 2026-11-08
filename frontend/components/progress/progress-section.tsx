import type { ReactNode } from "react"

/**
 * Une partie du volet « Progress » (R125) : son titre, une ligne qui dit ce qu'elle mesure, puis son contenu. Des
 * séparateurs d'un pixel plutôt que des cadres, jamais une carte dans une carte (R124).
 */
export function ProgressSection({ title, hint, actions, children }: Readonly<{
  title: string
  hint?: string
  /** Ce qu'on fait depuis la partie (mesurer, rejouer), à droite du titre. */
  actions?: ReactNode
  children: ReactNode
}>) {
  return (
    <section aria-label={title} className="flex flex-col gap-3 border-t border-border pt-5 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}
