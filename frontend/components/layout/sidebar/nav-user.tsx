"use client"

import Link from "next/link"
import {
  BadgeCheck,
  Bell,
  ChevronsUpDown,
  LogOut,
} from "lucide-react"

import { UserAvatar } from "@/components/ui/user-avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { useAuth } from "@/lib/contexts/auth-context"
import { analyticsConfigured, openConsentPreferences } from "@/lib/analytics/consent"
import { appVersion } from "@/lib/app-version"
import { IS_DESKTOP } from "@/lib/desktop"
import { useSettingsStore } from "@/lib/store/settings-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"

export function NavUser({
  user,
}: {
  readonly user: {
    readonly name: string
    readonly email: string
    readonly avatar: string
  }
}) {
  const { isMobile } = useSidebar()
  const { logout } = useAuth()
  const openSettings = useSettingsStore((s) => s.openSettings)
  const { t } = usePreferencesStore()
  const version = appVersion()

  const handleLogout = async () => {
    // logout() fait déjà un reload dur vers /auth/login (vide les stores Zustand en mémoire
    // → plus de mélange de comptes sur un même navigateur). Pas de router.push ici. QA2.
    await logout()
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <UserAvatar
                email={user.email}
                name={user.name}
                avatarUrl={user.avatar}
                className="h-8 w-8"
              />
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="flex items-center gap-1.5">
                  <span className="truncate font-medium">{user.name}</span>
                </span>
                <span className="truncate text-xs">{user.email}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <UserAvatar
                  email={user.email}
                  name={user.name}
                  avatarUrl={user.avatar}
                  className="h-8 w-8"
                />
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate font-medium">{user.name}</span>
                  </span>
                  <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => openSettings("profile")}>
                <BadgeCheck />
                {t.settings.profile}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openSettings("notifications")}>
                <Bell />
                {t.common.notifications}
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
  )
}
