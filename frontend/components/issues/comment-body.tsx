"use client"

import { Markdown } from "@/components/ui/lightweight-markdown"

/**
 * Le texte d'un commentaire, dans le fil d'activité d'une issue : rendu en Markdown, comme la description et les mots de
 * l'agent sur la carte de résultat (#471). Cortex et les agents écrivent des titres, du gras et des listes ; le CEO
 * voyait « ## Résumé de l'issue OPS-35 » et « **Titre** » tels quels (05/11/2026). Le même rendu pour chaque commentaire,
 * écrit à la main ou par un agent : il ne lit jamais de HTML, le texte reste du texte, et il écarte les liens et images
 * aux adresses dangereuses (`javascript:`). Une ligne écrite à la main reste une ligne. Les titres gardent la taille du
 * texte, comme sur la carte de résultat.
 */
export function CommentBody({ content }: Readonly<{ content: string }>) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-foreground">
      <Markdown content={content} compact className="space-y-2 break-words text-sm leading-relaxed" />
    </div>
  )
}
