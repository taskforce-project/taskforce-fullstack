"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Search, Sparkles, FlaskConical } from "lucide-react"

import { cn } from "@/lib/utils"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { ThemeToggle } from "@/components/common/theme-toggle"
import { CommandPalette } from "@/components/command-palette"
import { NotificationBell } from "@/components/layout/topbar/notification-bell"
import { WorkflowsButton } from "@/components/workflows/workflows-button"
import { useProjectStore } from "@/lib/store/project-store"
import { usePanelStore } from "@/lib/store/panel-store"
import { useUserStore } from "@/lib/store/user-store"
import { useWorkspaceStore } from "@/lib/store/workspace-store"
import { planHasFeature } from "@/lib/config/plan-features"
import { AgentChat } from "@/components/agent/agent-chat"
import { toast } from "sonner"

/**
 * Map a URL segment (slug) to a display label.
 * Handles kebab-case and common route names.
 */
function segmentLabel(segment: string): string {
  const labels: Record<string, string> = {
    dashboard: "Dashboard",
    inbox: "Signal Center",
    "my-work": "My Queue",
    projects: "Operations",
    teams: "Teams",
    members: "Members",
    skills: "Skills",
    analytics: "Intelligence",
    settings: "Settings",
    admin: "Admin",
    new: "New",
    issues: "Issues",
    cycles: "Sprints",
    roadmap: "Roadmap",
    pages: "Pages",
    modules: "Modules",
    views: "Views",
    spans: "Spans",
    wiki: "Wiki",
    mentions: "Mentions",
    alerts: "Alerts",
    assignments: "Assignments",
  }
  return (
    labels[segment] ??
    segment
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
  )
}

function useBreadcrumbs() {
  const pathname = usePathname()
  const projects = useProjectStore((s) => s.projects)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace)

  return React.useMemo(() => {
    const segments = pathname.replace(/^\//, "").split("/").filter(Boolean)
    const result: { href: string; label: string; isLast: boolean }[] = []

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]
      const href = "/" + segments.slice(0, i + 1).join("/")
      const isLast = i === segments.length - 1

      // 1er segment = slug du workspace. Le title-case kebab générique affichait « Pierre 6db5ea »
      // (le slug porte un suffixe hex d'unicité) et liait vers `/{slug}` — une route SANS page → 404.
      // On rend le vrai nom du workspace et on pointe vers son accueil réel (`/{slug}/dashboard`).
      if (i === 0) {
        const ws = workspaces.find((w) => w.slug === seg)
        result.push({
          href: `/${seg}/dashboard`,
          label: ws?.name ?? activeWorkspace?.name ?? segmentLabel(seg),
          isLast,
        })
        continue
      }

      // Segment numérique après "projects" = ID de projet → remplacer par le nom
      if (/^\d+$/.test(seg) && segments[i - 1] === "projects") {
        const project = projects.find((p) => p.id === Number(seg))
        if (project) {
          result.push({ href, label: project.name, isLast })
        }
        // Si projet pas encore chargé, on omet le segment numérique
        continue
      }

      result.push({ href, label: segmentLabel(seg), isLast })
    }

    return result
  }, [pathname, projects, workspaces, activeWorkspace])
}

export function AppTopbar() {
  const breadcrumbs = useBreadcrumbs()
  const pathname = usePathname()
  // Fonctionnalités « Lab » (en cours de finition) : Intelligence (/analytics) + Brain OS (/brain).
  // Le header se teinte en bleu discret (info) + un indicateur + un lien feedback — pendant des
  // fioles bleues de la sidebar. Remplace le bandeau `LabBanner` sur ces pages pleines.
  const isLab = /\/(analytics|brain)(\/|$)/.test(pathname)
  const [cmdOpen, setCmdOpen] = React.useState(false)
  const togglePanel = usePanelStore((s) => s.togglePanel)
  const planType = useUserStore((s) => s.user?.planType)
  const aiEntitled = planHasFeature(planType, "AI_ASSISTANT")

  const openAssistant = React.useCallback(() => {
    if (!aiEntitled) {
      toast.info("L'assistant IA est une fonctionnalité Pro. Passez à Pro pour l'activer.")
      return
    }
    togglePanel({
      id: "assistant",
      side: "right",
      title: "Cortex",
      icon: <Sparkles className="size-4 text-primary" />,
      content: <AgentChat />,
    })
  }, [togglePanel, aiEntitled])

  // Global Ctrl+K / Cmd+K shortcut
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setCmdOpen((o) => !o)
      }
    }
    globalThis.addEventListener("keydown", onKey)
    return () => globalThis.removeEventListener("keydown", onKey)
  }, [])

  return (
    <header
      className={cn(
        "sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b px-4 transition-colors",
        isLab
          ? "border-blue-300 bg-blue-100 dark:border-blue-900/60 dark:bg-blue-950/50"
          : "border-border bg-background",
      )}
    >
      {/* Left: sidebar trigger + breadcrumb */}
      <div className="flex flex-1 items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />

        {breadcrumbs.length > 0 && (
          <Breadcrumb>
            <BreadcrumbList>
              {breadcrumbs.map((crumb, i) => (
                // Clé = index + href : sur le dashboard, le crumb workspace ET le crumb « Dashboard »
                // pointent tous deux vers `/{slug}/dashboard` — l'href seul provoquait une clé dupliquée.
                <React.Fragment key={`${i}-${crumb.href}`}>
                  {i > 0 && <BreadcrumbSeparator className="hidden md:block" />}
                  <BreadcrumbItem className={i > 0 ? "hidden md:block" : ""}>
                    {crumb.isLast ? (
                      <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink asChild>
                        <Link href={crumb.href}>{crumb.label}</Link>
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </React.Fragment>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
        )}
      </div>

      {/* Indicateur « Lab » centré dans le header (feature en expérimentation). */}
      {isLab && (
        <div className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 items-center gap-2">
          {/* Violet : le bleu porte les actions primaires, un marqueur d'état doit s'en distinguer. */}
          <span className="flex items-center gap-1.5 rounded-full bg-violet-200/70 px-2.5 py-0.5 text-[11px] font-medium text-violet-800 dark:bg-violet-900/60 dark:text-violet-200">
            <FlaskConical className="size-3.5" />
            Expérimentation
          </span>
          <a
            href="mailto:feedback@taskforce.dev?subject=Feedback"
            className="pointer-events-auto hidden text-[11px] font-medium text-violet-700 underline-offset-2 hover:underline md:inline dark:text-violet-300"
          >
            Donner mon feedback
          </a>
        </div>
      )}

      {/* Right: search, notifications, theme, user */}
      <div className="flex items-center gap-1">
        {/* Global search button — desktop */}
        <button
          className="hidden h-8 cursor-pointer items-center gap-2 rounded-md border border-border bg-muted/40 px-2 text-xs text-muted-foreground transition-colors hover:bg-muted/60 sm:flex"
          onClick={() => setCmdOpen(true)}
          aria-label="Open command palette"
        >
          <Search className="size-3.5" />
          <span className="hidden lg:inline">Search…</span>
          <Kbd className="hidden lg:inline-flex gap-0.5">
            <span>⌘</span><span>K</span>
          </Kbd>
        </button>

        {/* Mobile search icon */}
        <Button
          variant="ghost"
          size="icon"
          className="sm:hidden"
          aria-label="Search"
          onClick={() => setCmdOpen(true)}
        >
          <Search className="size-4" />
        </Button>

        {/* Ask AI — ouvre l'assistant en panneau latéral (PROD-8.9) */}
        <Button
          variant="ghost"
          size="sm"
          className="hidden gap-1.5 text-xs sm:inline-flex"
          onClick={openAssistant}
          aria-label="Ouvrir l'assistant IA"
          data-tour="ask-ai"
        >
          <Sparkles className="size-4 text-primary" />
          <span className="hidden lg:inline">Ask AI</span>
        </Button>

        {/* Workflows IA — dock des analyses en arrière-plan (badge = jobs actifs) */}
        <WorkflowsButton />

        {/* Notifications — badge non-lus + popover preview (QA2-11) */}
        <NotificationBell />

        {/* Theme toggle */}
        <ThemeToggle />
      </div>

      {/* Command palette */}
      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
    </header>
  )
}
