"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Radio,
  ListTodo,
  Layers,
  Activity,
  Cpu,
  User,
  MessagesSquare,
  MessageSquare,
  Settings2,
  HelpCircle,
  Plus,
  ChevronRight,
  Lock,
} from "lucide-react"

import { NavUser } from "@/components/layout/sidebar/nav-user"
import { WorkspaceSwitcher } from "@/components/layout/sidebar/team-switcher"
import { getAvatarUrl } from "@/lib/utils/avatar"
import { useAuth } from "@/lib/contexts/auth-context"
import { useTranslation } from "@/lib/i18n"
import { useWorkspaceStore } from "@/lib/store/workspace-store"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

// ─── Types ────────────────────────────────────────────────────────────────────

type NavItem = {
  readonly key: string
  readonly url: string
  readonly icon: React.ElementType
  readonly badge?: string
  readonly comingSoon?: boolean
  readonly requiresRole?: readonly string[]
  readonly requiresPlan?: readonly string[]
  readonly items?: readonly {
    readonly key: string
    readonly url: string
  }[]
}

// ─── Nav groups — operations-centric information architecture ─────────────────

const NAV_COMMAND: readonly NavItem[] = [
  {
    key: "nav.dashboard",
    url: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    key: "nav.inbox",
    url: "/inbox",
    icon: Radio,
    items: [
      { key: "nav.sub.allNotifications", url: "/inbox" },
      { key: "nav.sub.mentions",         url: "/inbox/mentions" },
      { key: "nav.sub.alerts",           url: "/inbox/alerts" },
      { key: "nav.sub.assignments",      url: "/inbox/assignments" },
    ],
  },
  {
    key: "nav.myWork",
    url: "/my-work",
    icon: ListTodo,
    items: [
      { key: "nav.sub.myAll",    url: "/my-work" },
      { key: "nav.sub.myIssues", url: "/my-work/issues" },
      { key: "nav.sub.myCycles", url: "/my-work/cycles" },
      { key: "nav.sub.myPages",  url: "/my-work/pages" },
    ],
  },
]

const NAV_WORK: readonly NavItem[] = [
  {
    key: "nav.projects",
    url: "/projects",
    icon: Layers,
  },
  {
    key: "nav.analytics",
    url: "/analytics",
    icon: Activity,
  },
  {
    key: "nav.agents",
    url: "/agents",
    icon: Cpu,
    comingSoon: true,
  },
]

const NAV_PEOPLE: readonly NavItem[] = [
  {
    key: "nav.members",
    url: "/members",
    icon: User,
  },
  // Teams retiré du menu (QA2-21) — désormais géré par opération (onglet Members du projet).
]

const NAV_COMMS: readonly NavItem[] = [
  {
    key: "nav.messages",
    url: "/messages",
    icon: MessagesSquare,
    comingSoon: true, // chat 100% mock (components/messages/data.ts) — verrouillé tant que non câblé au backend réel
  },
  {
    key: "nav.discussions",
    url: "/discussions",
    icon: MessageSquare,
    comingSoon: true,
  },
]

const NAV_BOTTOM: readonly NavItem[] = [
  {
    key: "nav.settings",
    url: "/settings",
    icon: Settings2,
  },
  {
    key: "nav.help",
    url: "/help",
    icon: HelpCircle,
  },
]

// ─── Component ────────────────────────────────────────────────────────────────

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user } = useAuth()
  const { t } = useTranslation()
  const pathname = usePathname()
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace)
  const slug = activeWorkspace?.slug ?? ""

  const withSlug = (url: string) => (slug ? `/${slug}${url}` : url)

  const navUser = user
    ? {
        name: user.displayName ?? `${user.firstName} ${user.lastName}`,
        email: user.email,
        avatar: getAvatarUrl(user),
      }
    : { name: "...", email: "...", avatar: "" }

  const isActive = (url: string) => {
    const full = withSlug(url)
    return pathname === full || pathname.startsWith(`${full}/`)
  }

  const canAccess = (item: NavItem) => {
    if (item.requiresPlan && user?.planType) {
      if (!item.requiresPlan.includes(user.planType)) return false
    }
    return true
  }

  const renderItem = (item: NavItem) => {
    if (item.comingSoon) {
      return (
        <SidebarMenuItem key={item.key}>
          <SidebarMenuButton
            tooltip={`${t(item.key)} — ${t("nav.comingSoon")}`}
            aria-disabled
            className="cursor-not-allowed opacity-60 hover:bg-transparent"
          >
            <item.icon />
            <span>{t(item.key)}</span>
            <span className="ml-auto flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground group-data-[collapsible=icon]:hidden">
              <Lock className="size-3" />
              {t("nav.comingSoon")}
            </span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      )
    }

    if (item.items) {
      return (
        <Collapsible
          key={item.key}
          defaultOpen={isActive(item.url)}
          className="group/collapsible"
          asChild
        >
          <SidebarMenuItem>
            <CollapsibleTrigger asChild>
              <SidebarMenuButton tooltip={t(item.key)} isActive={isActive(item.url)}>
                <item.icon />
                <span>{t(item.key)}</span>
                <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
              </SidebarMenuButton>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarMenuSub>
                {item.items.map((sub) => (
                  <SidebarMenuSubItem key={sub.key}>
                    <SidebarMenuSubButton asChild isActive={isActive(sub.url)}>
                      <Link href={withSlug(sub.url)}>{t(sub.key)}</Link>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                ))}
              </SidebarMenuSub>
            </CollapsibleContent>
          </SidebarMenuItem>
        </Collapsible>
      )
    }

    return (
      <SidebarMenuItem key={item.key}>
        <SidebarMenuButton asChild tooltip={t(item.key)} isActive={isActive(item.url)}>
          <Link href={withSlug(item.url)}>
            <item.icon />
            <span>{t(item.key)}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    )
  }

  return (
    <Sidebar collapsible="icon" className="overflow-x-hidden" {...props}>
      {/* QA2-27 : hauteur alignée sur la topbar (h-14) → le séparateur tombe au même niveau que la bordure du breadcrumb */}
      <SidebarHeader className="h-14 justify-center py-0">
        <WorkspaceSwitcher />
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent className="overflow-x-hidden">

        {/* Command — daily driver surfaces */}
        <SidebarGroup>
          <SidebarGroupLabel>Command</SidebarGroupLabel>
          <SidebarMenu>
            {NAV_COMMAND.filter(canAccess).map(renderItem)}
          </SidebarMenu>
        </SidebarGroup>

        {/* Work — ops, intelligence, agents */}
        <SidebarGroup>
          <SidebarGroupLabel>Work</SidebarGroupLabel>
          <SidebarMenu>
            {NAV_WORK.filter(canAccess).map(renderItem)}
          </SidebarMenu>
        </SidebarGroup>

        {/* People */}
        <SidebarGroup>
          <SidebarGroupLabel>People</SidebarGroupLabel>
          <SidebarMenu>
            {NAV_PEOPLE.filter(canAccess).map(renderItem)}
          </SidebarMenu>
        </SidebarGroup>

        {/* Comms */}
        <SidebarGroup>
          <SidebarGroupLabel>Comms</SidebarGroupLabel>
          <SidebarMenu>
            {NAV_COMMS.filter(canAccess).map(renderItem)}
          </SidebarMenu>
        </SidebarGroup>

        {/* Quick create */}
        <SidebarGroup className="group-data-[collapsible=icon]:hidden mt-auto">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild className="text-muted-foreground">
                <Link href={`/${activeWorkspace?.slug}/projects?new=1`}>
                  <Plus className="size-4" />
                  <span>{t("nav.createProject")}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        <SidebarSeparator />

        {/* Settings / Help */}
        <SidebarGroup>
          <SidebarMenu>
            {NAV_BOTTOM.filter(canAccess).map(renderItem)}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarSeparator />

      <SidebarFooter>
        <NavUser user={navUser} />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
