"use client"

import { useRouter } from "next/navigation"
import { AtSign, CircleCheck, Inbox, ShieldQuestion, type LucideIcon } from "lucide-react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { fillText } from "@/lib/delivery/result-card"
import { usePaneNavigation } from "@/lib/hooks/use-pane-navigation"
import { useNotificationStore } from "@/lib/store/notification-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { cn } from "@/lib/utils"
import type { WaitingItem } from "@/lib/window/arrival"

/** Une ligne, 32 px (« Le dessin », séance n°19). */
const ROW =
  "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-foreground transition-colors duration-150 hover:bg-muted motion-reduce:transition-none"

const ICON: Readonly<Record<WaitingItem["kind"], { icon: LucideIcon; tone: string }>> = {
  approval: { icon: ShieldQuestion, tone: "text-primary" },
  result: { icon: CircleCheck, tone: "text-primary" },
  // Une mention reste une mention (R128) : elle ne bloque aucun agent, elle reste discrète.
  mention: { icon: AtSign, tone: "text-muted-foreground" },
}

const NAME_DELAY_MS = 400

/** Une ligne : l'icône d'abord, quelques mots, le nombre de demandes à droite s'il y en a plusieurs, jamais rouge ni animé. */
function WaitingRow({ item, onOpen }: Readonly<{ item: WaitingItem; onOpen: (item: WaitingItem) => void }>) {
  const { icon: Icon, tone } = ICON[item.kind]
  return (
    <li>
      <Tooltip delayDuration={NAME_DELAY_MS}>
        <TooltipTrigger asChild>
          <button type="button" aria-label={item.name} onClick={() => onOpen(item)} className={ROW}>
            <Icon className={cn("size-4 shrink-0", tone)} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.count > 1 && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{item.count}</span>}
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-80">{item.name}</TooltipContent>
      </Tooltip>
    </li>
  )
}

/**
 * Ce qui attend la personne, une ligne par chose (R127, R129, séance n°19) : la même ligne dans l'arrivée et dans le
 * volet « Waiting for you ». Un clic ouvre son issue dans le volet ; une mention lue par ce clic quitte la liste. Dans
 * l'arrivée, au-delà de trois, `more` montre « See all » et le total.
 */
export function WaitingRows({ slug, items, more }: Readonly<{
  slug: string
  items: readonly WaitingItem[]
  more?: { total: number; onOpen: () => void }
}>) {
  const t = usePreferencesStore((s) => s.t.conversation)
  const router = useRouter()
  const markAsRead = useNotificationStore((s) => s.markAsRead)
  const { openIssue } = usePaneNavigation()

  const open = (item: WaitingItem) => {
    if (item.signalId && slug) void markAsRead(slug, item.signalId)
    if (item.issue) openIssue(item.issue)
    else if (item.href) router.push(item.href)
  }

  return (
    <ul className="flex flex-col">
      {items.map((item) => <WaitingRow key={item.id} item={item} onOpen={open} />)}
      {more && (
        <li>
          <button
            type="button"
            aria-label={fillText(t.seeAllName, { total: more.total })}
            onClick={more.onOpen}
            className={cn(ROW, "text-muted-foreground")}
          >
            <Inbox className="size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{t.seeAll}</span>
            <span className="shrink-0 text-xs tabular-nums">{more.total}</span>
          </button>
        </li>
      )}
    </ul>
  )
}
