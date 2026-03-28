"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Inbox,
  Briefcase,
  FolderKanban,
  BarChart3,
  Settings,
  HelpCircle,
  Plus,
  Zap,
  ChevronRight,
} from "lucide-react"

import { NavUser } from "@/components/layout/sidebar/nav-user"
import { useAuth } from "@/lib/contexts/auth-context"
import { useTranslation } from "@/lib/i18n"
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
import { Badge } from "@/components/ui/badge"

type NavItem = {
  readonly key: string
  readonly url: string
  readonly icon: React.ElementType
  readonly badge?: string
  readonly requiresRole?: readonly string[]
  readonly requiresPlan?: readonly string[]
  readonly items?: readonly {
    readonly key: string
    readonly url: string
  }[]
}

const NAV_MAIN: readonly NavItem[] = [
  {
    key: "nav.dashboard",
    url: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    key: "nav.inbox",
    url: "/inbox",
    icon: Inbox,
    items: [
      { key: "nav.sub.allNotifications", url: "/inbox" },
      { key: "nav.sub.mentions", url: "/inbox/mentions" },
      { key: "nav.sub.alerts", url: "/inbox/alerts" },
      { key: "nav.sub.assignments", url: "/inbox/assignments" },
    ],
  },
  {
    key: "nav.myWork",
    url: "/my-work",
    icon: Briefcase,
    items: [
      { key: "nav.sub.myIssues", url: "/my-work/issues" },
      { key: "nav.sub.myCycles", url: "/my-work/cycles" },
      { key: "nav.sub.myPages", url: "/my-work/pages" },
    ],
  },
  {
    key: "nav.projects",
    url: "/projects",
    icon: FolderKanban,
  },
  {
    key: "nav.analytics",
    url: "/analytics",
    icon: BarChart3,
    requiresPlan: ["pro", "enterprise"],
  },
]

const NAV_BOTTOM: readonly NavItem[] = [
  {
    key: "nav.settings",
    url: "/settings",
    icon: Settings,
  },
  {
    key: "nav.help",
    url: "/help",
    icon: HelpCircle,
  },
]

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user } = useAuth()
  const { t } = useTranslation()
  const pathname = usePathname()

  const navUser = user
    ? {
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        avatar: "",
      }
    : { name: "...", email: "...", avatar: "" }

  const isActive = (url: string) =>
    pathname === url || pathname.startsWith(`${url}/`)

  const canAccess = (item: NavItem) => {
    if (item.requiresRole && user?.role) {
      if (!item.requiresRole.includes(user.role)) return false
    }
    if (item.requiresPlan && user?.plan) {
      if (!item.requiresPlan.includes(user.plan)) return false
    }
    return true
  }

  return (
    <Sidebar collapsible="icon" className="overflow-x-hidden" {...props}>
      {/* Logo / Workspace header */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              size="lg"
              className="data-[state=open]:bg-sidebar-accent"
            >
              <Link href="/dashboard">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <Zap className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">TaskForce</span>
                  <span className="truncate text-xs capitalize text-muted-foreground">
                    {user?.plan ?? "free"}
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent className="overflow-x-hidden">
        {/* Main nav */}
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarMenu>
            {NAV_MAIN.filter(canAccess).map((item) =>
              item.items ? (
                <Collapsible
                  key={item.key}
                  defaultOpen={isActive(item.url)}
                  className="group/collapsible"
                  asChild
                >
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton
                        tooltip={t(item.key)}
                        isActive={isActive(item.url)}
                      >
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
                              <Link href={sub.url}>{t(sub.key)}</Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              ) : (
                <SidebarMenuItem key={item.key}>
                  <SidebarMenuButton
                    asChild
                    tooltip={t(item.key)}
                    isActive={isActive(item.url)}
                  >
                    <Link href={item.url}>
                      <item.icon />
                      <span>{t(item.key)}</span>
                      {item.badge && (
                        <Badge className="ml-auto size-5 justify-center rounded-full p-0 text-xs">
                          {item.badge}
                        </Badge>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            )}
          </SidebarMenu>
        </SidebarGroup>

        {/* Quick create project */}
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild className="text-muted-foreground">
                <Link href="/projects/new">
                  <Plus className="size-4" />
                  <span>{t("nav.createProject")}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        <SidebarSeparator />

        {/* Bottom nav (settings / admin) */}
        <SidebarGroup>
          <SidebarMenu>
            {NAV_BOTTOM.filter(canAccess).map((item) => (
              <SidebarMenuItem key={item.key}>
                <SidebarMenuButton
                  asChild
                  tooltip={t(item.key)}
                  isActive={isActive(item.url)}
                >
                  <Link href={item.url}>
                    <item.icon />
                    <span>{t(item.key)}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
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

