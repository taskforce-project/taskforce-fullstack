"use client"

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
                {t.settings.account}
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
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
