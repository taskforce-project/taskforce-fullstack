"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useRouter, useParams } from "next/navigation"
import {
  Radio, AtSign, ClipboardList, Flame, AlertTriangle, Clock, CheckCircle2, CircleCheck, RefreshCw,
  MessageSquare, ArrowRight, ShieldQuestion, Bot, OctagonX, Ban, type LucideIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { ListRow, type ListRowAction } from "@/components/ui/list-row"
import { Skeleton } from "@/components/ui/skeleton"
import { PageContainer } from "@/components/layout/page-shell"
import { fillText } from "@/lib/delivery/result-card"
import { useDeliveryStore } from "@/lib/store/delivery-store"
import { useNotificationStore } from "@/lib/store/notification-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { useUserStore } from "@/lib/store/user-store"
import type { Signal } from "@/lib/store/notification-store"
import { usePaneNavigation } from "@/lib/hooks/use-pane-navigation"
import { issueRefOfUrl } from "@/lib/window/address"
import { mentionItems, waitingItems, type WaitingItem } from "@/lib/window/arrival"
import {
  alertsOf, GROUP_PAGE, happenedOf, mentionsOf, signalHint, signalKind, signalSentence, waitingSentence,
} from "@/lib/window/inbox"
import { relativeTime } from "@/lib/utils/server-date"
import { issuePath } from "@/lib/window/pane"

/** Tout, ou le seul groupe d'une adresse dédiée (`/inbox/alerts`, `/inbox/mentions`). */
export type InboxShow = "all" | "alerts" | "mentions"

type IconCfg = { icon: LucideIcon; tone: string }

const SIGNAL_ICON: Partial<Record<string, IconCfg>> = {
  overdue:         { icon: Flame,         tone: "text-destructive" },
  dueSoon:         { icon: Clock,         tone: "text-ink-yellow" },
  mention:         { icon: AtSign,        tone: "text-ink-pink" },
  assigned:        { icon: ClipboardList, tone: "text-ink-blue" },
  commented:       { icon: MessageSquare, tone: "text-muted-foreground" },
  statusChanged:   { icon: ArrowRight,    tone: "text-muted-foreground" },
  completed:       { icon: CheckCircle2,  tone: "text-ink-green" },
  overload:        { icon: AlertTriangle, tone: "text-ink-yellow" },
  agentDone:       { icon: Bot,           tone: "text-ink-green" },
  agentFailed:     { icon: OctagonX,      tone: "text-destructive" },
  // Une règle a refusé la mission au départ : ce n'est pas une panne (R38).
  agentNotStarted: { icon: Ban,           tone: "text-muted-foreground" },
}

// Pour tout type non mappé : évite le crash si le backend renvoie un type inconnu.
const FALLBACK_ICON: IconCfg = { icon: Radio, tone: "text-muted-foreground" }

const WAITING_ICON: Readonly<Record<WaitingItem["kind"], IconCfg>> = {
  approval: { icon: ShieldQuestion, tone: "text-primary" },
  result:   { icon: CircleCheck,    tone: "text-primary" },
  mention:  { icon: AtSign,         tone: "text-ink-pink" },
}

/** Le chargement : des lignes de la même hauteur que la liste, rien ne saute à l'arrivée des données. */
function LoadingRows() {
  return (
    <div className="flex flex-col" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex h-9 items-center gap-2 px-2.5">
          <Skeleton className="size-4 shrink-0 rounded-full" />
          <Skeleton className="h-3.5 flex-1" />
          <Skeleton className="h-3.5 w-12" />
        </div>
      ))}
    </div>
  )
}

/** Un groupe : son nom, son nombre, ses lignes, et « Show more » au-delà de quelques dizaines. */
function Group({ title, count, showMore, children }: Readonly<{
  title: string
  count: number
  showMore?: { hidden: number; run: () => void; label: string } | null
  children: ReactNode
}>) {
  return (
    <section aria-label={title} className="flex flex-col">
      <h3 className="flex h-7 items-center gap-1.5 px-2.5 text-xs font-medium text-muted-foreground">
        {title}
        <span className="tabular-nums opacity-70">{count}</span>
      </h3>
      <ul className="flex flex-col">{children}</ul>
      {showMore && (
        <button
          type="button"
          onClick={showMore.run}
          className="h-9 rounded-md px-2.5 text-left text-xs text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground motion-reduce:transition-none"
        >
          {showMore.label}
        </button>
      )}
    </section>
  )
}

/**
 * « Waiting for you » (R121, R128, R141) : trois groupes de lignes, une phrase par ligne : ce qui attend la personne, ce
 * qui s'est passé, les alertes. Un clic ouvre l'issue dans le volet, la liste reste dessous telle qu'elle était. Les
 * gestes viennent au survol, en mots. Rien à dire tient en une ligne.
 */
export function InboxView({ show = "all" }: Readonly<{ show?: InboxShow }>) {
  const router = useRouter()
  const params = useParams()
  const slug = params?.workspace as string | undefined

  const { signals, isLoading, error, fetchNotifications, markAsRead, markAllAsRead, acknowledge } = useNotificationStore()
  const t = usePreferencesStore((s) => s.t.inbox)
  const conversation = usePreferencesStore((s) => s.t.conversation)
  const approvals = useDeliveryStore((s) => s.openApprovals)
  const runs = useDeliveryStore((s) => s.workspaceRuns)
  const me = useUserStore((s) => s.user?.id)
  const { openIssue } = usePaneNavigation()
  const [limits, setLimits] = useState<Readonly<Record<string, number>>>({})

  useEffect(() => {
    if (slug) fetchNotifications(slug)
  }, [slug, fetchNotifications])

  const waiting = useMemo(
    () => (show === "all" ? [...waitingItems(approvals, runs, me, conversation), ...mentionItems(signals, conversation)] : []),
    [show, approvals, runs, me, conversation, signals],
  )
  const happened = useMemo(() => (show === "all" ? happenedOf(signals, waiting) : []), [show, signals, waiting])
  const alerts = useMemo(() => (show === "mentions" ? [] : alertsOf(signals)), [show, signals])
  const mentions = useMemo(() => (show === "mentions" ? mentionsOf(signals) : []), [show, signals])
  const unread = signals.some((s) => !s.read && s.type !== "agentApproval")
  const nothing = waiting.length + happened.length + alerts.length + mentions.length === 0

  // L'issue s'ouvre dans le volet, par-dessus la liste, qui reste dessous telle qu'elle était. Un signal qui ne pointe pas
  // sur une issue (une surcharge mène à la fiche d'un membre) navigue normalement.
  function openSignal(s: Signal) {
    if (slug) void markAsRead(slug, s.id)
    const target = issueRefOfUrl(s.issueUrl)
    if (target) openIssue(target)
    else if (s.issueUrl) router.push(s.issueUrl)
    else if (s.operationUrl) router.push(s.operationUrl)
  }

  // Le seul geste qui quitte la liste : son tableau, l'issue ouverte par-dessus.
  function openOnBoard(s: Signal) {
    if (slug) void markAsRead(slug, s.id)
    const target = issueRefOfUrl(s.issueUrl)
    if (target?.issueId != null && slug) router.push(issuePath(slug, target.projectId, target.issueId))
    else if (s.operationUrl) router.push(s.operationUrl)
  }

  function openWaiting(item: WaitingItem) {
    if (item.signalId && slug) void markAsRead(slug, item.signalId)
    if (item.issue) openIssue(item.issue)
    else if (item.href) router.push(item.href)
  }

  function signalActions(s: Signal): ListRowAction[] {
    if (!slug) return []
    const actions: ListRowAction[] = []
    if (!s.read) actions.push({ label: t.markRead, run: () => void markAsRead(slug, s.id) })
    if (!s.acknowledged) actions.push({ label: t.dismiss, run: () => void acknowledge(slug, s.id) })
    if (issueRefOfUrl(s.issueUrl)?.issueId != null || s.operationUrl) actions.push({ label: t.openBoard, run: () => openOnBoard(s) })
    return actions
  }

  const signalRow = (s: Signal) => {
    const { icon, tone } = SIGNAL_ICON[s.type] ?? FALLBACK_ICON
    const sentence = signalSentence(s, t)
    // Les liens sont dénormalisés à l'écriture : une ligne historique peut arriver sans destination, elle ne se présente
    // alors pas comme cliquable.
    const opens = Boolean(s.issueUrl || s.operationUrl)
    return (
      <ListRow
        key={s.id}
        icon={icon}
        tone={tone}
        name={`${signalKind(s, t)}: ${sentence}`}
        hint={signalHint(s, t)}
        sentence={sentence}
        unread={!s.read}
        unreadLabel={t.unread}
        code={s.type === "overload" ? null : s.issueId}
        time={s.timestamp}
        onOpen={opens ? () => openSignal(s) : undefined}
        actions={signalActions(s)}
      />
    )
  }

  const waitingRow = (item: WaitingItem) => {
    const { icon, tone } = WAITING_ICON[item.kind]
    const sentence = waitingSentence(item, t)
    const signalId = item.signalId
    return (
      <ListRow
        key={item.id}
        icon={icon}
        tone={tone}
        name={sentence}
        sentence={sentence}
        unread={item.kind === "mention"}
        unreadLabel={t.unread}
        code={item.key}
        time={item.at ? relativeTime(item.at) : null}
        onOpen={() => openWaiting(item)}
        actions={signalId && slug ? [{ label: t.markRead, run: () => void markAsRead(slug, signalId) }] : []}
      />
    )
  }

  /** Les lignes d'un groupe, bornées : au-delà, une ligne « Show more » et non une pagination. */
  function renderGroup<T>(name: string, title: string, items: readonly T[], row: (item: T) => ReactNode) {
    if (items.length === 0) return null
    const limit = limits[name] ?? GROUP_PAGE
    const hidden = items.length - limit
    return (
      <Group
        key={name}
        title={title}
        count={items.length}
        showMore={hidden > 0 ? {
          hidden,
          label: fillText(t.showMore, { count: hidden }),
          run: () => setLimits((current) => ({ ...current, [name]: limit + GROUP_PAGE })),
        } : null}
      >
        {items.slice(0, limit).map(row)}
      </Group>
    )
  }

  const empty = show === "alerts" ? t.emptyAlerts : show === "mentions" ? t.emptyMentions : t.empty

  return (
    <PageContainer size="narrow" className="gap-4">
      {/* Les gestes de toute la liste, à droite, une ligne ; le titre est celui du volet (R124). */}
      <div className="-mb-3 flex h-7 items-center justify-end gap-1">
        {unread && (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => slug && void markAllAsRead(slug)}>
            {t.markAllRead}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-7 text-muted-foreground"
          aria-label={t.refresh}
          title={t.refresh}
          onClick={() => { if (slug) void fetchNotifications(slug) }}
        >
          <RefreshCw className="size-3.5" aria-hidden="true" />
        </Button>
      </div>

      {/* On ne dit « rien » que le chargement fini : un échec ne se confond pas avec une liste vide. */}
      {isLoading && nothing ? (
        <LoadingRows />
      ) : error && nothing ? (
        <div className="flex items-center gap-2 px-2.5 text-sm text-muted-foreground">
          <AlertTriangle className="size-4 shrink-0 text-ink-yellow" aria-hidden="true" />
          <p className="min-w-0 flex-1">{t.loadFailed}</p>
          <Button variant="ghost" size="sm" onClick={() => { if (slug) void fetchNotifications(slug) }}>{t.retry}</Button>
        </div>
      ) : nothing ? (
        <p className="px-2.5 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <>
          {renderGroup("waiting", t.groups.waiting, waiting, waitingRow)}
          {renderGroup("happened", t.groups.happened, happened, signalRow)}
          {renderGroup("alerts", t.groups.alerts, alerts, signalRow)}
          {renderGroup("mentions", t.groups.mentions, mentions, signalRow)}
        </>
      )}
    </PageContainer>
  )
}
