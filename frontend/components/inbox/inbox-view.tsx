"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Bell, AtSign, AlertTriangle, ClipboardList, CheckCheck,
  Circle, FolderKanban, Clock, CheckCircle2, MessageSquare, ArrowRight,
} from "lucide-react"

import { useTranslation } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type NotifType = "mention" | "assigned" | "commented" | "statusChanged" | "dueSoon" | "overdue" | "completed"
export type NotifTab = "all" | "mentions" | "alerts" | "assignments"

interface Notification {
  id: string
  type: NotifType
  read: boolean
  actor?: { name: string; initials: string; color: string }
  project: string
  projectUrl: string
  issueTitle: string
  issueId: string
  issueUrl: string
  timestamp: string
  comment?: string
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_NOTIFICATIONS: Notification[] = [
  { id: "1", type: "mention", read: false, actor: { name: "Sophie Martin", initials: "SM", color: "bg-violet-500" }, project: "Website Redesign", projectUrl: "/projects/1", issueTitle: "Update hero section copy", issueId: "TF-41", issueUrl: "/projects/1/issues/41", timestamp: "2 min ago", comment: "Hey @you can you take a look at the design specs for this one?" },
  { id: "2", type: "assigned", read: false, actor: { name: "Lucas Dufour", initials: "LD", color: "bg-blue-500" }, project: "Mobile App", projectUrl: "/projects/2", issueTitle: "Fix login screen crash on iOS 17", issueId: "TF-43", issueUrl: "/projects/2/issues/43", timestamp: "15 min ago" },
  { id: "3", type: "overdue", read: false, project: "API v2", projectUrl: "/projects/3", issueTitle: "Migrate authentication endpoints", issueId: "TF-38", issueUrl: "/projects/3/issues/38", timestamp: "1 hour ago" },
  { id: "4", type: "commented", read: true, actor: { name: "Emma Petit", initials: "EP", color: "bg-emerald-500" }, project: "Website Redesign", projectUrl: "/projects/1", issueTitle: "Implement dark mode toggle", issueId: "TF-29", issueUrl: "/projects/1/issues/29", timestamp: "3 hours ago", comment: "LGTM! Merging this tomorrow if no other comments." },
  { id: "5", type: "dueSoon", read: true, project: "Mobile App", projectUrl: "/projects/2", issueTitle: "Sprint review preparation", issueId: "TF-51", issueUrl: "/projects/2/issues/51", timestamp: "5 hours ago" },
  { id: "6", type: "mention", read: true, actor: { name: "Thomas Bernard", initials: "TB", color: "bg-orange-500" }, project: "API v2", projectUrl: "/projects/3", issueTitle: "Rate limiting strategy", issueId: "TF-22", issueUrl: "/projects/3/issues/22", timestamp: "Yesterday", comment: "Ping @you — what do you think about using sliding window?" },
  { id: "7", type: "statusChanged", read: true, actor: { name: "Sophie Martin", initials: "SM", color: "bg-violet-500" }, project: "Website Redesign", projectUrl: "/projects/1", issueTitle: "SEO audit & fixes", issueId: "TF-17", issueUrl: "/projects/1/issues/17", timestamp: "Yesterday" },
  { id: "8", type: "completed", read: true, actor: { name: "Lucas Dufour", initials: "LD", color: "bg-blue-500" }, project: "Mobile App", projectUrl: "/projects/2", issueTitle: "Onboarding flow redesign", issueId: "TF-12", issueUrl: "/projects/2/issues/12", timestamp: "2 days ago" },
  { id: "9", type: "assigned", read: true, actor: { name: "Emma Petit", initials: "EP", color: "bg-emerald-500" }, project: "API v2", projectUrl: "/projects/3", issueTitle: "Write OpenAPI spec for /users endpoints", issueId: "TF-55", issueUrl: "/projects/3/issues/55", timestamp: "2 days ago" },
]

const TABS: { key: NotifTab; icon: React.ElementType; filter: (n: Notification) => boolean }[] = [
  { key: "all", icon: Bell, filter: () => true },
  { key: "mentions", icon: AtSign, filter: (n) => n.type === "mention" },
  { key: "alerts", icon: AlertTriangle, filter: (n) => n.type === "dueSoon" || n.type === "overdue" },
  { key: "assignments", icon: ClipboardList, filter: (n) => n.type === "assigned" },
]

const TAB_HREF: Record<NotifTab, string> = {
  all: "/inbox",
  mentions: "/inbox/mentions",
  alerts: "/inbox/alerts",
  assignments: "/inbox/assignments",
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTypeIcon(type: NotifType) {
  switch (type) {
    case "mention": return <AtSign className="h-3.5 w-3.5 text-violet-400" />
    case "assigned": return <ClipboardList className="h-3.5 w-3.5 text-blue-400" />
    case "commented": return <MessageSquare className="h-3.5 w-3.5 text-slate-400" />
    case "statusChanged": return <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
    case "dueSoon": return <Clock className="h-3.5 w-3.5 text-yellow-400" />
    case "overdue": return <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
    case "completed": return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
  }
}

function getTypeLabel(type: NotifType, t: (key: string) => string): string {
  const map: Record<NotifType, string> = {
    mention: t("inbox.types.mention"),
    assigned: t("inbox.types.assigned"),
    commented: t("inbox.types.commented"),
    statusChanged: t("inbox.types.statusChanged"),
    dueSoon: t("inbox.types.dueSoon"),
    overdue: t("inbox.types.overdue"),
    completed: t("inbox.types.completed"),
  }
  return map[type]
}

// ---------------------------------------------------------------------------
// NotificationItem
// ---------------------------------------------------------------------------

function NotificationItem({ notif, onMarkRead, t }: { notif: Notification; onMarkRead: (id: string) => void; t: (key: string) => string }) {
  const router = useRouter()

  function handleRowClick() {
    onMarkRead(notif.id)
    router.push(notif.issueUrl)
  }

  return (
    <div
      onClick={handleRowClick}
      className={cn("group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/40 border-b border-border/50 last:border-0 cursor-pointer", !notif.read && "bg-primary/5")}>
      <div className="mt-1.5 flex-shrink-0 w-4 flex items-center justify-center">
        {!notif.read && <Circle className="h-2 w-2 fill-primary text-primary" />}
      </div>
      <div className="flex-shrink-0 mt-0.5">
        {notif.actor ? (
          <Avatar className="h-8 w-8"><AvatarFallback className={cn("text-xs text-white", notif.actor.color)}>{notif.actor.initials}</AvatarFallback></Avatar>
        ) : (
          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">{getTypeIcon(notif.type)}</div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {notif.actor && <span className="text-sm font-medium text-foreground">{notif.actor.name}</span>}
          <span className="text-sm text-muted-foreground">{getTypeLabel(notif.type, t)}</span>
          <Link href={notif.issueUrl} onClick={(e) => e.stopPropagation()} className="text-sm font-medium text-foreground hover:text-primary truncate max-w-[200px] sm:max-w-xs">{notif.issueTitle}</Link>
        </div>
        {notif.comment && <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1 italic">&ldquo;{notif.comment}&rdquo;</p>}
        <div className="mt-1 flex items-center gap-2">
          <Link href={notif.projectUrl} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><FolderKanban className="h-3 w-3" />{notif.project}</Link>
          <span className="text-xs text-muted-foreground/60">·</span>
          <span className="text-xs text-muted-foreground">{notif.issueId}</span>
          <span className="text-xs text-muted-foreground/60">·</span>
          <span className="text-xs text-muted-foreground">{notif.timestamp}</span>
        </div>
      </div>
      {!notif.read && (
        <button onClick={(e) => { e.stopPropagation(); onMarkRead(notif.id) }} title={t("inbox.markRead")} className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
          <CheckCheck className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// InboxView — reusable across sub-routes
// ---------------------------------------------------------------------------

interface InboxViewProps {
  defaultTab?: NotifTab
}

export function InboxView({ defaultTab = "all" }: InboxViewProps) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<NotifTab>(defaultTab)
  const [notifications, setNotifications] = useState<Notification[]>(MOCK_NOTIFICATIONS)

  const tabConfig = TABS.find((tab) => tab.key === activeTab)!
  const filtered = notifications.filter(tabConfig.filter)
  const unreadCount = notifications.filter((n) => !n.read).length

  function markRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
  }

  function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  return (
    <div className="flex flex-col gap-0 max-w-4xl mx-auto w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("inbox.title")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("inbox.subtitle")}</p>
        </div>
        {unreadCount > 0 && (
          <Button variant="ghost" size="sm" onClick={markAllRead} className="gap-2">
            <CheckCheck className="h-4 w-4" />{t("inbox.markAllRead")}
          </Button>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden [box-shadow:var(--shadow-sm)]">
        <div className="flex items-center border-b border-border bg-muted/30 overflow-x-auto">
          {TABS.map(({ key, icon: Icon }) => {
            const tabNotifs = notifications.filter(TABS.find((tb) => tb.key === key)!.filter)
            const tabUnread = tabNotifs.filter((n) => !n.read).length
            const isActive = activeTab === key
            return (
              <Link
                key={key}
                href={TAB_HREF[key]}
                onClick={() => setActiveTab(key)}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all border-b-2 -mb-px whitespace-nowrap",
                  isActive ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                )}
              >
                <Icon className="h-4 w-4" />
                {t(`inbox.tabs.${key}`)}
                {tabUnread > 0 && (
                  <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-xs bg-primary/15 text-primary border-0">{tabUnread}</Badge>
                )}
              </Link>
            )
          })}
        </div>

        <div>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mb-4">
                <Bell className="h-6 w-6 text-muted-foreground/50" />
              </div>
              <p className="text-base font-medium text-foreground">{t(`inbox.empty.${activeTab}`)}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("inbox.empty.description")}</p>
            </div>
          ) : (
            filtered.map((notif) => (
              <NotificationItem key={notif.id} notif={notif} onMarkRead={markRead} t={t} />
            ))
          )}
        </div>
      </div>
    </div>
  )
}
