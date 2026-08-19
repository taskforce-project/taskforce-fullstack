"use client"

import type { ReactNode } from "react"
import { Clock, GripVertical, MoreHorizontal, RefreshCw, Scaling, Trash2 } from "lucide-react"
import type { DraggableAttributes, DraggableSyntheticListeners } from "@dnd-kit/core"

import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { DashboardCardSize } from "@/lib/api/dashboard-card-service"
import type { CardTimeRangeOption } from "./card-registry"

interface CardShellProps {
  readonly title: string
  readonly icon?: ReactNode
  readonly size: DashboardCardSize
  /** Options de période de la carte — sous-menu absent si non fourni. */
  readonly timeRanges?: readonly CardTimeRangeOption[]
  readonly activeRange?: string
  readonly onRefresh: () => void
  readonly onChangeRange: (value: string) => void
  readonly onChangeSize: (size: DashboardCardSize) => void
  readonly onRemove: () => void
  /** Poignée de drag (dnd-kit) — l'en-tête entier devient saisissable. */
  readonly dragAttributes?: DraggableAttributes
  readonly dragListeners?: DraggableSyntheticListeners
  readonly isDragging?: boolean
  readonly children: ReactNode
}

/**
 * Coquille commune des cartes du dashboard : en-tête façon Cloudflare (gris subtil)
 * avec titre + menu « ⋯ » (actualiser / période / taille / retirer), corps flexible.
 */
export function CardShell({
  title,
  icon,
  size,
  timeRanges,
  activeRange,
  onRefresh,
  onChangeRange,
  onChangeSize,
  onRemove,
  dragAttributes,
  dragListeners,
  isDragging = false,
  children,
}: CardShellProps) {
  return (
    <Card className={cn("flex h-full min-h-[230px] flex-col gap-0 overflow-hidden py-0 transition-opacity", isDragging && "opacity-40")}>
      {/*
        Les deux moitiés du glisser-déposer sont SÉPARÉES (correctif a11y du 22/07).

        Avant, `dragAttributes` et `dragListeners` étaient posés ensemble sur cette barre. Or
        `dragAttributes` de dnd-kit contient `role="button"` et `tabindex="0"` : la barre devenait un
        contrôle interactif contenant lui-même le bouton de menu — c'est la violation
        `nested-interactive` d'axe-core (5 occurrences, une par carte), un cas où un lecteur d'écran
        ne sait plus quoi annoncer.

        Désormais : les `listeners` (pointeur) restent sur la barre — on peut toujours saisir la
        carte n'importe où sur son en-tête, l'usage à la souris est inchangé — tandis que les
        `attributes` (rôle, tabulation, description ARIA) vont sur une poignée dédiée. Les
        événements clavier de la poignée remontent jusqu'aux listeners par propagation, donc le
        glisser-déposer au clavier continue de fonctionner.
      */}
      <div
        {...(dragListeners ?? {})}
        className={cn(
          "flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-2.5",
          dragListeners && "cursor-grab active:cursor-grabbing",
        )}
      >
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-muted-foreground">
          {dragListeners && (
            <button
              type="button"
              {...(dragAttributes ?? {})}
              aria-label={`Déplacer la carte ${title}`}
              className="-ml-1 shrink-0 cursor-grab rounded text-muted-foreground/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
            >
              <GripVertical className="size-3.5" />
            </button>
          )}
          {icon}
          <span className="truncate">{title}</span>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
              aria-label="Options de la carte"
              // Ne pas démarrer un drag depuis le bouton de menu.
              onPointerDown={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem className="gap-2 text-xs" onClick={onRefresh}>
              <RefreshCw className="size-3.5" /> Refresh
            </DropdownMenuItem>

            {timeRanges && timeRanges.length > 0 && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="gap-2 text-xs">
                  <Clock className="size-3.5 text-muted-foreground" /> Période
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup value={activeRange ?? ""} onValueChange={onChangeRange}>
                    {timeRanges.map((r) => (
                      <DropdownMenuRadioItem key={r.value} value={r.value} className="text-xs">
                        {r.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}

            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="gap-2 text-xs">
                <Scaling className="size-3.5 text-muted-foreground" /> Taille
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup value={size} onValueChange={(v) => onChangeSize(v === "2" ? "2" : "1")}>
                  <DropdownMenuRadioItem value="1" className="text-xs">1× (simple)</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="2" className="text-xs">2× (double)</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 text-xs text-rose-500 focus:text-rose-500" onClick={onRemove}>
              <Trash2 className="size-3.5" /> Retirer
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="min-h-0 flex-1">{children}</div>
    </Card>
  )
}
