"use client"

import Link from "next/link"
import { useParams, usePathname } from "next/navigation"
import {
  LayoutGrid,
  List,
  AlignLeft,
  RefreshCw,
  FileText,
  Users,
  Settings,
  Plus,
  ChevronRight,
  MoreHorizontal,
  Star,
} from "lucide-react"

import { useTranslation } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Mock project lookup
// ---------------------------------------------------------------------------

const MOCK_PROJECTS: Record<string, {
  id: string
  name: string
  emoji: string
  color: string
  description: string
  status: "active" | "paused" | "archived"
  openIssues: number
  members: { name: string; initials: string; color: string }[]
}> = {
  "1": {
    id: "1",
    name: "Website Redesign",
    emoji: "🎨",
    color: "bg-violet-500",
    description: "Complete overhaul of the marketing site",
    status: "active",
    openIssues: 12,
    members: [
      { name: "Sophie Martin", initials: "SM", color: "bg-violet-500" },
      { name: "You", initials: "ME", color: "bg-primary" },
      { name: "Emma Petit", initials: "EP", color: "bg-emerald-500" },
    ],
  },
  "2": {
    id: "2",
    name: "Mobile App",
    emoji: "📱",
    color: "bg-blue-500",
    description: "iOS & Android native app",
    status: "active",
    openIssues: 21,
    members: [
      { name: "Lucas Dufour", initials: "LD", color: "bg-blue-500" },
      { name: "You", initials: "ME", color: "bg-primary" },
      { name: "Emma Petit", initials: "EP", color: "bg-emerald-500" },
      { name: "Thomas Bernard", initials: "TB", color: "bg-orange-500" },
    ],
  },
  "3": {
    id: "3",
    name: "API v2",
    emoji: "⚡",
    color: "bg-emerald-500",
    description: "New RESTful API with improved auth",
    status: "active",
    openIssues: 9,
    members: [
      { name: "You", initials: "ME", color: "bg-primary" },
      { name: "Thomas Bernard", initials: "TB", color: "bg-orange-500" },
    ],
  },
}

// ---------------------------------------------------------------------------
// Nav tabs config
// ---------------------------------------------------------------------------

type ProjectTab = {
  key: string
  icon: React.ElementType
  pathSuffix: string
}

const PROJECT_TABS: ProjectTab[] = [
  { key: "detail.board", icon: LayoutGrid, pathSuffix: "" },
  { key: "detail.list", icon: List, pathSuffix: "/list" },
  { key: "detail.backlog", icon: AlignLeft, pathSuffix: "/backlog" },
  { key: "detail.cycles", icon: RefreshCw, pathSuffix: "/cycles" },
  { key: "detail.pages", icon: FileText, pathSuffix: "/pages" },
  { key: "detail.members", icon: Users, pathSuffix: "/members" },
]

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export default function ProjectLayout({ children }: { readonly children: React.ReactNode }) {
  const { t } = useTranslation()
  const params = useParams()
  const pathname = usePathname()
  let projectId = "1"
  if (typeof params.id === "string") projectId = params.id
  else if (Array.isArray(params.id)) projectId = params.id[0]

  const project = MOCK_PROJECTS[projectId] ?? MOCK_PROJECTS["1"]
  const basePath = `/projects/${projectId}`

  function isTabActive(suffix: string): boolean {
    if (suffix === "") {
      // Board is active only when we're exactly at /projects/[id]
      return pathname === basePath
    }
    return pathname.startsWith(basePath + suffix)
  }

  return (
    <div className="flex flex-col gap-0 w-full -m-4 md:-m-6 min-h-full">
      {/* Project header */}
      <div className="px-4 md:px-6 pt-4 md:pt-6 pb-0 border-b border-border bg-background/80 backdrop-blur-sm sticky top-14 z-30">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
          <Link href="/projects" className="hover:text-foreground transition-colors">
            {t("projects.title")}
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground font-medium">{project.name}</span>
        </div>

        {/* Project name + actions */}
        <div className="flex items-center justify-between gap-4 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-2xl">{project.emoji}</span>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold text-foreground truncate">{project.name}</h1>
              <p className="text-xs text-muted-foreground truncate">{project.description}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Members avatars */}
            <div className="hidden sm:flex -space-x-2 mr-1">
              {project.members.slice(0, 3).map((m, i) => (
                <Avatar key={`${m.initials}-${i}`} className="h-7 w-7 ring-2 ring-background">
                  <AvatarFallback className={cn("text-[9px] text-white", m.color)}>
                    {m.initials}
                  </AvatarFallback>
                </Avatar>
              ))}
              {project.members.length > 3 && (
                <div className="h-7 w-7 rounded-full bg-muted ring-2 ring-background flex items-center justify-center">
                  <span className="text-[9px] text-muted-foreground">+{project.members.length - 3}</span>
                </div>
              )}
            </div>

            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 hidden sm:flex">
              <Star className="h-4 w-4" />
            </Button>

            <Button size="sm" className="gap-1.5 h-8 text-xs">
              <Plus className="h-3.5 w-3.5" />
              {t("projects.detail.newIssue")}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href={`${basePath}/settings`}>
                    <Settings className="h-4 w-4 mr-2" />
                    {t("projects.detail.settings")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem>Archive project</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Tab nav */}
        <div className="flex items-center gap-0 overflow-x-auto scrollbar-hide">
          {PROJECT_TABS.map(({ key, icon: Icon, pathSuffix }) => {
            const active = isTabActive(pathSuffix)
            return (
              <Link
                key={key}
                href={basePath + pathSuffix}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-all border-b-2 whitespace-nowrap",
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                )}
              >
                <Icon className="h-4 w-4" />
                {t(`projects.${key}`)}
                {key === "detail.board" && project.openIssues > 0 && (
                  <Badge
                    variant="secondary"
                    className="h-4 min-w-4 px-1 text-[10px] bg-muted text-muted-foreground border-0"
                  >
                    {project.openIssues}
                  </Badge>
                )}
              </Link>
            )
          })}
        </div>
      </div>

      {/* Page content */}
      <div className="flex-1 p-4 md:p-6">
        {children}
      </div>
    </div>
  )
}
