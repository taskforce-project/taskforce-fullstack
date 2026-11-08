"use client"

import { CircleDot, FolderKanban, Sparkles, User, type LucideIcon } from "lucide-react"

import type { PickOption } from "@/lib/cortex/composer-picker"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { cn } from "@/lib/utils"

const ICONS: Record<PickOption["group"], LucideIcon> = {
  issues: CircleDot,
  people: User,
  projects: FolderKanban,
  gestures: Sparkles,
}

const ORDER: readonly PickOption["group"][] = ["issues", "people", "projects", "gestures"]

/** L'id du DOM d'une option, que le champ nomme comme l'option active (`aria-activedescendant`). */
export const optionDomId = (listId: string, option: PickOption): string => `${listId}-${option.id.replace(/[^\w-]/g, "-")}`

/**
 * Une liste du compositeur (R123) : les issues, les personnes, les projets ou les gestes que propose ce qui est tapé,
 * rangés par groupe, au-dessus du compositeur. Le clavier d'abord : le champ garde le focus et nomme l'option active ;
 * la souris choisit aussi, sans voler le focus au champ. Un choix remplit le compositeur, il n'envoie rien.
 */
export function PickList({ id, options, active, searching, onPick, onActive, className }: Readonly<{
  id: string
  options: readonly PickOption[]
  /** L'option active au clavier, son index dans `options`. */
  active: number
  searching?: boolean
  onPick: (option: PickOption) => void
  onActive: (index: number) => void
  className?: string
}>) {
  const t = usePreferencesStore((s) => s.t.conversation)
  const groups = ORDER.filter((group) => options.some((option) => option.group === group))

  return (
    <div
      id={id}
      role="listbox"
      aria-label={t.listLabel}
      className={cn("max-h-72 overflow-y-auto rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg", className)}
    >
      {options.length === 0 && (
        <p className="px-2 py-1.5 text-[13px] text-muted-foreground">{searching ? t.searching : t.attachNone}</p>
      )}
      {groups.map((group) => {
        const Icon = ICONS[group]
        return (
          <div key={group} role="group" aria-label={t[group]}>
            <p className="px-2 pb-0.5 pt-1.5 text-xs font-medium text-muted-foreground" aria-hidden="true">{t[group]}</p>
            {options.map((option, index) => option.group !== group ? null : (
              <div
                key={option.id}
                id={optionDomId(id, option)}
                role="option"
                aria-selected={index === active}
                // Le champ garde le focus : la souris choisit sans le lui prendre.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onPick(option)}
                onMouseEnter={() => onActive(index)}
                className={cn(
                  "flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-[13px] transition-colors duration-150 motion-reduce:transition-none",
                  index === active ? "bg-muted text-foreground" : "text-foreground/90",
                )}
              >
                <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="shrink-0 font-medium">{option.label}</span>
                {option.detail && <span className="min-w-0 truncate text-muted-foreground">{option.detail}</span>}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
