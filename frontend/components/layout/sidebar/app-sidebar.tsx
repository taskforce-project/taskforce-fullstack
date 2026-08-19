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
  Brain,
  User,
  Settings2,
  HelpCircle,
  Plus,
  ChevronRight,
  Lock,
  FlaskConical,
} from "lucide-react"

import { NavUser } from "@/components/layout/sidebar/nav-user"
import { WorkspaceSwitcher } from "@/components/layout/sidebar/team-switcher"
import { getAvatarUrl } from "@/lib/utils/avatar"
import { useAuth } from "@/lib/contexts/auth-context"
import { useTranslation } from "@/lib/i18n"
import { useWorkspaceStore } from "@/lib/store/workspace-store"
import { useSettingsStore } from "@/lib/store/settings-store"
import { useCreateProjectStore } from "@/lib/store/create-project-store"
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
  useSidebar,
} from "@/components/ui/sidebar"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

// ─── Types ────────────────────────────────────────────────────────────────────

type NavItem = {
  readonly key: string
  readonly url: string
  readonly icon: React.ElementType
  readonly badge?: string
  readonly comingSoon?: boolean
  /** Feature en cours de finition → petite fiole bleue (info) dans la sidebar + bandeau « Lab » sur la page. */
  readonly lab?: boolean
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
    lab: true, // Intelligence : données réelles mais en cours de finition (prédictions, dock, 3D).
  },
  {
    key: "nav.brain",
    url: "/brain",
    icon: Brain,
    lab: true, // Brain OS : Phase 0, en construction.
  },
  // Agents retiré (11/07/2026) : non construit, aucune utilité pour l'instant.
]

const NAV_PEOPLE: readonly NavItem[] = [
  {
    key: "nav.members",
    url: "/members",
    icon: User,
  },
  // Teams retiré du menu (QA2-21) — désormais géré par opération (onglet Members du projet).
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
  const openSettings = useSettingsStore((s) => s.openSettings)
  const openCreateProject = useCreateProjectStore((s) => s.openCreateProject)
  const { state, isMobile } = useSidebar()
  const slug = activeWorkspace?.slug ?? ""

  // Sidebar réduite au rail d'icônes (48px). En mobile elle s'ouvre en Sheet pleine largeur,
  // donc le mode « icône » ne s'applique pas.
  const collapsed = state === "collapsed" && !isMobile

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
      // Sidebar repliée : shadcn masque le sous-menu (`group-data-[collapsible=icon]:hidden` sur
      // SidebarMenuSub) et ce bouton n'est pas un lien → l'entrée serait totalement morte.
      // On bascule sur un DropdownMenu porté (même pattern que le sélecteur de workspace) :
      // il sort du rail de 48px, donc ni la largeur ni la règle de masquage ne s'appliquent.
      if (collapsed) {
        return (
          <SidebarMenuItem key={item.key}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  tooltip={t(item.key)}
                  isActive={isActive(item.url)}
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <item.icon />
                  <span>{t(item.key)}</span>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="start" sideOffset={4} className="min-w-48">
                <DropdownMenuLabel>{t(item.key)}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {item.items.map((sub) => (
                  <DropdownMenuItem key={sub.key} asChild>
                    <Link href={withSlug(sub.url)}>{t(sub.key)}</Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        )
      }

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

    // Settings ouvre le grand modal (façon Claude) plutôt qu'une page.
    if (item.key === "nav.settings") {
      return (
        <SidebarMenuItem key={item.key}>
          <SidebarMenuButton tooltip={t(item.key)} onClick={() => openSettings()}>
            <item.icon />
            <span>{t(item.key)}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      )
    }

    return (
      <SidebarMenuItem key={item.key}>
        <SidebarMenuButton asChild tooltip={t(item.key)} isActive={isActive(item.url)}>
          <Link href={withSlug(item.url)}>
            <item.icon />
            <span>{t(item.key)}</span>
            {item.lab && (
              <FlaskConical
                /* Identité Labs alignée sur le site : le TRAIT prend le dégradé (pêche→rose→bleu),
                   plus de violet plat. Cf. `.tf-labs-icon` + <LabsGradientDefs/>. */
                className="tf-labs-icon ml-auto size-3.5 shrink-0 group-data-[collapsible=icon]:hidden"
                strokeWidth={2}
                aria-label="Feature being finalized"
              />
            )}
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    )
  }

  return (
    <Sidebar collapsible="icon" className="overflow-x-hidden" data-tour="sidebar" {...props}>
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

        {/* Quick create */}
        <SidebarGroup className="group-data-[collapsible=icon]:hidden mt-auto">
          <SidebarMenu>
            <SidebarMenuItem>
              {/* Ouvre le modal GLOBAL en place (plus de navigation `?new=1` qui faisait clignoter le modal). */}
              <SidebarMenuButton onClick={openCreateProject} className="text-muted-foreground">
                <Plus className="size-4" />
                <span>{t("nav.createProject")}</span>
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
