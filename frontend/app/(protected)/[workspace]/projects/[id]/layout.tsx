"use client"

import { useEffect } from "react"
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
  CircleDot,
} from "lucide-react"

import { useTranslation } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ProjectIcon } from "@/components/ui/project-icon"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { CreateIssueDialog } from "@/components/dialogs/create-issue-dialog"
import { cn } from "@/lib/utils"
import { useProjectStore } from "@/lib/store/project-store"
import type { UpdateProjectPayload } from "@/lib/api/project-service"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const AVATAR_COLORS = [
  "bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-orange-500",
  "bg-pink-500", "bg-cyan-500", "bg-amber-500", "bg-indigo-500",
]

function getMemberInitials(displayName: string | null, email: string): string {
  if (displayName) {
    const parts = displayName.trim().split(/\s+/)
    if (parts.length >= 2) {
      return ((parts.at(0)?.at(0) ?? "") + (parts.at(-1)?.at(0) ?? "")).toUpperCase()
    }
    return parts[0].slice(0, 2).toUpperCase()
  }
  return email.slice(0, 2).toUpperCase()
}

function getMemberColor(id: number): string {
  return AVATAR_COLORS[id % AVATAR_COLORS.length]
}

function extractParam(p: string | string[] | undefined): string {
  if (typeof p === "string") return p
  if (Array.isArray(p)) return p[0] ?? ""
  return ""
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
  { key: "detail.issues", icon: CircleDot, pathSuffix: "/issues" },
  { key: "detail.cycles", icon: RefreshCw, pathSuffix: "/cycles" },
  { key: "detail.pages", icon: FileText, pathSuffix: "/pages" },
  { key: "detail.members", icon: Users, pathSuffix: "/members" },
  { key: "detail.settings", icon: Settings, pathSuffix: "/settings" },
]

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export default function ProjectLayout({ children }: { readonly children: React.ReactNode }) {
  const { t } = useTranslation()
  const params = useParams()
  const pathname = usePathname()

  const workspace = extractParam(params.workspace)
  const projectId = extractParam(params.id) || "0"

  const { projects, fetchProjects, archiveProject, updateProject, setActiveProject } = useProjectStore()

  useEffect(() => {
    if (workspace && projects.length === 0) {
      fetchProjects(workspace)
    }
  }, [workspace, projects.length, fetchProjects])

  const project = projects.find((p) => p.id === Number(projectId))

  useEffect(() => {
    if (project) setActiveProject(project)
  }, [project, setActiveProject])
  const basePath = `/${workspace}/projects/${projectId}`

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
      <div className="px-4 md:px-6 pt-4 md:pt-6 pb-0 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-30">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
          <Link href={`/${workspace}/projects`} className="hover:text-foreground transition-colors">
            {t("projects.title")}
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground font-medium">{project?.name ?? "…"}</span>
        </div>

        {/* Project name + actions */}
        <div className="flex items-center justify-between gap-4 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <ProjectIcon iconUrl={project?.iconUrl ?? null} size={36} />
            <div className="min-w-0">
              <h1 className="text-xl font-semibold text-foreground truncate">{project?.name ?? "…"}</h1>
              <p className="text-xs text-muted-foreground truncate">{project?.description ?? ""}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Members avatars */}
            <div className="hidden sm:flex -space-x-2 mr-1">
              {(project?.members ?? []).slice(0, 3).map((m) => (
                <Avatar key={m.id} className="h-7 w-7 ring-2 ring-background">
                  {m.avatarUrl && <AvatarImage src={m.avatarUrl} alt={m.displayName ?? m.email} />}
                  <AvatarFallback className={cn("text-[9px] text-white", getMemberColor(m.userId))}>
                    {getMemberInitials(m.displayName, m.email)}
                  </AvatarFallback>
                </Avatar>
              ))}
              {(project?.members?.length ?? 0) > 3 && (
                <div className="h-7 w-7 rounded-full bg-muted ring-2 ring-background flex items-center justify-center">
                  <span className="text-[9px] text-muted-foreground">+{(project?.members?.length ?? 0) - 3}</span>
                </div>
              )}
            </div>

            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 hidden sm:flex">
              <Star className="h-4 w-4" />
            </Button>

            <CreateIssueDialog projectId={Number(projectId)} workspaceSlug={workspace}>
              <Button size="sm" className="gap-1.5 h-8 text-xs">
                <Plus className="h-3.5 w-3.5" />
                {t("projects.detail.newIssue")}
              </Button>
            </CreateIssueDialog>

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
                {project?.status === "ARCHIVED" ? (
                  <DropdownMenuItem
                    onClick={() => updateProject(workspace, Number(projectId), { status: "ACTIVE" } as UpdateProjectPayload)}
                  >
                    Reactivate project
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onClick={() => archiveProject(workspace, Number(projectId))}
                  >
                    Archive project
                  </DropdownMenuItem>
                )}
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
                {key === "detail.board" && (project?.openIssues ?? 0) > 0 && (
                  <Badge
                    variant="secondary"
                    className="h-4 min-w-4 px-1 text-[10px] bg-muted text-muted-foreground border-0"
                  >
                    {project?.openIssues}
                  </Badge>
                )}
              </Link>
            )
          })}
        </div>
      </div>

      {/* Page content */}
      <div className="flex-1 px-4 pt-5 pb-6 md:px-6 md:pt-6 md:pb-8">
        {children}
      </div>
    </div>
  )
}
