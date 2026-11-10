"use client"

import * as React from "react"
import Link from "next/link"
import { useTheme } from "next-themes"
import {
  BadgeCheck,
  Bell,
  ChevronsUpDown,
  CircleHelp,
  LogOut,
  Monitor,
  Moon,
  Settings2,
  Sun,
} from "lucide-react"

import { CreateWorkspaceDialog, WorkspacesSubmenu } from "@/components/layout/sidebar/workspaces-menu"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { UserAvatar } from "@/components/ui/user-avatar"
import { analyticsConfigured, openConsentPreferences } from "@/lib/analytics/consent"
import { appVersion } from "@/lib/app-version"
import { useAuth } from "@/lib/contexts/auth-context"
import { IS_DESKTOP } from "@/lib/desktop"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { useSettingsStore } from "@/lib/store/settings-store"
import { useWorkspaceStore } from "@/lib/store/workspace-store"
import { getAvatarUrl } from "@/lib/utils/avatar"

const HELP_URL = "https://docs.taskforce-project.fr"

/**
 * La personne, en bas de la barre de gauche (R121) : l'espace où elle est, et un menu qui tient ce que la barre du haut
 * et le menu du compte portaient : changer d'espace, les réglages, l'aide, le thème (clair, sombre, ou celui du
 * système), la déconnexion, puis les textes légaux et la version qui tourne, le commit au survol.
 */
export function NavUser() {
  const { isMobile } = useSidebar()
  const { user, logout } = useAuth()
  const openSettings = useSettingsStore((s) => s.openSettings)
  const workspace = useWorkspaceStore((s) => s.activeWorkspace)
  const { t } = usePreferencesStore()
  const { theme, setTheme } = useTheme()
  const [creating, setCreating] = React.useState(false)
  const version = appVersion()

  const name = user ? (user.displayName ?? `${user.firstName} ${user.lastName}`) : "…"
  const email = user?.email ?? ""
  const avatar = user ? getAvatarUrl(user) : ""

  // logout() fait déjà un rechargement complet vers /auth/login (vide les stores en mémoire : pas de mélange de comptes
  // sur un même navigateur). Pas de router.push ici.
  const handleLogout = async () => {
    await logout()
  }

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                <UserAvatar email={email} name={name} avatarUrl={avatar} className="size-8" />
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{name}</span>
                  <span className="truncate text-xs text-muted-foreground">{workspace?.name ?? email}</span>
                </div>
                <ChevronsUpDown className="ml-auto size-4" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-(--radix-dropdown-menu-trigger-width) min-w-60 rounded-lg"
              side={isMobile ? "bottom" : "right"}
              align="end"
              sideOffset={4}
            >
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <UserAvatar email={email} name={name} avatarUrl={avatar} className="size-8" />
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{name}</span>
                    <span className="truncate text-xs text-muted-foreground">{email}</span>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <WorkspacesSubmenu onCreate={() => setCreating(true)} />
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => openSettings()}>
                  <Settings2 />
                  {t.window.settings}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openSettings("profile")}>
                  <BadgeCheck />
                  {t.settings.profile}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openSettings("notifications")}>
                  <Bell />
                  {t.common.notifications}
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="gap-2">
                    <Sun className="size-4 text-muted-foreground" />
                    {t.window.theme}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
                      <DropdownMenuRadioItem value="light"><Sun /> {t.window.light}</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="dark"><Moon /> {t.window.dark}</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="system"><Monitor /> {t.window.system}</DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuItem asChild>
                  <a href={HELP_URL} target="_blank" rel="noreferrer">
                    <CircleHelp />
                    {t.window.help}
                  </a>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut />
                {t.common.logout}
              </DropdownMenuItem>
              {/* Ce que le pied de page portait dans l'app (revue UX du 01/11/2026) : les textes légaux, le choix des
                  cookies quand des statistiques sont configurées, et la version qui tourne, le commit au survol. */}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild className="text-xs text-muted-foreground">
                <Link href="/privacy-policy">{t.shell.privacy}</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="text-xs text-muted-foreground">
                <Link href="/legal-notices">{t.shell.legalNotices}</Link>
              </DropdownMenuItem>
              {!IS_DESKTOP && analyticsConfigured() && (
                <DropdownMenuItem className="text-xs text-muted-foreground" onClick={openConsentPreferences}>
                  {t.shell.manageCookies}
                </DropdownMenuItem>
              )}
              <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground/70" title={version.title}>
                TaskForce {version.label}
              </DropdownMenuLabel>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
      <CreateWorkspaceDialog open={creating} onOpenChange={setCreating} />
    </>
  )
}
