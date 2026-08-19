"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import {
  Search,
  Sparkles,
  Layers,
  Cpu,
  Users,
  Activity,
  CreditCard,
  Shield,
  Mail,
  Compass,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { useTranslation } from "@/lib/i18n"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Contenu réel de la doc (QA2-25) — concis, factuel, aligné sur l'app.
// ---------------------------------------------------------------------------

interface DocCategory {
  readonly id: string
  readonly label: string
  readonly icon: React.ReactNode
  readonly color: string
}

interface DocArticle {
  readonly id: string
  readonly category: string
  readonly title: string
  readonly body: string
}

const CATEGORIES: readonly DocCategory[] = [
  { id: "start",       label: "Getting started",      icon: <Sparkles className="h-4 w-4" />,   color: "text-amber-500 bg-amber-500/10 border-amber-500/20" },
  { id: "operations",  label: "Operations & tasks",   icon: <Layers className="h-4 w-4" />,     color: "text-blue-500 bg-blue-500/10 border-blue-500/20" },
  { id: "smart",       label: "Smart Assign (AI)",    icon: <Cpu className="h-4 w-4" />,         color: "text-violet-500 bg-violet-500/10 border-violet-500/20" },
  { id: "people",      label: "Members & teams",      icon: <Users className="h-4 w-4" />,      color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20" },
  { id: "analytics",   label: "Analytics & Assistant",icon: <Activity className="h-4 w-4" />,   color: "text-cyan-500 bg-cyan-500/10 border-cyan-500/20" },
  { id: "billing",     label: "Plans & billing",      icon: <CreditCard className="h-4 w-4" />, color: "text-orange-500 bg-orange-500/10 border-orange-500/20" },
  { id: "security",    label: "Security & data",      icon: <Shield className="h-4 w-4" />,      color: "text-rose-500 bg-rose-500/10 border-rose-500/20" },
]

const ARTICLES: readonly DocArticle[] = [
  {
    id: "start-workspace", category: "start",
    title: "Create a workspace and invite your team",
    body: "A workspace brings together your operations, members and teams. Create one from the selector at the top of the sidebar ('New workspace'). Then invite members from People → Members: by email (they receive an invitation link) or by searching for an existing user. Each member is given a role (Owner, Admin or Member).",
  },
  {
    id: "start-operation", category: "start",
    title: "Create your first operation (project)",
    body: "An 'operation' is a project. Click 'New project' in the sidebar or 'New Operation' on the Operations page. Give it a name, an icon and a color. The operation opens a ready-to-use kanban board (Backlog, Todo, In Progress, Done, Cancelled).",
  },
  {
    id: "start-nav", category: "start",
    title: "Finding your way: Dashboard, Signals, My Queue",
    body: "The Dashboard gives you an overview (active operations, workload, completion). Signals (inbox) groups your notifications by type (alerts, mentions, assignments). My Queue lists everything assigned to you (issues, sprints, pages) with sorting tabs.",
  },
  {
    id: "ops-board", category: "operations",
    title: "The kanban board: columns, drag & drop, statuses",
    body: "Each column maps to a status. Drag a card from one column to another to change its status (the move is instant and synced in real time). Double-click a column title to rename it, or change its color from the '…' menu. Add a column with the button to the right of the board.",
  },
  {
    id: "ops-views", category: "operations",
    title: "List, Backlog and Cycles views",
    body: "In addition to the board, each operation offers: List (all issues grouped by status), Backlog (to be planned), and Cycles (time-boxed sprints). The inline filters (Priority / Assignee / Label) apply to all of these views.",
  },
  {
    id: "ops-issue", category: "operations",
    title: "Create and enrich an issue",
    body: "Open an issue to edit its title, description, priority, assignee, due date and labels. The tabs let you add: comments, sub-tasks, relations, a checklist (with % progress), attachments and time spent (worklogs).",
  },
  {
    id: "smart-how", category: "smart",
    title: "How Smart Assign works",
    body: "Smart Assign recommends the best assignee for an issue by combining several signals: skill fit (semantic), current workload (cross-project), declared availability/capacity, and resolution history. An explanation (the 'why') and a score breakdown are shown.",
  },
  {
    id: "smart-skills", category: "smart",
    title: "Set a member's skills",
    body: "Recommendations improve when profiles are filled in. On a member's profile, edit their skills card (skills + expertise text + seniority + capacity h/week). You can also enable the 'upskilling' mode to encourage learning on adjacent tasks.",
  },
  {
    id: "smart-bulk", category: "smart",
    title: "Bulk auto-assign",
    body: "On the board, the 'Auto-assign (N)' button recommends an assignee for each unassigned issue. You check the suggestions to apply and assign them all at once.",
  },
  {
    id: "people-roles", category: "people",
    title: "Members and roles",
    body: "Three roles: Owner (full control), Admin (manages members and content), Member (contributes). On the Members page, an Owner can promote/demote and remove members. Destructive actions are always shown in red.",
  },
  {
    id: "people-teams", category: "people",
    title: "Teams and linking to operations",
    body: "Teams group members by function. You can link a team to an operation from the operation's Members tab, to manage access and composition per project.",
  },
  {
    id: "analytics-read", category: "analytics",
    title: "Reading the analytics",
    body: "The Intelligence page shows KPIs (resolved tasks, cycle time, velocity, active cycles), weekly throughput, sprint burndown and team capacity. Filter by operation with the selector at the top. Advanced analytics are included in the Pro plan.",
  },
  {
    id: "analytics-assistant", category: "analytics",
    title: "Using the Ask AI assistant",
    body: "Click 'Ask AI' in the top bar to open the assistant. Ask questions about your projects, tasks or strategy; it answers in context. The AI assistant is a Pro feature.",
  },
  {
    id: "billing-plans", category: "billing",
    title: "Plans: Free, Pro, Enterprise",
    body: "Free: 2 workspaces, up to 5 members, board/list/cycles, basic Smart Assign. Pro: 10 workspaces, up to 50 members, advanced analytics, AI assistant, integrations. Enterprise: unlimited members, SSO, advanced audit, on-premise.",
  },
  {
    id: "billing-upgrade", category: "billing",
    title: "Upgrade to Pro and manage billing",
    body: "Click any 'Upgrade to Pro' button (profile, switcher, Members page) to open the upgrade window and start the secure payment. Once subscribed, manage your billing from Settings → Billing & Plan (Stripe portal).",
  },
  {
    id: "security-gdpr", category: "security",
    title: "Your data (GDPR)",
    body: "From Settings → Privacy & Data, you can export all of your personal data (JSON) or request deletion/anonymization of your account. The privacy policy details the data collected, its legal bases and your rights.",
  },
]

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function HelpPage() {
  const { t } = useTranslation()
  const params = useParams()
  const slug = typeof params?.workspace === "string" ? params.workspace : ""
  const [query, setQuery] = useState("")

  const q = query.trim().toLowerCase()
  const searching = q.length > 0

  // Recherche → résultats à plat ; sinon doc complète groupée par catégorie.
  const searchResults = useMemo(() => {
    if (!searching) return []
    return ARTICLES.filter(
      (a) => a.title.toLowerCase().includes(q) || a.body.toLowerCase().includes(q)
    )
  }, [q, searching])

  // Catégories non vides, dans l'ordre, avec leurs articles.
  const sections = useMemo(
    () =>
      CATEGORIES.map((c) => ({
        category: c,
        articles: ARTICLES.filter((a) => a.category === c.id),
      })).filter((s) => s.articles.length > 0),
    []
  )

  function scrollTo(id: string) {
    document.getElementById(`doc-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("help.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("help.subtitle")}</p>
        </div>
        {/* Rejeu de la visite guidée : `?tour=1` force le tour au retour sur le dashboard. */}
        <Button asChild variant="outline" size="sm" className="shrink-0 gap-1.5">
          <Link href={`/${slug}/dashboard?tour=1`}>
            <Compass className="size-4" />
            Replay the guided tour
          </Link>
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("help.searchPlaceholder")}
          className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
        />
      </div>

      {searching ? (
        /* ── Résultats de recherche (à plat) ─────────────────────────── */
        <div className="flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">
            {searchResults.length} result{searchResults.length !== 1 ? "s" : ""} for "{query}"
          </p>
          {searchResults.length === 0 ? (
            <p className="rounded-xl border border-border bg-card py-10 text-center text-sm text-muted-foreground">
              No article matches your search.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {searchResults.map((a) => {
                const cat = CATEGORIES.find((c) => c.id === a.category)
                return (
                  <article key={a.id} className="rounded-xl border border-border bg-card p-5 [box-shadow:var(--shadow-sm)]">
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className={cn("flex size-6 items-center justify-center rounded-md border", cat?.color)}>{cat?.icon}</span>
                      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{cat?.label}</span>
                    </div>
                    <h3 className="text-sm font-semibold text-foreground">{a.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{a.body}</p>
                  </article>
                )
              })}
            </div>
          )}
        </div>
      ) : (
        /* ── Doc complète : sommaire + contenu ───────────────────────── */
        <div className="flex gap-8">
          {/* Sommaire (sticky) */}
          <nav className="sticky top-0 hidden h-fit w-56 shrink-0 flex-col gap-0.5 lg:flex">
            <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Contents</p>
            {sections.map(({ category }) => (
              <button
                key={category.id}
                type="button"
                onClick={() => scrollTo(category.id)}
                className="flex items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
              >
                <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-md border", category.color)}>{category.icon}</span>
                <span className="truncate">{category.label}</span>
              </button>
            ))}
          </nav>

          {/* Contenu */}
          <div className="flex min-w-0 flex-1 flex-col gap-10">
            {sections.map(({ category, articles }) => (
              <section key={category.id} id={`doc-${category.id}`} className="scroll-mt-6">
                <div className="mb-4 flex items-center gap-2.5 border-b border-border pb-2.5">
                  <span className={cn("flex size-8 items-center justify-center rounded-lg border", category.color)}>{category.icon}</span>
                  <h2 className="text-lg font-semibold tracking-tight text-foreground">{category.label}</h2>
                </div>
                <div className="flex flex-col gap-6">
                  {articles.map((a) => (
                    <div key={a.id}>
                      <h3 className="text-sm font-semibold text-foreground">{a.title}</h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{a.body}</p>
                    </div>
                  ))}
                </div>
              </section>
            ))}

            {/* Contact support */}
            <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 [box-shadow:var(--shadow-sm)] sm:flex-row sm:items-center">
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">{t("help.contactSupport")}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{t("help.contactSupportDesc")}</p>
              </div>
              <Button asChild variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 text-xs">
                <a href="mailto:support@taskforce.dev?subject=Support%20TaskForce">
                  <Mail className="size-3.5" />
                  {t("help.sendEmail")}
                </a>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
