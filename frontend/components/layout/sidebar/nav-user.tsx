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

  const isPro = authUser?.planType === "PRO" || authUser?.planType === "ENTERPRISE"

  const handleLogout = async () => {
    await logout()
    router.push("/auth/login")
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
                <span className="truncate font-medium">{user.name}</span>
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
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {/* CTA upgrade — uniquement si le plan n'est pas Pro (évite le séparateur orphelin) */}
            {!isPro && (
              <>
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onClick={openUpgrade}
                    className="gap-2 text-amber-600 focus:text-amber-600 dark:text-amber-500 dark:focus:text-amber-500"
                  >
                    <Sparkles className="size-4" />
                    <span className="font-medium">Passer à Pro</span>
                    <Badge variant="secondary" className="ml-auto h-5 px-1.5 text-[10px]">Free</Badge>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => router.push(`/${slug}/profile`)}>
                <BadgeCheck />
                Account
                {isPro && (
                  <Badge className="ml-auto h-5 bg-primary px-1.5 text-[10px] text-primary-foreground">Pro</Badge>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push(`/${slug}/settings?section=billing`)}>
                <CreditCard />
                Billing
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push(`/${slug}/settings?section=notifications`)}>
                <Bell />
                Notifications
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout}>
              <LogOut />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
