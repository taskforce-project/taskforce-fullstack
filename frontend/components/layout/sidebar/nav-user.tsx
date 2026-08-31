"use client"

import { useRouter } from "next/navigation"
import {
  BadgeCheck,
  Bell,
  ChevronsUpDown,
  CreditCard,
  LogOut,
  Sparkles,
} from "lucide-react"

import { UserAvatar } from "@/components/ui/user-avatar"
import { Badge } from "@/components/ui/badge"
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
import { useWorkspaceStore } from "@/lib/store/workspace-store"
import { useUpgradeStore } from "@/lib/store/upgrade-store"
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
  const { logout, user: authUser } = useAuth()
  const router = useRouter()
  const slug = useWorkspaceStore((s) => s.activeWorkspace?.slug)
  const openUpgrade = useUpgradeStore((s) => s.openUpgrade)
  const openSettings = useSettingsStore((s) => s.openSettings)
  const { t } = usePreferencesStore()

  const isPro = authUser?.planType === "BUSINESS" || authUser?.planType === "ENTERPRISE"

  // Le plan s'affiche à côté du profil (façon Claude « Pierre · Max »), plus sur le CTA d'upgrade.
  const PLAN_LABELS: Record<string, string> = {
    FREE: "Free",
    BASIC: "Basic",
    BUSINESS: "Business",
    ENTERPRISE: "Enterprise",
  }
  const planLabel = PLAN_LABELS[authUser?.planType ?? "FREE"] ?? "Free"

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
                  <Badge variant="secondary" className="h-4 shrink-0 px-1 text-[9px] font-medium leading-none">
                    {planLabel}
                  </Badge>
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
                    <Badge variant="secondary" className="h-4 shrink-0 px-1 text-[9px] font-medium leading-none">
                      {planLabel}
                    </Badge>
                  </span>
                  <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {/* CTA upgrade - uniquement si le plan n'est pas Pro (évite le séparateur orphelin) */}
            {!isPro && (
              <>
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onClick={openUpgrade}
                    className="gap-2 text-amber-600 focus:text-amber-600 dark:text-amber-500 dark:focus:text-amber-500"
                  >
                    <Sparkles className="size-4" />
                    <span className="font-medium">{t.settings.upgrade}</span>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => openSettings("profile")}>
                <BadgeCheck />
                {t.settings.account}
                {isPro && (
                  <Badge className="ml-auto h-5 bg-primary px-1.5 text-[10px] text-primary-foreground">Pro</Badge>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push(`/${slug}/billing`)}>
                <CreditCard />
                {t.settings.billing}
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
