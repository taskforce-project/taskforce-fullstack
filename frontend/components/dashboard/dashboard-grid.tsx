"use client"

import { useState } from "react"
import {
  closestCenter,
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { Plus } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import type { DashboardCard } from "@/lib/api/dashboard-card-service"
import { useDashboardCardsStore } from "@/lib/store/dashboard-cards-store"
import { CARD_REGISTRY, cardTitle, type GlobalRange } from "./card-registry"
import { DashboardCardItem } from "./dashboard-card"

/** Nombre de tuiles fantômes « + » affichées après les cartes. */
const GHOST_TILES = [0, 1, 2, 3] as const

interface SortableCardProps {
  readonly slug: string
  readonly card: DashboardCard
  readonly globalRange: GlobalRange
  readonly refreshToken: number
}

/** Une carte à la fois draggable ET droppable — le réordonnancement se fait carte sur carte. */
function SortableCard({ slug, card, globalRange, refreshToken }: SortableCardProps) {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({ id: card.id })
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: card.id })
  const size = card.config.size === "2" ? "2" : "1"

  return (
    <div
      ref={(node) => {
        setDragRef(node)
        setDropRef(node)
      }}
      className={cn("min-w-0", size === "2" && "sm:col-span-2", isOver && !isDragging && "rounded-xl ring-2 ring-primary/40")}
    >
      <DashboardCardItem
        slug={slug}
        card={card}
        globalRange={globalRange}
        refreshToken={refreshToken}
        dragAttributes={attributes}
        dragListeners={listeners}
        isDragging={isDragging}
      />
    </div>
  )
}

interface DashboardGridProps {
  readonly slug: string
  readonly cards: readonly DashboardCard[]
  readonly globalRange: GlobalRange
  readonly refreshToken: number
  readonly onAddCard: () => void
}

/**
 * Grille de cartes persistées (API dashboard-cards) : drag & drop @dnd-kit pour
 * réordonner (PUT /reorder, optimiste avec revert), + tuiles fantômes d'ajout.
 */
export function DashboardGrid({ slug, cards, globalRange, refreshToken, onAddCard }: DashboardGridProps) {
  const reorderCards = useDashboardCardsStore((s) => s.reorderCards)
  const [activeCard, setActiveCard] = useState<DashboardCard | null>(null)

  // Distance d'activation : un simple clic (menu ⋯) reste un clic, un glissé > 6px déclenche le drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const handleDragStart = (e: DragStartEvent) => {
    setActiveCard(cards.find((c) => c.id === Number(e.active.id)) ?? null)
  }

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveCard(null)
    const { active, over } = e
    if (!over || active.id === over.id) return
    const ids = cards.map((c) => c.id)
    const from = ids.indexOf(Number(active.id))
    const to = ids.indexOf(Number(over.id))
    if (from < 0 || to < 0) return
    const next = [...ids]
    next.splice(from, 1)
    next.splice(to, 0, Number(active.id))
    void reorderCards(slug, next).then((ok) => {
      if (!ok) toast.error("Couldn't reorder the cards")
    })
  }

  const activeDef = activeCard ? CARD_REGISTRY[activeCard.cardType] : undefined
  const ActiveIcon = activeDef?.icon

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveCard(null)}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <SortableCard key={card.id} slug={slug} card={card} globalRange={globalRange} refreshToken={refreshToken} />
        ))}

        {GHOST_TILES.map((i) => (
          <button
            key={`ghost-${i}`}
            type="button"
            onClick={onAddCard}
            aria-label="Add a card"
            className="flex min-h-[230px] items-center justify-center rounded-xl border border-dashed border-border text-muted-foreground/50 transition-colors hover:border-primary/40 hover:bg-muted/30 hover:text-primary"
          >
            <Plus className="size-5" />
          </button>
        ))}
      </div>

      {/* Clone compact suivi par le curseur — le placeholder estompé reste en place. */}
      <DragOverlay dropAnimation={null}>
        {activeCard ? (
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 shadow-lg">
            {ActiveIcon && <ActiveIcon className="size-4 text-muted-foreground" />}
            <span className="text-sm font-medium">{cardTitle(activeCard)}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
