"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useParams } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import {
  Radio, AtSign, ShieldAlert, ClipboardList,
  CheckCheck, Flame, AlertTriangle, Clock, CheckCircle2,
  MessageSquare, ArrowRight, Zap, Circle,
  ArrowUpRight, X,
} from "lucide-react"

import { useTranslation } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { useNotificationStore } from "@/lib/store/notification-store"
import type { Signal, NotifType, Urgency } from "@/lib/store/notification-store"

// ─── Types ────────────────────────────────────────────────────────────────────

export type NotifTab = "all" | "mentions" | "alerts" | "assignments"

// Signal, NotifType et Urgency sont importés depuis notification-store


// ─── Config ───────────────────────────────────────────────────────────────────

const URGENCY_CONFIG: Record<Urgency, {
  bg: string; border: string; dot: string; leftBar: string; label: string
}> = {
  critical: {
    bg: "rgba(248,113,113,0.07)",
    border: "rgba(248,113,113,0.18)",
    dot: "#f87171",
    leftBar: "#f87171",
    label: "Critical",
  },
  warning: {
    bg: "rgba(251,191,36,0.07)",
    border: "rgba(251,191,36,0.18)",
    dot: "#fbbf24",
    leftBar: "#fbbf24",
    label: "Warning",
  },
  info: {
    bg: "rgba(96,165,250,0.06)",
    border: "rgba(96,165,250,0.14)",
    dot: "#60a5fa",
    leftBar: "#60a5fa",
    label: "Info",
  },
  low: {
    bg: "transparent",
    border: "var(--separator)",
    dot: "var(--label-quaternary)",
    leftBar: "transparent",
    label: "",
  },
}

const TYPE_CONFIG: Record<NotifType, { icon: React.ElementType; label: string; color: string }> = {
  overdue:       { icon: Flame,          label: "Deadline breached", color: "#f87171" },
  dueSoon:       { icon: Clock,          label: "Deadline risk",     color: "#fbbf24" },
  mention:       { icon: AtSign,         label: "Mentioned you",     color: "#a78bfa" },
  assigned:      { icon: ClipboardList,  label: "Assigned to you",   color: "#60a5fa" },
  commented:     { icon: MessageSquare,  label: "Commented",         color: "var(--label-tertiary)" },
  statusChanged: { icon: ArrowRight,     label: "Status updated",    color: "var(--label-tertiary)" },
  completed:     { icon: CheckCircle2,   label: "Completed",         color: "#34d399" },
}

const TABS: {
  key: NotifTab
  icon: React.ElementType
  label: string
  filter: (s: Signal) => boolean
}[] = [
  { key: "all",         icon: Radio,        label: "All Signals",  filter: () => true },
  { key: "alerts",      icon: ShieldAlert,  label: "Alerts",       filter: (s) => s.type === "dueSoon" || s.type === "overdue" },
  { key: "mentions",    icon: AtSign,       label: "Mentions",     filter: (s) => s.type === "mention" },
  { key: "assignments", icon: ClipboardList,label: "Assignments",  filter: (s) => s.type === "assigned" },
]

function useTabHref(): Record<NotifTab, string> {
  const params = useParams()
  const ws = params?.workspace as string | undefined
  const base = ws ? `/${ws}` : ""
  return {
    all:         `${base}/inbox`,
    mentions:    `${base}/inbox/mentions`,
    alerts:      `${base}/inbox/alerts`,
    assignments: `${base}/inbox/assignments`,
  }
}

// ─── Signal row ───────────────────────────────────────────────────────────────

function SignalRow({
  signal,
  onMarkRead,
  onAcknowledge,
  index,
}: {
  signal: Signal
  onMarkRead: (id: string) => void
  onAcknowledge: (id: string) => void
  index: number
}) {
  const router = useRouter()
  const ucfg = URGENCY_CONFIG[signal.urgency]
  const tcfg = TYPE_CONFIG[signal.type]
  const TypeIcon = tcfg.icon

  function handleClick() {
    onMarkRead(signal.id)
    router.push(signal.issueUrl)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -8 }}
      transition={{ duration: 0.16, delay: index * 0.03 }}
      className="group relative flex items-start gap-0 transition-colors"
      style={{
        background: signal.read ? "transparent" : ucfg.bg,
        borderBottom: "1px solid var(--separator)",
      }}
      onMouseEnter={(e) => {
        if (signal.read) (e.currentTarget as HTMLElement).style.background = "var(--fill-tertiary)"
      }}
      onMouseLeave={(e) => {
        if (signal.read) (e.currentTarget as HTMLElement).style.background = "transparent"
        else (e.currentTarget as HTMLElement).style.background = ucfg.bg
      }}
    >
      {/* Urgency left bar */}
      <div
        className="w-0.5 self-stretch shrink-0 rounded-r-full"
        style={{ background: signal.read ? "transparent" : ucfg.leftBar }}
      />

      <button
        type="button"
        onClick={handleClick}
        className="flex-1 flex items-start gap-3 px-4 py-3 text-left"
      >
        {/* Unread dot */}
        <div className="mt-2 w-2 h-2 shrink-0 flex items-center justify-center">
          {!signal.read && (
            <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: ucfg.dot }} />
          )}
        </div>

        {/* Avatar or icon */}
        <div className="shrink-0 mt-0.5">
          {signal.actor ? (
            <Avatar className="h-7 w-7">
              <AvatarFallback
                className="text-[9px] font-semibold"
                style={{ background: `${signal.actor.color}22`, color: signal.actor.color }}
              >
                {signal.actor.initials}
              </AvatarFallback>
            </Avatar>
          ) : (
            <div
              className="h-7 w-7 rounded-full flex items-center justify-center"
              style={{ background: `${tcfg.color}18` }}
            >
              <TypeIcon className="size-3.5" style={{ color: tcfg.color }} />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            {/* Type label */}
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: tcfg.color }}>
              {tcfg.label}
            </span>
            {/* Operation */}
            <span
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{
                background: "var(--fill-secondary)",
                color: "var(--label-tertiary)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {signal.operation}
            </span>
            <span className="text-[10px]" style={{ color: "var(--label-quaternary)" }}>
              {signal.issueId}
            </span>
          </div>

          <p
            className="text-sm font-medium leading-snug mb-1 truncate"
            style={{ color: signal.read ? "var(--label-secondary)" : "var(--label-primary)" }}
          >
            {signal.title}
          </p>

          {signal.body && (
            <p className="text-xs line-clamp-1 italic mb-1.5" style={{ color: "var(--label-tertiary)" }}>
              &ldquo;{signal.body}&rdquo;
            </p>
          )}

          <span className="text-[10px]" style={{ color: "var(--label-quaternary)" }}>
            {signal.timestamp}
          </span>
        </div>
      </button>

      {/* Actions */}
      <div className="flex items-center gap-1 pr-3 pt-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        {!signal.acknowledged && (
          <button
            onClick={(e) => { e.stopPropagation(); onAcknowledge(signal.id) }}
            className="flex items-center gap-1 h-6 px-2 rounded text-[10px] font-medium transition-colors"
            style={{
              background: "var(--fill-secondary)",
              color: "var(--label-tertiary)",
            }}
            title="Acknowledge"
          >
            <CheckCheck className="size-3" />
            Ack
          </button>
        )}
        <Link
          href={signal.issueUrl}
          onClick={(e) => { e.stopPropagation(); onMarkRead(signal.id) }}
          className="h-6 w-6 flex items-center justify-center rounded transition-colors"
          style={{ background: "var(--fill-secondary)", color: "var(--label-tertiary)" }}
          title="Open"
        >
          <ArrowUpRight className="size-3" />
        </Link>
      </div>
    </motion.div>
  )
}

// ─── Summary strip ────────────────────────────────────────────────────────────

function SummaryStrip({ signals }: { signals: Signal[] }) {
  const critical  = signals.filter((s) => s.urgency === "critical" && !s.acknowledged).length
  const warnings  = signals.filter((s) => s.urgency === "warning"  && !s.acknowledged).length
  const unread    = signals.filter((s) => !s.read).length

  if (critical === 0 && warnings === 0 && unread === 0) return null

  return (
    <div
      className="flex items-center gap-4 px-4 py-2.5 text-[11px]"
      style={{ background: "var(--fill-tertiary)", borderBottom: "1px solid var(--separator)" }}
    >
      {critical > 0 && (
        <span className="flex items-center gap-1.5 font-semibold" style={{ color: "#f87171" }}>
          <Flame className="size-3" />
          {critical} critical
        </span>
      )}
      {warnings > 0 && (
        <span className="flex items-center gap-1.5 font-semibold" style={{ color: "#fbbf24" }}>
          <AlertTriangle className="size-3" />
          {warnings} warnings
        </span>
      )}
      {unread > 0 && (
        <span className="flex items-center gap-1.5" style={{ color: "var(--label-tertiary)" }}>
          <Circle className="size-2.5 fill-current" />
          {unread} unread
        </span>
      )}
      <span className="ml-auto" style={{ color: "var(--label-quaternary)" }}>
        Live · updated just now
      </span>
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ tab }: { tab: NotifTab }) {
  const messages: Record<NotifTab, { title: string; sub: string }> = {
    all:         { title: "All clear", sub: "No signals in your feed." },
    alerts:      { title: "No active alerts", sub: "Operations are running smoothly." },
    mentions:    { title: "No mentions", sub: "Nobody has mentioned you yet." },
    assignments: { title: "Nothing assigned", sub: "You have no open assignments." },
  }
  const { title, sub } = messages[tab]

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div
        className="h-12 w-12 rounded-xl flex items-center justify-center mb-4"
        style={{ background: "var(--fill-secondary)" }}
      >
        <CheckCircle2 className="size-5" style={{ color: "#34d399" }} />
      </div>
      <p className="text-sm font-semibold mb-1" style={{ color: "var(--label-primary)" }}>{title}</p>
      <p className="text-xs" style={{ color: "var(--label-tertiary)" }}>{sub}</p>
    </div>
  )
}

// ─── InboxView ────────────────────────────────────────────────────────────────

interface InboxViewProps {
  defaultTab?: NotifTab
}

export function InboxView({ defaultTab = "all" }: Readonly<InboxViewProps>) {
  const { t } = useTranslation()
  const TAB_HREF = useTabHref()
  const params = useParams()
  const slug = params?.workspace as string | undefined

  const { signals, fetchNotifications, markAsRead, markAllAsRead, acknowledgeAll, acknowledgeLocal } =
    useNotificationStore()

  const [activeTab, setActiveTab] = useState<NotifTab>(defaultTab)

  useEffect(() => {
    if (slug) fetchNotifications(slug)
  }, [slug, fetchNotifications])

  const tabCfg = TABS.find((t) => t.key === activeTab)!
  const filtered = signals.filter(tabCfg.filter)
  const unreadCount = signals.filter((s) => !s.read).length

  function markRead(id: string) {
    if (slug) markAsRead(slug, id)
  }

  function acknowledge(id: string) {
    acknowledgeLocal(id)
  }

  function markAllRead() {
    if (slug) markAllAsRead(slug)
  }

  function clearAcknowledged() {
    if (slug) acknowledgeAll(slug)
  }

  const acknowledgedCount = signals.filter((s) => s.acknowledged).length

  return (
    <div className="flex flex-col gap-0 max-w-3xl mx-auto w-full">

      {/* ── Page header ── */}
      <div className="flex items-start justify-between mb-5 gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--label-primary)" }}>
            Signal Center
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--label-tertiary)" }}>
            Operational alerts, mentions, and assignments — sorted by urgency
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {acknowledgedCount > 0 && (
            <button
              onClick={clearAcknowledged}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs transition-colors"
              style={{ background: "var(--fill-secondary)", color: "var(--label-tertiary)" }}
            >
              <X className="size-3" />
              Clear {acknowledgedCount} acked
            </button>
          )}
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllRead} className="gap-1.5 h-8 text-xs">
              <CheckCheck className="size-3.5" />
              Mark all read
            </Button>
          )}
        </div>
      </div>

      {/* ── Signal card ── */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: "var(--card)",
          border: "1px solid var(--separator)",
          boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset, var(--shadow)",
          backdropFilter: "blur(16px) saturate(180%)",
          WebkitBackdropFilter: "blur(16px) saturate(180%)",
        }}
      >
        {/* Tab bar */}
        <div
          className="flex items-center overflow-x-auto"
          style={{ borderBottom: "1px solid var(--separator)", background: "var(--fill-tertiary)" }}
        >
          {TABS.map(({ key, icon: Icon, label }) => {
            const tabSignals = signals.filter(TABS.find((t) => t.key === key)!.filter)
            const tabUnread  = tabSignals.filter((s) => !s.read).length
            const tabCritical = tabSignals.filter((s) => s.urgency === "critical" && !s.acknowledged).length
            const isActive   = activeTab === key

            return (
              <Link
                key={key}
                href={TAB_HREF[key]}
                onClick={() => setActiveTab(key)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 text-xs font-medium transition-all border-b-2 -mb-px whitespace-nowrap"
                )}
                style={{
                  borderBottomColor: isActive ? "var(--label-primary)" : "transparent",
                  color: isActive ? "var(--label-primary)" : "var(--label-tertiary)",
                }}
              >
                <Icon className="size-3.5" />
                {label}
                {tabCritical > 0 && (
                  <span
                    className="h-4 min-w-4 px-1 rounded text-[9px] font-bold flex items-center justify-center"
                    style={{ background: "rgba(248,113,113,0.15)", color: "#f87171" }}
                  >
                    {tabCritical}
                  </span>
                )}
                {tabCritical === 0 && tabUnread > 0 && (
                  <span
                    className="h-4 min-w-4 px-1 rounded text-[9px] font-bold flex items-center justify-center"
                    style={{ background: "var(--fill-primary)", color: "var(--label-secondary)" }}
                  >
                    {tabUnread}
                  </span>
                )}
              </Link>
            )
          })}
        </div>

        {/* Summary strip */}
        <SummaryStrip signals={filtered} />

        {/* Signal list */}
        <div>
          {filtered.length === 0 ? (
            <EmptyState tab={activeTab} />
          ) : (
            <AnimatePresence mode="popLayout" initial={false}>
              {filtered.map((signal, i) => (
                <SignalRow
                  key={signal.id}
                  signal={signal}
                  onMarkRead={markRead}
                  onAcknowledge={acknowledge}
                  index={i}
                />
              ))}
            </AnimatePresence>
          )}
        </div>

        {/* Footer — AI summary */}
        {filtered.length > 0 && (
          <div
            className="flex items-center gap-2 px-4 py-2.5"
            style={{ borderTop: "1px solid var(--separator)", background: "var(--fill-tertiary)" }}
          >
            <Zap className="size-3 shrink-0" style={{ color: "#a78bfa" }} />
            <span className="text-[10px]" style={{ color: "var(--label-quaternary)" }}>
              AI triage active · signals ranked by operational impact
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
