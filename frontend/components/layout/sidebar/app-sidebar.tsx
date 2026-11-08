"use client"

import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import { useParams, usePathname } from "next/navigation"
import {
  Activity, CalendarRange, ChevronRight, Inbox, LayoutDashboard, ListChecks, Plus, Repeat, Search, SquarePen, Trash2,
  TrendingUp, Users, type LucideIcon,
} from "lucide-react"

import { PaneLink } from "@/components/layout/pane-link"
import { NavUser } from "@/components/layout/sidebar/nav-user"
import { WorkDot } from "@/components/layout/work-dot"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Kbd } from "@/components/ui/kbd"
import { ProjectIcon } from "@/components/ui/project-icon"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { useNow } from "@/hooks/use-now"
import type { ConversationSummary } from "@/lib/api/ai-conversation-service"
import type { DeliveryRun } from "@/lib/api/delivery-service"
import { fillText } from "@/lib/delivery/result-card"
import { IS_DESKTOP } from "@/lib/desktop"
import { useModKeyLabel } from "@/lib/hooks/use-mod-key"
import { usePaneNavigation } from "@/lib/hooks/use-pane-navigation"
import { useCortexStore } from "@/lib/store/cortex-store"
import { useCreateProjectStore } from "@/lib/store/create-project-store"
import { useDeliveryStore } from "@/lib/store/delivery-store"
import { useNotificationStore } from "@/lib/store/notification-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { useProjectStore } from "@/lib/store/project-store"
import { useUserStore } from "@/lib/store/user-store"
import { useWindowStore } from "@/lib/store/window-store"
import { cn } from "@/lib/utils"
import { groupConversations, leftBarProjects } from "@/lib/window/left-bar"
import { missionPath } from "@/lib/window/address"
import { liveRuns, runLabel, runState, type WorkState } from "@/lib/window/missions"
import { PROGRESS, boardPath } from "@/lib/window/pane"
import { waitingCount } from "@/lib/window/waiting"

const LOGO_SRC = "/assets/logo/logo_taskforce_tp.png"
/** Les conversations montrées sous un projet, puis sans projet, avant « N more ». */
const UNDER_PROJECT = 5
const LOOSE = 10

type MoreKey = "myWork" | "dashboard" | "roadmap" | "cycles" | "members" | "analytics" | "progress"

/**
 * Sous « More » (R121) : retirés du premier regard, pas du produit ; chacun s'ouvre dans le volet. « Progress » (R125)
 * s'y range aussi : on l'ouvre surtout depuis le nom du modèle sous le compositeur.
 */
const MORE: readonly { key: MoreKey; path: string; icon: LucideIcon }[] = [
  { key: "myWork", path: "/my-work", icon: ListChecks },
  { key: "dashboard", path: "/dashboard", icon: LayoutDashboard },
  { key: "roadmap", path: "/roadmap", icon: CalendarRange },
  { key: "cycles", path: "/cycles", icon: Repeat },
  // App desktop : pas de membres, on y travaille seul avec ses agents.
  ...(IS_DESKTOP ? [] : [{ key: "members" as const, path: "/members", icon: Users }]),
  { key: "analytics", path: "/analytics", icon: Activity },
  { key: "progress", path: `/${PROGRESS}`, icon: TrendingUp },
]

/** Le titre d'une conversation, son état en un point, et la corbeille au survol. */
function ConversationItem({ conversation, state, active, onPick, onDelete, sub }: Readonly<{
  conversation: ConversationSummary
  state: WorkState
  active: boolean
  onPick: () => void
  onDelete: () => void
  /** Sous un projet (une ligne de son sous-menu), ou dans la liste des conversations sans projet. */
  sub: boolean
}>) {
  const label = usePreferencesStore((s) => s.t.window.deleteConversation)
  const inner = (
    <button type="button" onClick={onPick} className="pr-7">
      <WorkDot state={state} />
      <span>{conversation.title}</span>
    </button>
  )
  const remove = (
    <button
      type="button"
      onClick={onDelete}
      aria-label={label}
      title={label}
      className={cn(
        "absolute right-1 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity duration-150 hover:text-destructive focus-visible:opacity-100",
        sub ? "group-hover/menu-sub-item:opacity-100" : "group-hover/menu-item:opacity-100",
      )}
    >
      <Trash2 className="size-4" />
    </button>
  )
  return sub ? (
    <SidebarMenuSubItem>
      <SidebarMenuSubButton asChild isActive={active} size="sm">{inner}</SidebarMenuSubButton>
      {remove}
    </SidebarMenuSubItem>
  ) : (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active}>{inner}</SidebarMenuButton>
      {remove}
    </SidebarMenuItem>
  )
}

/** Une mission en cours sous son projet : son état en un point ; un clic ouvre sa vue du travail dans le volet. */
function MissionItem({ slug, run, onPick }: Readonly<{ slug: string; run: DeliveryRun; onPick: () => void }>) {
  const { openMission } = usePaneNavigation()
  if (run.projectId === null) return null
  return (
    <SidebarMenuSubItem>
      <SidebarMenuSubButton asChild size="sm">
        <PaneLink href={missionPath(slug, run.id)} open={() => { onPick(); openMission(run.id) }}>
          <WorkDot state={runState(run)} />
          <span>{runLabel(run)}</span>
        </PaneLink>
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  )
}

/** « N more » : déplie le reste d'une liste. */
function MoreItems({ count, onShow, sub }: Readonly<{ count: number; onShow: () => void; sub: boolean }>) {
  const label = usePreferencesStore((s) => fillText(s.t.window.showMore, { count }))
  if (count <= 0) return null
  const inner = <button type="button" onClick={onShow} className="text-muted-foreground"><span>{label}</span></button>
  return sub ? (
    <SidebarMenuSubItem><SidebarMenuSubButton asChild size="sm">{inner}</SidebarMenuSubButton></SidebarMenuSubItem>
  ) : (
    <SidebarMenuItem><SidebarMenuButton asChild size="sm">{inner}</SidebarMenuButton></SidebarMenuItem>
  )
}

/**
 * La barre de gauche de la fenêtre (R121, séance n°18) : le travail et ses conversations. En haut, « New
 * conversation », « Search » (Ctrl+K) et « Waiting for you » avec son nombre, qui remplace l'Inbox et la cloche. Puis
 * chaque projet : son nom ouvre son tableau dans le volet ; dessous, ses conversations et ses missions en cours, chacune
 * avec son état en un point ; une mission ouvre sa vue du travail. Puis les conversations sans projet, puis « More »,
 * replié. En bas, la personne. 16rem ; Ctrl+B la replie. Sous `lg` dans la webapp, c'est un tiroir, qui se ferme au
 * choix d'une ligne.
 */
export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()
  const params = useParams()
  const slug = typeof params?.workspace === "string" ? params.workspace : ""
  const t = usePreferencesStore((s) => s.t.window)
  const modKey = useModKeyLabel()
  const { isMobile, setOpenMobile } = useSidebar()
  const now = useNow(60_000)

  const projects = useProjectStore((s) => s.projects)
  const conversations = useCortexStore((s) => s.conversations)
  const conversationId = useCortexStore((s) => s.conversationId)
  const answering = useCortexStore((s) => s.sentAt !== null)
  const unread = useCortexStore((s) => s.unread)
  const newConversation = useCortexStore((s) => s.newConversation)
  const openConversation = useCortexStore((s) => s.openConversation)
  const removeConversation = useCortexStore((s) => s.removeConversation)
  const setOpen = useCortexStore((s) => s.setOpen)
  const runs = useDeliveryStore((s) => s.workspaceRuns)
  const signals = useNotificationStore((s) => s.signals)
  const me = useUserStore((s) => s.user?.id)
  const setSearchOpen = useWindowStore((s) => s.setSearchOpen)
  const openCreateProject = useCreateProjectStore((s) => s.openCreateProject)
  const [expanded, setExpanded] = React.useState<ReadonlySet<string>>(new Set())

  const shown = React.useMemo(() => leftBarProjects(projects), [projects])
  const groups = React.useMemo(() => groupConversations(conversations, shown), [conversations, shown])
  const live = React.useMemo(() => liveRuns(runs, me, now), [runs, me, now])
  const waiting = waitingCount(signals, runs, me)
  const href = (path: string) => `/${slug}${path}`
  const isAt = (path: string) => pathname === href(path) || pathname.startsWith(`${href(path)}/`)
  const inMore = MORE.some((item) => isAt(item.path))

  /** Sur un téléphone, la barre est un tiroir : un choix le ferme. */
  const done = () => {
    if (isMobile) setOpenMobile(false)
  }

  /** La conversation qu'on ouvre ou qu'on commence se voit : repliée dans le compositeur, elle se déplie. */
  const focusComposer = () => {
    setOpen(true)
    done()
    document.getElementById("command-bar-input")?.focus()
  }

  const startNew = () => {
    newConversation()
    focusComposer()
  }

  const pick = (id: number) => {
    void openConversation(slug, id)
    focusComposer()
  }

  const stateOf = (id: number): WorkState => {
    if (id !== conversationId) return "done"
    if (answering) return "working"
    return unread ? "waiting" : "done"
  }

  const conversationItem = (conversation: ConversationSummary, sub: boolean) => (
    <ConversationItem
      key={conversation.id}
      conversation={conversation}
      state={stateOf(conversation.id)}
      active={conversation.id === conversationId}
      onPick={() => pick(conversation.id)}
      onDelete={() => void removeConversation(slug, conversation.id)}
      sub={sub}
    />
  )

  const showAll = (key: string) => setExpanded((current) => new Set(current).add(key))
  const capped = (list: ConversationSummary[], key: string, max: number) =>
    expanded.has(key) ? list : list.slice(0, max)

  return (
    <Sidebar
      collapsible="offcanvas"
      variant={IS_DESKTOP ? "inset" : "sidebar"}
      className="overflow-x-hidden"
      {...props}
    >
      {/* La marque, sur la hauteur de la ligne du haut ; dans l'app desktop, elle déplace la fenêtre. */}
      <SidebarHeader className={cn("h-11 flex-row items-center gap-2 px-4 py-0", IS_DESKTOP && "desktop-drag")}>
        <Image src={LOGO_SRC} alt="" width={144} height={94} className="h-4 w-auto dark:invert" />
        <span className="text-[13px] font-semibold tracking-tight text-sidebar-foreground">TaskForce</span>
      </SidebarHeader>

      <SidebarContent className="overflow-x-hidden">
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={startNew}>
                <SquarePen />
                <span>{t.newConversation}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={() => { done(); setSearchOpen(true) }}>
                <Search />
                <span>{t.search}</span>
              </SidebarMenuButton>
              <Kbd className="pointer-events-none absolute right-1.5 top-1.5 hidden gap-0.5 md:inline-flex">
                <span>{modKey}</span><span>K</span>
              </Kbd>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isAt("/inbox")}>
                <Link href={href("/inbox")} onClick={done}>
                  <Inbox />
                  <span>{t.waitingForYou}</span>
                </Link>
              </SidebarMenuButton>
              {waiting > 0 && <SidebarMenuBadge>{waiting}</SidebarMenuBadge>}
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel asChild>
            <Link href={href("/projects")} onClick={done}>{t.projects}</Link>
          </SidebarGroupLabel>
          <SidebarGroupAction onClick={() => openCreateProject()} aria-label={t.newProject} title={t.newProject}>
            <Plus />
          </SidebarGroupAction>
          <SidebarMenu>
            {shown.map((project) => {
              const board = boardPath(slug, project.id)
              const missions = live.filter((run) => run.projectId === project.id)
              const talks = groups.byProject.get(project.id) ?? []
              const key = `project-${project.id}`
              return (
                <SidebarMenuItem key={project.id}>
                  <SidebarMenuButton asChild isActive={pathname === board || pathname.startsWith(`${board}/`)}>
                    <Link href={board} onClick={done}>
                      <ProjectIcon iconUrl={project.iconUrl} color={project.color} name={project.name} size={16} />
                      <span>{project.name}</span>
                    </Link>
                  </SidebarMenuButton>
                  {(missions.length > 0 || talks.length > 0) && (
                    <SidebarMenuSub>
                      {missions.map((run) => <MissionItem key={`run-${run.id}`} slug={slug} run={run} onPick={done} />)}
                      {capped(talks, key, UNDER_PROJECT).map((conversation) => conversationItem(conversation, true))}
                      {!expanded.has(key) && (
                        <MoreItems count={talks.length - UNDER_PROJECT} onShow={() => showAll(key)} sub />
                      )}
                    </SidebarMenuSub>
                  )}
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroup>

        {groups.loose.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>{t.conversations}</SidebarGroupLabel>
            <SidebarMenu>
              {capped(groups.loose, "loose", LOOSE).map((conversation) => conversationItem(conversation, false))}
              {!expanded.has("loose") && (
                <MoreItems count={groups.loose.length - LOOSE} onShow={() => showAll("loose")} sub={false} />
              )}
            </SidebarMenu>
          </SidebarGroup>
        )}

        <SidebarGroup>
          <Collapsible defaultOpen={inMore} className="group/more">
            <SidebarMenu>
              <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton className="text-muted-foreground">
                    <ChevronRight className="transition-transform duration-150 ease-out group-data-[state=open]/more:rotate-90 motion-reduce:transition-none" />
                    <span>{t.more}</span>
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {MORE.map((item) => (
                      <SidebarMenuSubItem key={item.key}>
                        <SidebarMenuSubButton asChild isActive={isAt(item.path)} size="sm">
                          <Link href={href(item.path)} onClick={done}>
                            <item.icon />
                            <span>{t[item.key]}</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </SidebarMenu>
          </Collapsible>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <NavUser />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
