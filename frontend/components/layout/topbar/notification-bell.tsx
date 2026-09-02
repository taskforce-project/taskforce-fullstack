"use client"

import * as React from "react"
import Link from "next/link"
import { CheckCheck } from "lucide-react"
import { toast } from "sonner"

import { BellIcon } from "@/components/ui/icons"
import { AnimatedNavIcon } from "@/components/layout/sidebar/animated-nav-icon"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useNotificationStore, type Urgency } from "@/lib/store/notification-store"
import { useWorkspaceStore } from "@/lib/store/workspace-store"
import { useNotificationsRealtime } from "@/lib/hooks/use-notifications-realtime"
import { cn } from "@/lib/utils"

const URGENCY_DOT: Record<Urgency, string> = {
  critical: "bg-rose-500",
  warning: "bg-amber-500",
  info: "bg-blue-500",
  low: "bg-muted-foreground/40",
}

/**
 * Cloche de notifications du header (QA2-11).
 * - Badge rouge avec le compteur de non-lus.
 * - Popover avec les dernières notifications + « tout marquer lu » + lien « voir toutes ».
 */
export function NotificationBell() {
  const slug = useWorkspaceStore((s) => s.activeWorkspace?.slug)
  const signals = useNotificationStore((s) => s.signals)
  const unreadCount = useNotificationStore((s) => s.unreadCount)
  const fetchNotifications = useNotificationStore((s) => s.fetchNotifications)
  const markAllAsRead = useNotificationStore((s) => s.markAllAsRead)
  const [open, setOpen] = React.useState(false)

  // Push temps réel (US-023) : abonnement STOMP /topic/notifications.{userId}
  useNotificationsRealtime(slug)

  React.useEffect(() => {
    if (slug) fetchNotifications(slug)
  }, [slug, fetchNotifications])

  // Filet de sécurité : rafraîchit toutes les 60 s si le push STOMP est indisponible.
  React.useEffect(() => {
    if (!slug) return
    const id = setInterval(() => fetchNotifications(slug), 60_000)
    return () => clearInterval(id)
  }, [slug, fetchNotifications])

  const recent = signals.slice(0, 6)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
          <AnimatedNavIcon icon={BellIcon} />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-white tabular-nums">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={8} className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          {unreadCount > 0 && slug && (
            <button
              type="button"
              onClick={async () => {
                // Succès visible (les badges non-lus disparaissent) -> pas de toast succès, seulement l'échec.
                const ok = await markAllAsRead(slug)
                if (!ok) toast.error("Couldn't mark all as read")
              }}
              className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <CheckCheck className="size-3" /> Tout marquer lu
            </button>
          )}
        </div>

        <div className="max-h-80 overflow-y-auto">
          {recent.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">No notifications</p>
          ) : (
            recent.map((s) => {
              const inner = (
                <>
                  <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", s.read ? "bg-transparent" : URGENCY_DOT[s.urgency])} />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-sm leading-snug", s.read ? "text-muted-foreground" : "font-medium text-foreground")}>
                      {s.title}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {s.operation ? `${s.operation} · ` : ""}{s.timestamp}
                    </span>
                  </span>
                </>
              )
              const rowClass = "flex items-start gap-2 border-b border-border px-3 py-2.5 transition-colors last:border-0 hover:bg-muted/50"
              return s.issueUrl ? (
                <Link key={s.id} href={s.issueUrl} onClick={() => setOpen(false)} className={rowClass}>
                  {inner}
                </Link>
              ) : (
                <div key={s.id} className={rowClass}>
                  {inner}
                </div>
              )
            })
          )}
        </div>

        <div className="border-t border-border p-1.5">
          <Button asChild variant="ghost" size="sm" className="w-full justify-center text-xs" onClick={() => setOpen(false)}>
            <Link href={slug ? `/${slug}/inbox` : "/inbox"}>Voir toutes les notifications</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
