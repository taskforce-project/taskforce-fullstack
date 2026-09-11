"use client"

import { Badge } from "@/components/ui/badge"

// ─────────────────────────────────────────────────────────────────────────────
// Helper partagé du "pourquoi" d'une reco Smart Assign.
//
// Le gros panneau de scores (barres Semantic/Workload/Available) a été retiré : la reco
// individuelle vit désormais DANS le menu Assignee (cf. `assignee-menu.tsx`, Linear-like).
// Seul reste ici le rendu "Matches + phrase", encore utilisé par le dialog de création
// d'issue (aperçu de suggestion a la création).
// ─────────────────────────────────────────────────────────────────────────────

/** « Pourquoi » : compétences qui matchent + explication en langage naturel. */
export function MatchReasoning({
  matchedSkills,
  reason,
}: Readonly<{ matchedSkills?: string[]; reason?: string | null }>) {
  const skills = matchedSkills ?? []
  if (skills.length === 0 && !reason) return null
  return (
    <div className="flex flex-col gap-1.5 rounded-md bg-background/60 p-2">
      {skills.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground">Matches</span>
          {skills.map((s) => (
            <Badge key={s} className="h-4 px-1.5 text-[0.6875rem] bg-emerald-500/15 text-emerald-400 border-0">{s}</Badge>
          ))}
        </div>
      )}
      {reason && (
        <p className="text-xs leading-snug text-muted-foreground italic">“{reason}”</p>
      )}
    </div>
  )
}
