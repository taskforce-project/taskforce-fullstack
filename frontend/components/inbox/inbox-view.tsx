"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import {
  Radio, AtSign, ShieldAlert, ClipboardList,
  CheckCheck, Flame, AlertTriangle, Clock, CheckCircle2,
  MessageSquare, ArrowRight, ArrowUpRight, RefreshCw, X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { UserAvatar } from "@/components/ui/user-avatar"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PageContainer } from "@/components/layout/page-shell"
import { DataTable, type DataTableColumn } from "@/components/ui/data-table"
import { IssueSheetLoader, parseIssueTarget, type IssueSheetTarget } from "@/components/sheets/issue-sheet-loader"
import { cn } from "@/lib/utils"
import { useNotificationStore } from "@/lib/store/notification-store"
import type { Signal, Urgency } from "@/lib/store/notification-store"

// ─── Types ────────────────────────────────────────────────────────────────────

export type NotifTab = "all" | "mentions" | "alerts" | "assignments"

// ─── Presentation config (Tailwind utilities only) ───────────────────────────

/** Ordre logique pour le tri par urgence (critique en tête). */
const URGENCY_ORDER: Record<Urgency, number> = {
  critical: 0, warning: 1, info: 2, low: 3,
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

/**
 * Un signal mène-t-il quelque part ? L'issue d'abord, sinon son projet.
 *
 * Les liens sont dénormalisés à l'écriture de la notification : une ligne peut arriver sans
 * destination (données historiques). Elle ne doit alors ni afficher le bouton « ouvrir », ni se
 * présenter comme cliquable — un clic sans effet est pire que pas de clic du tout.
 */
function hasDestination(s: Signal): boolean {
  return Boolean(s.issueUrl || s.operationUrl)
}

const TABS: { key: NotifTab; icon: React.ElementType; label: string; filter: (s: Signal) => boolean }[] = [
  { key: "all",         icon: Radio,         label: "All", filter: () => true },
  { key: "alerts",      icon: ShieldAlert,   label: "Alerts",      filter: (s) => s.type === "dueSoon" || s.type === "overdue" },
  { key: "mentions",    icon: AtSign,        label: "Mentions",    filter: (s) => s.type === "mention" },
  { key: "assignments", icon: ClipboardList, label: "Assignments", filter: (s) => s.type === "assigned" },
]

// ─── Summary strip ────────────────────────────────────────────────────────────

/**
 * Libellé relatif de la dernière synchro, re-rendu toutes les 30 s.
 * Les données arrivent en temps réel (STOMP + filet de polling 60 s côté cloche) ; ce libellé
 * accompagne le bouton Refresh pour dire QUAND remonte l'état affiché.
 */
/** Écart relatif entre deux instants — pure, donc sûre à appeler pendant le rendu. */
function formatSince(from: number, now: number): string {
  const seconds = Math.floor((now - from) / 1000)
  if (seconds < 15)   return "just now"
  if (seconds < 60)   return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`
  return `${Math.floor(seconds / 3600)}h ago`
}

function useSyncedLabel(lastSyncAt: number | null): string | null {
  // Seul `now` est en état, et il n'est mis à jour que par le minuteur (callback asynchrone).
  // Le libellé, lui, est DÉRIVÉ : le rendu reste pur (pas de `Date.now()` pendant le rendu) et
  // aucun état n'est réinitialisé dans un effet.
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (lastSyncAt === null) return
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [lastSyncAt])

  // Après un refresh, `lastSyncAt` peut devancer `now` (le minuteur n'a pas encore tiré) :
  // l'écart est alors négatif et retombe naturellement sur « just now ».
  return lastSyncAt === null ? null : formatSince(lastSyncAt, now)
}

/**
 * État de synchro + rafraîchissement manuel.
 *
 * Remplace l'ancien bandeau de compteurs (« N critical / N warnings / N unread ») : ces trois
 * chiffres étaient déjà portés par les badges des onglets, et l'indicateur « Live » n'était qu'un
 * libellé — sans aucun moyen de forcer une actualisation. Ici, le libellé qualifie une action.
 */
function SyncControl({
  lastSyncAt,
  onRefresh,
}: { readonly lastSyncAt: number | null; readonly onRefresh: () => Promise<void> }) {
  const [refreshing, setRefreshing] = useState(false)
  const synced = useSyncedLabel(lastSyncAt)

  async function handleRefresh() {
    setRefreshing(true)
    try {
      await onRefresh()
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      {synced && <span className="hidden text-xs text-muted-foreground sm:inline">Updated {synced}</span>}
      <Button
        variant="outline" size="sm" className="gap-1.5"
        onClick={() => void handleRefresh()}
        disabled={refreshing}
      >
        <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
        Refresh
      </Button>
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
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card py-16 text-center">
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
  const router = useRouter()
  const params = useParams()
  const slug = params?.workspace as string | undefined

  const { signals, lastSyncAt, fetchNotifications, markAsRead, markAllAsRead, acknowledgeAll, acknowledge: acknowledgeNotif } =
    useNotificationStore()


  const [activeTab, setActiveTab] = useState<NotifTab>(defaultTab)
  const [sheetTarget, setSheetTarget] = useState<IssueSheetTarget | null>(null)

  useEffect(() => {
    if (slug) fetchNotifications(slug)
  }, [slug, fetchNotifications])

  const tabCfg = TABS.find((t) => t.key === activeTab)!
  const filtered = signals.filter(tabCfg.filter)
  const unreadCount = signals.filter((s) => !s.read).length
  const acknowledgedCount = signals.filter((s) => s.acknowledged).length

  // Clic sur la ligne : on reste dans la liste de triage → sheet latéral, la liste reste derrière.
  // Un signal qui ne pointe pas sur une issue (ex. surcharge → fiche d'un membre) navigue normalement.
  function openSignal(s: Signal) {
    if (slug) markAsRead(slug, s.id)
    const target = parseIssueTarget(s.issueUrl)
    if (target) setSheetTarget(target)
    else if (s.issueUrl) router.push(s.issueUrl)
    else if (s.operationUrl) router.push(s.operationUrl) // repli : au moins le contexte projet
  }

  // Bouton « ↗ » : sortie explicite vers la page pleine (seul chemin qui quitte la liste).
  function openSignalFullPage(s: Signal) {
    if (slug) markAsRead(slug, s.id)
    const destination = s.issueUrl || s.operationUrl
    if (destination) router.push(destination)
  }

  // Colonnes construites dans le composant : les actions (Ack/Open) ont besoin des handlers du store.
  const columns = useMemo<DataTableColumn<Signal>[]>(() => [
    {
      key: "indicator", header: "", align: "center", className: "w-8",
      // Marqueur « non lu » uniquement, en une seule couleur : la sévérité est déjà portée par
      // l'icône de la colonne Type (même info, même couleur = redondance visuelle inutile).
      render: (s) => (
        <span className="flex items-center justify-center">
          {!s.read && <span className="block size-2 rounded-full bg-primary" aria-label="Unread" />}
        </span>
      ),
      sortValue: (s) => (s.read ? 1 : 0) * 10 + URGENCY_ORDER[s.urgency],
    },
    {
      key: "type", header: "Type", className: "hidden w-40 sm:table-cell",
      render: (s) => {
        const c = TYPE_CONFIG[s.type] ?? FALLBACK_TYPE
        const Icon = c.icon
        return (
          <span className={cn("flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider", c.color)}>
            <Icon className="size-3.5 shrink-0" /> <span className="truncate">{c.label}</span>
          </span>
        )
      },
      sortValue: (s) => s.type,
    },
    {
      key: "title", header: "Signal",
      render: (s) => (
        <span className="flex min-w-0 items-center gap-2">
          {s.actor && (
            <UserAvatar
              email={s.actor.email}
              avatarUrl={s.actor.avatarUrl}
              name={s.actor.name}
              className="size-5 shrink-0"
              fallbackClassName="text-[8px] font-semibold"
            />
          )}
          <span className={cn("truncate text-sm font-medium", s.read ? "text-muted-foreground" : "text-foreground")}>{s.title}</span>
          {s.body && <span className="hidden truncate text-xs italic text-muted-foreground md:inline">&ldquo;{s.body}&rdquo;</span>}
        </span>
      ),
      sortValue: (s) => s.title.toLowerCase(),
    },
    {
      key: "operation", header: "Op", className: "hidden w-28 sm:table-cell",
      render: (s) => <Badge variant="secondary" className="h-4 px-1.5 font-mono text-[10px] font-normal">{s.operation}</Badge>,
      sortValue: (s) => s.operation,
    },
    {
      key: "issueId", header: "Issue", className: "hidden w-20 lg:table-cell",
      render: (s) => <span className="font-mono text-[10px] text-muted-foreground">{s.issueId}</span>,
      sortValue: (s) => s.issueId,
    },
    {
      key: "timestamp", header: "When", align: "right", className: "w-20",
      render: (s) => <span className="text-[10px] text-muted-foreground">{s.timestamp}</span>,
    },
    {
      key: "actions", header: "", align: "right", className: "w-24",
      render: (s) => (
        <span className="flex items-center justify-end gap-1">
          {!s.acknowledged && (
            <Button
              variant="secondary" size="sm" className="h-6 gap-1 px-2 text-[10px]"
              onClick={(e) => { e.stopPropagation(); if (slug) acknowledgeNotif(slug, s.id) }}
              title="Acknowledge"
            >
              <CheckCheck className="size-3" /> Ack
            </Button>
          )}
          {hasDestination(s) && (
            <Button
              variant="secondary" size="icon-sm" className="size-6"
              onClick={(e) => { e.stopPropagation(); openSignalFullPage(s) }}
              title="Open full page"
            >
              <ArrowUpRight className="size-3" />
            </Button>
          )}
        </span>
      ),
    },
  // openSignal est stable pour la durée du rendu ; les deps réelles sont slug + handlers store.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [slug, acknowledgeNotif, markAsRead, router])

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
          <SyncControl
            lastSyncAt={lastSyncAt}
            onRefresh={async () => { if (slug) await fetchNotifications(slug) }}
          />
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

      {/* Signal table (DataTable : tri + pagination paramétrable) */}
      {filtered.length === 0 ? (
        <EmptyState tab={activeTab} />
      ) : (
        <div className="space-y-3">
          <DataTable
            columns={columns}
            data={filtered}
            rowKey={(s) => s.id}
            onRowClick={openSignal}
            isRowClickable={hasDestination}
          />

          {/* Sheet ouvert en place : le triage continue sans quitter la liste. */}
          {slug && (
            <IssueSheetLoader
              slug={slug}
              target={sheetTarget}
              onClose={() => setSheetTarget(null)}
            />
          )}
        </div>
      )}
    </PageContainer>
  )
}
