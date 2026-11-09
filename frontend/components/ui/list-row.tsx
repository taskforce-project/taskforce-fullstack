"use client"

import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/** Le temps avant que le nom complet d'une ligne s'affiche (R129). */
const NAME_DELAY_MS = 400

export interface ListRowAction {
  /** En toutes lettres : « Mark as read », jamais une icône seule ni « Ack » (R133). */
  readonly label: string
  readonly run: () => void
}

/**
 * Une ligne de liste (R133, R141, « Le dessin », séance n°20) : 36 px, une icône, une phrase, la clé, le moment. Les
 * actions viennent au survol ou au clavier, en mots, par-dessus la clé et le moment : rien ne bouge. Sans survol possible
 * (un écran tactile), elles prennent leur place pour de bon. Le nom complet s'affiche au survol et pour les lecteurs
 * d'écran (R129).
 */
export function ListRow({ icon: Icon, tone, name, hint, sentence, unread, unreadLabel, code, time, onOpen, actions = [] }: Readonly<{
  icon: LucideIcon
  /** La couleur de l'icône. */
  tone?: string
  /** Ce que dit la ligne, en toutes lettres : au survol et pour les lecteurs d'écran. */
  name: string
  /** Le détail au survol, quand il y en a plus que le nom. */
  hint?: ReactNode
  sentence: string
  /** Non lue : un point, et la phrase en clair. */
  unread?: boolean
  unreadLabel?: string
  /** La clé de l'issue (« OPS-35 »). */
  code?: string | null
  time?: string | null
  /** Sans destination, la ligne ne se présente pas comme cliquable. */
  onOpen?: () => void
  actions?: readonly ListRowAction[]
}>) {
  const body = (
    <>
      {unread && (
        <span className="absolute left-0.5 top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-primary" role="img" aria-label={unreadLabel} />
      )}
      <Icon className={cn("size-4 shrink-0", tone ?? "text-muted-foreground")} aria-hidden="true" />
      <span className={cn("min-w-0 flex-1 truncate", unread ? "font-medium text-foreground" : "text-muted-foreground")}>{sentence}</span>
      {(code || time) && (
        <span className={cn("flex shrink-0 items-center gap-3 text-xs text-muted-foreground", actions.length > 0 && "[@media(hover:none)]:hidden")}>
          {code && <span className="font-mono">{code}</span>}
          {time && <span className="tabular-nums">{time}</span>}
        </span>
      )}
    </>
  )
  const row = cn(
    "flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm transition-colors duration-150 motion-reduce:transition-none",
    onOpen && "hover:bg-muted group-focus-within/row:bg-muted",
  )

  return (
    <li className="group/row relative">
      <Tooltip delayDuration={NAME_DELAY_MS}>
        <TooltipTrigger asChild>
          {onOpen ? (
            <button type="button" aria-label={name} onClick={onOpen} className={row}>{body}</button>
          ) : (
            <div role="group" aria-label={name} className={row}>{body}</div>
          )}
        </TooltipTrigger>
        <TooltipContent className="max-w-80">{hint ?? name}</TooltipContent>
      </Tooltip>
      {actions.length > 0 && (
        <div className="absolute inset-y-0 right-0 flex items-center gap-0.5 rounded-r-md bg-gradient-to-l from-muted from-90% to-transparent pl-8 pr-1 opacity-0 transition-opacity duration-150 group-hover/row:opacity-100 group-focus-within/row:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={action.run}
              className="h-7 shrink-0 rounded-md px-2 text-xs text-muted-foreground transition-colors duration-150 hover:bg-background hover:text-foreground motion-reduce:transition-none"
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </li>
  )
}
