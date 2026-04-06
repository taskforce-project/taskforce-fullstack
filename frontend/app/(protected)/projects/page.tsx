"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import {
  Plus,
  Search,
  FolderKanban,
  CircleDot,
  ArrowUpRight,
  MoreHorizontal,
  Archive,
  PauseCircle,
} from "lucide-react"

import { CreateProjectDialog } from "@/components/dialogs/create-project-dialog"

import { useTranslation } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
// Types
// ---------------------------------------------------------------------------

type ProjectStatus = "active" | "paused" | "archived"
type FilterTab = "all" | "active" | "archived"

interface ProjectMember {
  name: string
  initials: string
  color: string
}

interface Project {
  id: string
  name: string
  description: string
  status: ProjectStatus
  color: string
  emoji: string
  totalIssues: number
  openIssues: number
  members: ProjectMember[]
  progress: number
  updatedAt: string
  url: string
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_PROJECTS: Project[] = [
  {
    id: "1",
    name: "Website Redesign",
    description: "Complete overhaul of the marketing site with new design system and improved performance.",
    status: "active",
    color: "bg-violet-500",
    emoji: "🎨",
    totalIssues: 34,
    openIssues: 12,
    members: [
      { name: "Sophie Martin", initials: "SM", color: "bg-violet-500" },
      { name: "You", initials: "ME", color: "bg-primary" },
      { name: "Emma Petit", initials: "EP", color: "bg-emerald-500" },
    ],
    progress: 65,
    updatedAt: "2 hours ago",
    url: "/projects/1",
  },
  {
    id: "2",
    name: "Mobile App",
    description: "iOS & Android native app — authentication, onboarding, and core feature set.",
    status: "active",
    color: "bg-blue-500",
    emoji: "📱",
    totalIssues: 58,
    openIssues: 21,
    members: [
      { name: "Lucas Dufour", initials: "LD", color: "bg-blue-500" },
      { name: "You", initials: "ME", color: "bg-primary" },
      { name: "Emma Petit", initials: "EP", color: "bg-emerald-500" },
      { name: "Thomas Bernard", initials: "TB", color: "bg-orange-500" },
    ],
    progress: 42,
    updatedAt: "15 min ago",
    url: "/projects/2",
  },
  {
    id: "3",
    name: "API v2",
    description: "New RESTful API with improved auth, rate limiting, and OpenAPI documentation.",
    status: "active",
    color: "bg-emerald-500",
    emoji: "⚡",
    totalIssues: 27,
    openIssues: 9,
    members: [
      { name: "You", initials: "ME", color: "bg-primary" },
      { name: "Thomas Bernard", initials: "TB", color: "bg-orange-500" },
    ],
    progress: 78,
    updatedAt: "Yesterday",
    url: "/projects/3",
  },
  {
    id: "4",
    name: "Analytics Dashboard",
    description: "Real-time analytics and reporting dashboard for workspace administrators.",
    status: "paused",
    color: "bg-amber-500",
    emoji: "📊",
    totalIssues: 15,
    openIssues: 8,
    members: [
      { name: "Sophie Martin", initials: "SM", color: "bg-violet-500" },
      { name: "You", initials: "ME", color: "bg-primary" },
    ],
    progress: 30,
    updatedAt: "3 days ago",
    url: "/projects/4",
  },
  {
    id: "5",
    name: "Design System",
    description: "Component library, tokens, and documentation for all Taskforce products.",
    status: "archived",
    color: "bg-slate-500",
    emoji: "💎",
    totalIssues: 42,
    openIssues: 0,
    members: [
      { name: "Emma Petit", initials: "EP", color: "bg-emerald-500" },
    ],
    progress: 100,
    updatedAt: "2 weeks ago",
    url: "/projects/5",
  },
]

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<ProjectStatus, { icon: React.ReactNode; badgeClass: string; label: string }> = {
  active: {
    icon: <CircleDot className="h-3 w-3 text-emerald-400" />,
    badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
    label: "Active",
  },
  paused: {
    icon: <PauseCircle className="h-3 w-3 text-amber-400" />,
    badgeClass: "bg-amber-500/15 text-amber-400 border-amber-500/20",
    label: "Paused",
  },
  archived: {
    icon: <Archive className="h-3 w-3 text-muted-foreground" />,
    badgeClass: "bg-muted text-muted-foreground border-border",
    label: "Archived",
  },
}

// ---------------------------------------------------------------------------
// ProjectCard
// ---------------------------------------------------------------------------

function ProjectCard({ project, t }: Readonly<{ project: Project; t: (k: string) => string }>) {
  const statusCfg = STATUS_CONFIG[project.status]

  return (
    <Link
      href={project.url}
      className="group relative flex flex-col rounded-xl border border-border bg-card p-5 hover:border-primary/40 hover:bg-card/80 transition-all [box-shadow:var(--shadow-sm)] hover:[box-shadow:var(--shadow-md)]"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "h-10 w-10 rounded-lg flex items-center justify-center text-xl shrink-0",
              "bg-linear-to-br from-muted to-muted/50"
            )}
          >
            {project.emoji}
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
              {project.name}
            </h3>
            <Badge
              variant="outline"
              className={cn("text-xs border px-1.5 py-0 mt-0.5 flex items-center gap-1 w-fit", statusCfg.badgeClass)}
            >
              {statusCfg.icon}
              {statusCfg.label}
            </Badge>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              onClick={(e) => e.preventDefault()}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>Edit project</DropdownMenuItem>
            <DropdownMenuItem>Archive</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Description */}
      <p className="text-sm text-muted-foreground line-clamp-2 mb-4 flex-1">
        {project.description}
      </p>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-muted-foreground">{t("projects.meta.progress")}</span>
          <span className="text-xs text-muted-foreground">{project.progress}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              project.progress === 100 ? "bg-emerald-500" : "bg-primary"
            )}
            style={{ width: `${project.progress}%` }}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        {/* Members */}
        <div className="flex items-center">
          <div className="flex -space-x-2">
            {project.members.slice(0, 4).map((m) => (
              <Avatar key={m.initials} className="h-6 w-6 ring-2 ring-card">
                <AvatarFallback className={cn("text-[9px] text-white", m.color)}>
                  {m.initials}
                </AvatarFallback>
              </Avatar>
            ))}
            {project.members.length > 4 && (
              <div className="h-6 w-6 rounded-full bg-muted ring-2 ring-card flex items-center justify-center">
                <span className="text-[9px] text-muted-foreground">+{project.members.length - 4}</span>
              </div>
            )}
          </div>
          <span className="ml-2 text-xs text-muted-foreground">
            {project.members.length} {t("projects.meta.members")}
          </span>
        </div>

        {/* Issues */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <CircleDot className="h-3 w-3" />
            {project.openIssues} {t("projects.meta.issues")}
          </span>
          <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ isSearch, t }: Readonly<{ isSearch: boolean; t: (k: string) => string }>) {
  if (isSearch) {
    return (
      <div className="col-span-full flex flex-col items-center justify-center py-16 text-center">
        <Search className="h-10 w-10 text-muted-foreground/30 mb-4" />
        <p className="text-base font-medium text-foreground">{t("projects.emptySearch")}</p>
      </div>
    )
  }
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-16 text-center">
      <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mb-4">
        <FolderKanban className="h-6 w-6 text-muted-foreground/50" />
      </div>
      <p className="text-base font-medium text-foreground">{t("projects.empty.title")}</p>
      <p className="mt-1 text-sm text-muted-foreground mb-4">{t("projects.empty.description")}</p>
      <CreateProjectDialog>
        <Button size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          {t("projects.empty.cta")}
        </Button>
      </CreateProjectDialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const FILTER_TABS: FilterTab[] = ["all", "active", "archived"]

export default function ProjectsPage() {
  const { t } = useTranslation()
  const [filter, setFilter] = useState<FilterTab>("all")
  const [search, setSearch] = useState("")

  const filtered = useMemo(() => {
    let list = MOCK_PROJECTS
    if (filter === "active") list = list.filter((p) => p.status === "active" || p.status === "paused")
    if (filter === "archived") list = list.filter((p) => p.status === "archived")
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q))
    }
    return list
  }, [filter, search])

  return (
    <div className="flex flex-col gap-0 w-full">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("projects.title")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("projects.subtitle")}</p>
        </div>
        <CreateProjectDialog>
          <Button size="sm" className="gap-2 shrink-0">
            <Plus className="h-4 w-4" />
            {t("projects.newProject")}
          </Button>
        </CreateProjectDialog>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        {/* Filter tabs */}
        <div className="flex items-center rounded-lg bg-muted p-1 gap-0.5">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={cn(
                "px-3 py-1 text-sm rounded-md transition-all font-medium",
                filter === tab
                  ? "bg-background text-foreground [box-shadow:var(--shadow-sm)]"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t(`projects.filters.${tab}`)}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("projects.searchPlaceholder")}
            className="pl-8 h-8 text-sm"
          />
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.length === 0 ? (
          <EmptyState isSearch={search.trim().length > 0} t={t} />
        ) : (
          filtered.map((project) => <ProjectCard key={project.id} project={project} t={t} />)
        )}
      </div>
    </div>
  )
}
