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
import { ThemeToggle } from "@/components/common/theme-toggle"
import { useAuth } from "@/lib/contexts/auth-context"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useTranslation } from "@/lib/i18n"

/**
 * Map a URL segment (slug) to a display label.
 * Handles kebab-case and common route names.
 */
function segmentLabel(segment: string): string {
  const labels: Record<string, string> = {
    dashboard: "Dashboard",
    inbox: "Inbox",
    "my-work": "My Work",
    projects: "Projects",
    teams: "Teams",
    members: "Members",
    skills: "Skills",
    analytics: "Analytics",
    discussions: "Discussions",
    settings: "Settings",
    admin: "Admin",
    new: "New",
    issues: "Issues",
    cycles: "Cycles",
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

  return React.useMemo(() => {
    // Remove leading slash, split
    const segments = pathname.replace(/^\//, "").split("/").filter(Boolean)

    return segments.map((seg, i) => {
      const href = "/" + segments.slice(0, i + 1).join("/")
      const label = segmentLabel(seg)
      const isLast = i === segments.length - 1
      return { href, label, isLast }
    })
  }, [pathname])
}

function UserAvatar() {
  const { user } = useAuth()

  const initials = user
    ? `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase()
    : "?"

  return (
    <Avatar className="size-8">
      <AvatarImage src="" alt={user?.firstName ?? "User"} />
      <AvatarFallback className="text-xs font-medium">{initials}</AvatarFallback>
    </Avatar>
  )
}

export function AppTopbar() {
  const { t } = useTranslation()
  const breadcrumbs = useBreadcrumbs()

  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/80 backdrop-blur-md px-4">
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
        {/* Global search (placeholder) */}
        <Button
          variant="ghost"
          size="sm"
          className="hidden gap-2 text-muted-foreground sm:flex"
          aria-label={t("common.search")}
        >
          <Search className="size-4" />
          <span className="hidden text-sm lg:inline">{t("common.search")}...</span>
        </Button>

        {/* Mobile search icon */}
        <Button
          variant="ghost"
          size="icon"
          className="sm:hidden"
          aria-label={t("common.search")}
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
          <Link href="/inbox">
            <Bell className="size-4" />
          </Link>
        </Button>

        {/* Theme toggle */}
        <ThemeToggle />

        {/* User avatar */}
        <Button variant="ghost" size="icon" className="rounded-full" asChild>
          <Link href="/settings/profile" aria-label="Profile settings">
            <UserAvatar />
          </Link>
        </Button>
      </div>
    </header>
  )
}
