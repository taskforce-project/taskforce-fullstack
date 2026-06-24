"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useParams } from "next/navigation"
import {
  Radio, AtSign, ShieldAlert, ClipboardList,
  CheckCheck, Flame, AlertTriangle, Clock, CheckCircle2,
  MessageSquare, ArrowRight, Circle, ArrowUpRight, X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PageContainer } from "@/components/layout/page-shell"
import { cn } from "@/lib/utils"
import { useNotificationStore } from "@/lib/store/notification-store"
import type { Signal, Urgency } from "@/lib/store/notification-store"

// ─── Types ────────────────────────────────────────────────────────────────────

export type NotifTab = "all" | "mentions" | "alerts" | "assignments"

// ─── Presentation config (Tailwind utilities only) ───────────────────────────

const URGENCY_DOT: Record<Urgency, string> = {
  critical: "bg-rose-500",
  warning:  "bg-amber-500",
  info:     "bg-blue-500",
  low:      "bg-muted-foreground/40",
}

const URGENCY_BAR: Record<Urgency, string> = {
  critical: "bg-rose-500",
  warning:  "bg-amber-500",
  info:     "bg-blue-500",
  low:      "bg-transparent",
}

type TypeCfg = { icon: React.ElementType; label: string; color: string }

const TYPE_CONFIG: Partial<Record<string, TypeCfg>> = {
  overdue:       { icon: Flame,         label: "Deadline breached", color: "text-rose-500" },
  dueSoon:       { icon: Clock,         label: "Deadline risk",     color: "text-amber-500" },
  mention:       { icon: AtSign,        label: "Mentioned you",     color: "text-violet-500" },
  assigned:      { icon: ClipboardList, label: "Assigned to you",   color: "text-blue-500" },
  commented:     { icon: MessageSquare, label: "Commented",         color: "text-muted-foreground" },
  statusChanged: { icon: ArrowRight,    label: "Status updated",    color: "text-muted-foreground" },
  completed:     { icon: CheckCircle2,  label: "Completed",         color: "text-emerald-500" },
  overload:      { icon: AlertTriangle, label: "Overload",          color: "text-amber-500" },
}

// Fallback pour tout type non mappé → évite le crash si le backend renvoie un type inconnu.
const FALLBACK_TYPE: TypeCfg = { icon: Radio, label: "Notification", color: "text-muted-foreground" }

const TABS: { key: NotifTab; icon: React.ElementType; label: string; filter: (s: Signal) => boolean }[] = [
  { key: "all",         icon: Radio,         label: "All", filter: () => true },
  { key: "alerts",      icon: ShieldAlert,   label: "Alerts",      filter: (s) => s.type === "dueSoon" || s.type === "overdue" },
  { key: "mentions",    icon: AtSign,        label: "Mentions",    filter: (s) => s.type === "mention" },
  { key: "assignments", icon: ClipboardList, label: "Assignments", filter: (s) => s.type === "assigned" },
]

// ─── Signal row ───────────────────────────────────────────────────────────────

function SignalRow({
  signal,
  onMarkRead,
  onAcknowledge,
}: {
  readonly signal: Signal
  readonly onMarkRead: (id: string) => void
  readonly onAcknowledge: (id: string) => void
}) {
  const router = useRouter()
  const tcfg = TYPE_CONFIG[signal.type] ?? FALLBACK_TYPE
  const TypeIcon = tcfg.icon

  function handleClick() {
    onMarkRead(signal.id)
    if (signal.issueUrl) router.push(signal.issueUrl)
  }

  return (
    <div className={cn(
      "group relative flex items-stretch border-b border-border transition-colors last:border-0",
      signal.read ? "hover:bg-muted/50" : "bg-muted/30"
    )}>
      <span className={cn("w-0.5 shrink-0 rounded-r-full", signal.read ? "bg-transparent" : URGENCY_BAR[signal.urgency])} />

      <button type="button" onClick={handleClick} className="flex flex-1 items-center gap-3 px-4 py-3 text-left min-w-0">
        {/* Unread dot */}
        <div className="flex size-2 shrink-0 items-center justify-center">
          {!signal.read && <span className={cn("block size-1.5 rounded-full", URGENCY_DOT[signal.urgency])} />}
        </div>

        {/* Avatar or type icon */}
        <div className="shrink-0">
          {signal.actor ? (
            <Avatar className="size-7">
              <AvatarFallback className="text-[9px] font-semibold">{signal.actor.initials}</AvatarFallback>
            </Avatar>
          ) : (
            <div className="flex size-7 items-center justify-center rounded-full bg-muted">
              <TypeIcon className={cn("size-3.5", tcfg.color)} />
            </div>
          )}
        </div>

        {/* Type label (colonne fixe) */}
        <span className={cn("hidden shrink-0 w-32 text-[10px] font-semibold uppercase tracking-wider sm:inline", tcfg.color)}>
          {tcfg.label}
        </span>

        {/* Titre + extrait (flexible, occupe l'espace central) */}
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className={cn("shrink-0 max-w-[55%] truncate text-sm font-medium leading-snug", signal.read ? "text-muted-foreground" : "text-foreground")}>
            {signal.title}
          </span>
          {signal.body && (
            <span className="hidden truncate text-xs italic text-muted-foreground md:inline">&ldquo;{signal.body}&rdquo;</span>
          )}
        </div>

        {/* Méta alignée à droite (projet · issue · heure) */}
        <div className="ml-auto flex shrink-0 items-center gap-3 pl-2">
          <Badge variant="secondary" className="hidden h-4 px-1.5 font-mono text-[10px] font-normal sm:inline-flex">{signal.operation}</Badge>
          <span className="hidden w-14 text-right font-mono text-[10px] text-muted-foreground lg:inline">{signal.issueId}</span>
          <span className="w-16 text-right text-[10px] text-muted-foreground">{signal.timestamp}</span>
        </div>
      </button>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1 pr-3 opacity-0 transition-opacity group-hover:opacity-100">
        {!signal.acknowledged && (
          <Button
            variant="secondary"
            size="sm"
            className="h-6 gap-1 px-2 text-[10px]"
            onClick={(e) => { e.stopPropagation(); onAcknowledge(signal.id) }}
            title="Acknowledge"
          >
            <CheckCheck className="size-3" /> Ack
          </Button>
        )}
        {signal.issueUrl && (
          <Button asChild variant="secondary" size="icon-sm" className="size-6">
            <Link href={signal.issueUrl} onClick={(e) => { e.stopPropagation(); onMarkRead(signal.id) }} title="Open">
              <ArrowUpRight className="size-3" />
            </Link>
          </Button>
        )}
      </div>
    </div>
  )
}

// ─── Summary strip ────────────────────────────────────────────────────────────

function SummaryStrip({ signals }: { readonly signals: Signal[] }) {
  const critical = signals.filter((s) => s.urgency === "critical" && !s.acknowledged).length
  const warnings = signals.filter((s) => s.urgency === "warning" && !s.acknowledged).length
  const unread = signals.filter((s) => !s.read).length

  if (critical === 0 && warnings === 0 && unread === 0) return null

  return (
    <div className="flex items-center gap-4 border-b border-border bg-muted/40 px-4 py-2.5 text-xs">
      {critical > 0 && <span className="flex items-center gap-1.5 font-semibold text-rose-500"><Flame className="size-3" /> {critical} critical</span>}
      {warnings > 0 && <span className="flex items-center gap-1.5 font-semibold text-amber-500"><AlertTriangle className="size-3" /> {warnings} warnings</span>}
      {unread > 0 && <span className="flex items-center gap-1.5 text-muted-foreground"><Circle className="size-2.5 fill-current" /> {unread} unread</span>}
      <span className="ml-auto text-muted-foreground">Live · updated just now</span>
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ tab }: { readonly tab: NotifTab }) {
  const messages: Record<NotifTab, { title: string; sub: string }> = {
    all:         { title: "All clear",        sub: "No signals in your feed." },
    alerts:      { title: "No active alerts",  sub: "Operations are running smoothly." },
    mentions:    { title: "No mentions",       sub: "Nobody has mentioned you yet." },
    assignments: { title: "Nothing assigned",  sub: "You have no open assignments." },
  }
  const { title, sub } = messages[tab]
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-xl bg-muted">
        <CheckCircle2 className="size-5 text-emerald-500" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>
    </div>
  )
}

// ─── InboxView ────────────────────────────────────────────────────────────────

interface InboxViewProps {
  readonly defaultTab?: NotifTab
}

export function InboxView({ defaultTab = "all" }: InboxViewProps) {
  const params = useParams()
  const slug = params?.workspace as string | undefined

  const { signals, fetchNotifications, markAsRead, markAllAsRead, acknowledgeAll, acknowledge: acknowledgeNotif } =
    useNotificationStore()

  const [activeTab, setActiveTab] = useState<NotifTab>(defaultTab)

  useEffect(() => {
    if (slug) fetchNotifications(slug)
  }, [slug, fetchNotifications])

  const tabCfg = TABS.find((t) => t.key === activeTab)!
  const filtered = signals.filter(tabCfg.filter)
  const unreadCount = signals.filter((s) => !s.read).length
  const acknowledgedCount = signals.filter((s) => s.acknowledged).length

  return (
    <PageContainer>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Signal Center</h1>
          <p className="text-sm text-muted-foreground">
            Operational alerts, mentions, and assignments — sorted by urgency
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {acknowledgedCount > 0 && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => slug && acknowledgeAll(slug)}>
              <X className="size-3.5" /> Clear {acknowledgedCount} acked
            </Button>
          )}
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => slug && markAllAsRead(slug)}>
              <CheckCheck className="size-3.5" /> Mark all read
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as NotifTab)}>
        <TabsList>
          {TABS.map(({ key, label, filter }) => {
            const tabSignals = signals.filter(filter)
            const tabCritical = tabSignals.filter((s) => s.urgency === "critical" && !s.acknowledged).length
            const tabUnread = tabSignals.filter((s) => !s.read).length
            return (
              <TabsTrigger key={key} value={key} className="gap-1.5">
                {label}
                {tabCritical > 0 ? (
                  <Badge variant="destructive" className="h-4 min-w-4 px-1 text-[10px] tabular-nums">{tabCritical}</Badge>
                ) : tabUnread > 0 ? (
                  <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px] tabular-nums">{tabUnread}</Badge>
                ) : null}
              </TabsTrigger>
            )
          })}
        </TabsList>
      </Tabs>

      {/* Signal list */}
      <Card className="gap-0 overflow-hidden py-0">
        <SummaryStrip signals={filtered} />
        {filtered.length === 0 ? (
          <EmptyState tab={activeTab} />
        ) : (
          filtered.map((signal) => (
            <SignalRow
              key={signal.id}
              signal={signal}
              onMarkRead={(id) => slug && markAsRead(slug, id)}
              onAcknowledge={(id) => slug && acknowledgeNotif(slug, id)}
            />
          ))
        )}
      </Card>
    </PageContainer>
  )
}
