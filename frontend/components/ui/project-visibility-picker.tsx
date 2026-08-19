"use client"

import { Globe, Lock } from "lucide-react"

import { cn } from "@/lib/utils"

interface VisibilityLabels {
  readonly privateTitle: string
  readonly privateHint: string
  readonly publicTitle: string
  readonly publicHint: string
}

interface ProjectVisibilityPickerProps {
  /** `true` = public (tout le workspace), `false` = privé (membres invités uniquement). */
  readonly value: boolean
  readonly onChange: (isPublic: boolean) => void
  /** Libellés (défaut anglais) — passer des libellés FR sur les surfaces francophones. */
  readonly labels?: VisibilityLabels
}

const DEFAULT_LABELS: VisibilityLabels = {
  privateTitle: "Private",
  privateHint: "Only invited members can see it.",
  publicTitle: "Public",
  publicHint: "Visible to everyone in the workspace.",
}

/**
 * Sélecteur de visibilité d'un projet, façon GitHub (Privé / Public).
 * La visibilité est appliquée côté back (ProjectService) : un projet privé n'est visible
 * que par ses membres invités + les OWNER/ADMIN du workspace.
 */
export function ProjectVisibilityPicker({ value, onChange, labels = DEFAULT_LABELS }: ProjectVisibilityPickerProps) {
  const options = [
    { isPublic: false, icon: Lock, title: labels.privateTitle, hint: labels.privateHint },
    { isPublic: true, icon: Globe, title: labels.publicTitle, hint: labels.publicHint },
  ]

  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map(({ isPublic, icon: Icon, title, hint }) => {
        const active = value === isPublic
        return (
          <button
            key={title}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(isPublic)}
            className={cn(
              "flex items-start gap-2.5 rounded-md border p-2.5 text-left transition-colors",
              active
                ? "border-primary/60 bg-primary/5 ring-1 ring-primary/20"
                : "border-border hover:bg-accent",
            )}
          >
            <Icon className={cn("mt-0.5 size-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
            <div className="min-w-0">
              <p className="text-sm font-medium leading-tight">{title}</p>
              <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{hint}</p>
            </div>
          </button>
        )
      })}
    </div>
  )
}
