"use client"

import { useEffect } from "react"
import Link from "next/link"
import { useParams, usePathname } from "next/navigation"
import {
  LayoutGrid,
  List,
  AlignLeft,
  RefreshCw,
  CalendarRange,
  FileText,
  Users,
  UserRound,
  Settings,
  Plus,
  MoreHorizontal,
  Star,
} from "lucide-react"

import { useTranslation } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { UserAvatar } from "@/components/ui/user-avatar"
import { ProjectIcon } from "@/components/ui/project-icon"
import { ScrollableTabs } from "@/components/ui/scrollable-tabs"
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
  { key: "detail.roadmap", icon: CalendarRange, pathSuffix: "/roadmap" },
  { key: "detail.backlog", icon: AlignLeft, pathSuffix: "/backlog" },
  { key: "detail.cycles", icon: RefreshCw, pathSuffix: "/cycles" },
  { key: "detail.pages", icon: FileText, pathSuffix: "/pages" },
  { key: "detail.teams", icon: Users, pathSuffix: "/teams" },
  { key: "detail.members", icon: UserRound, pathSuffix: "/members" },
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

  const { projects, fetchProjects, archiveProject, updateProject, setActiveProject, toggleFavorite } = useProjectStore()

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
    <div className="mx-auto flex h-full w-full max-w-screen-2xl flex-col">
      {/* Project header — pas de breadcrumb (le header de l'app suffit) ; largeur alignée sur le dashboard */}
      <div className="shrink-0 border-b border-border">
        {/* Project name + actions */}
        <div className="flex items-center justify-between gap-4 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <ProjectIcon iconUrl={project?.iconUrl ?? null} color={project?.color ?? null} size={36} />
            <div className="min-w-0">
              <h1 className="text-xl font-semibold text-foreground truncate">{project?.name ?? "…"}</h1>
              <p className="text-xs text-muted-foreground truncate">{project?.description ?? ""}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Members avatars */}
            <div className="hidden sm:flex -space-x-2 mr-1">
              {(project?.members ?? []).slice(0, 3).map((m) => (
                <UserAvatar
                  key={m.userId}
                  email={m.email}
                  name={m.displayName ?? m.email}
                  avatarUrl={m.avatarUrl}
                  className="h-7 w-7 ring-2 ring-background"
                  fallbackClassName="text-[9px]"
                />
              ))}
              {(project?.members?.length ?? 0) > 3 && (
                <div className="h-7 w-7 rounded-full bg-muted ring-2 ring-background flex items-center justify-center">
                  <span className="text-[9px] text-muted-foreground">+{(project?.members?.length ?? 0) - 3}</span>
                </div>
              )}
            </div>

            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 hidden sm:flex"
              disabled={!project}
              onClick={() => project && toggleFavorite(workspace, project.id, !project.isFavorite)}
              title={project?.isFavorite ? "Remove from favorites" : "Add to favorites"}
            >
              <Star className={cn("h-4 w-4", project?.isFavorite && "fill-yellow-400 text-yellow-400")} />
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

        {/* Tab nav — bande scrollable avec chevrons (l'onglet Settings restait hors écran, QA3) */}
        <ScrollableTabs>
          {PROJECT_TABS.map(({ key, icon: Icon, pathSuffix }) => {
            const active = isTabActive(pathSuffix)
            return (
              <Link
                key={key}
                href={basePath + pathSuffix}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-all border-b-2 whitespace-nowrap",
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
        </ScrollableTabs>
      </div>

      {/* Page content — one-screen : scroll interne ici (et par colonne sur le board) */}
      <div className="min-h-0 flex-1 overflow-y-auto pt-6">
        {children}
      </div>
    </div>
  )
}
