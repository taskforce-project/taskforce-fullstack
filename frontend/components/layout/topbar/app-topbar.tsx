"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Bell, Search } from "lucide-react"

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
import { useTranslation } from "@/lib/i18n"
import { CommandPalette } from "@/components/command-palette"
import { useWorkspaceStore } from "@/lib/store/workspace-store"
import { useProjectStore } from "@/lib/store/project-store"

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
    teams: "Squads",
    members: "Team",
    skills: "Skills",
    analytics: "Intelligence",
    agents: "Agents",
    messages: "Messages",
    discussions: "Discussions",
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

  return React.useMemo(() => {
    const segments = pathname.replace(/^\//, "").split("/").filter(Boolean)
    const result: { href: string; label: string; isLast: boolean }[] = []

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]
      const href = "/" + segments.slice(0, i + 1).join("/")
      const isLast = i === segments.length - 1

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
  }, [pathname, projects])
}

export function AppTopbar() {
  const { t } = useTranslation()
  const slug = useWorkspaceStore((s) => s.activeWorkspace?.slug)
  const breadcrumbs = useBreadcrumbs()
  const [cmdOpen, setCmdOpen] = React.useState(false)

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
    <header className="topbar">
      {/* Left: sidebar trigger + breadcrumb */}
      <div className="flex flex-1 items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />

        {breadcrumbs.length > 0 && (
          <Breadcrumb>
            <BreadcrumbList>
              {breadcrumbs.map((crumb, i) => (
                <React.Fragment key={crumb.href}>
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

      {/* Right: search, notifications, theme, user */}
      <div className="flex items-center gap-1">
        {/* Global search button — desktop */}
        <button
          className="topbar-search"
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

        {/* Notifications */}
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("common.notifications")}
          asChild
        >
          <Link href={`/${slug}/inbox`}>
            <Bell className="size-4" />
          </Link>
        </Button>

        {/* Theme toggle */}
        <ThemeToggle />
      </div>

      {/* Command palette */}
      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
    </header>
  )
}
