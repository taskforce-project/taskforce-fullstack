import type { ReactNode } from "react"

/**
 * Un dossier qu'on ne montre pas (R161 M3 de #552) : un titre, ce qui s'est passé, quoi faire, et un chemin de retour. La
 * page de vérification, le lien d'un témoin et l'espace dont la personne n'est pas membre le disent de la même façon. À
 * part de la page, pour que l'espace ne charge pas le vérificateur avec lui.
 */
export function RecordUnavailable({ title, message, hint, action, back }: Readonly<{
  title: string; message: string; hint: string; action?: ReactNode; back: ReactNode
}>) {
  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-2" aria-labelledby="verification-title">
      <h2 id="verification-title" className="text-base font-semibold text-foreground">{title}</h2>
      <p role="status" className="text-sm text-foreground">{message}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
      {action}
      {back}
    </article>
  )
}
