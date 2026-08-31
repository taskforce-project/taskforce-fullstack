"use client"

import * as React from "react"
import { ChevronsUpDown, Plus, Building2, Crown } from "lucide-react"
import { useRouter } from "next/navigation"
import { useUserStore } from "@/lib/store/user-store"
import { useUpgradeStore } from "@/lib/store/upgrade-store"
import { planLimit } from "@/lib/config/plan-limits"
import { usePreferencesStore } from "@/lib/store/preferences-store"

import {
  DropdownMenu,
  DropdownMenuContent,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { WorkspaceAvatar } from "@/components/ui/workspace-avatar"
import { useWorkspaceStore } from "@/lib/store/workspace-store"

export function WorkspaceSwitcher() {
  const { isMobile } = useSidebar()
  const router = useRouter()

  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace)
  const planType = useUserStore((s) => s.user?.planType)
  const openUpgrade = useUpgradeStore((s) => s.openUpgrade)
  const fetchWorkspaces = useWorkspaceStore((s) => s.fetchWorkspaces)
  const createWorkspace = useWorkspaceStore((s) => s.createWorkspace)
  const { t } = usePreferencesStore()

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [newName, setNewName] = React.useState("")
  const [newTemplate, setNewTemplate] = React.useState("BLANK")
  const [creating, setCreating] = React.useState(false)

  const workspacesLoaded = useWorkspaceStore((s) => s.workspacesLoaded)

  // Charger la liste une seule fois
  React.useEffect(() => {
    if (!workspacesLoaded) {
      fetchWorkspaces()
    }
  }, [workspacesLoaded, fetchWorkspaces])

  const handleSwitch = (slug: string) => {
    router.push(`/${slug}/dashboard`)
  }

  const handleCreate = async () => {
    if (!newName.trim()) return
    setCreating(true)
    const workspace = await createWorkspace({ name: newName.trim(), brainTemplate: newTemplate })
    setCreating(false)
    if (workspace) {
      setDialogOpen(false)
      setNewName("")
      setNewTemplate("BLANK")
      router.push(`/${workspace.slug}/dashboard`)
    }
  }

  const displayName = activeWorkspace?.name ?? "Workspace"

  // Distinction façon orgs GitHub : « Vos espaces » (flag `personal` renseigné par le backend =
  // je suis propriétaire) vs « Partagés avec vous » (ceux d'autrui, où j'ai été invité). Seuls les
  // espaces possédés comptent pour le quota de création - être invité ailleurs ne le bloque pas.
  const owned = workspaces.filter((ws) => ws.personal)
  const shared = workspaces.filter((ws) => !ws.personal)
  const ownedCount = owned.length

  const renderWorkspaceItem = (ws: (typeof workspaces)[number]) => (
    <DropdownMenuItem
      key={ws.uuid}
      onClick={() => handleSwitch(ws.slug)}
      className="gap-2 p-2"
      data-active={ws.slug === activeWorkspace?.slug}
    >
      <WorkspaceAvatar
        name={ws.name}
        seed={ws.slug ?? ws.uuid}
        logoUrl={ws.logoUrl}
        className="size-6"
        textClassName="text-[10px]"
      />
      <span className="flex-1 truncate">{ws.name}</span>
      {ws.slug === activeWorkspace?.slug && (
        <span className="ml-auto text-xs text-muted-foreground">{t.shell.active}</span>
      )}
    </DropdownMenuItem>
  )

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
                <WorkspaceAvatar
                  name={displayName}
                  seed={activeWorkspace?.slug ?? activeWorkspace?.uuid}
                  logoUrl={activeWorkspace?.logoUrl}
                  className="size-8"
                />
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{displayName}</span>
                  <span className="truncate text-xs text-muted-foreground">{activeWorkspace?.slug ?? ""}</span>
                </div>
                <ChevronsUpDown className="ml-auto" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
              align="start"
              side={isMobile ? "bottom" : "right"}
              sideOffset={4}
            >
              {owned.length > 0 && (
                <>
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    {t.shell.yourWorkspaces}
                  </DropdownMenuLabel>
                  {owned.map(renderWorkspaceItem)}
                </>
              )}
              {shared.length > 0 && (
                <>
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    {t.shell.sharedWorkspaces}
                  </DropdownMenuLabel>
                  {shared.map(renderWorkspaceItem)}
                </>
              )}
              <DropdownMenuSeparator />
              {(() => {
                const limit = planLimit(planType, "workspaces")
                const atLimit = ownedCount >= limit
                return (
                  <>
                    {Number.isFinite(limit) && (
                      <div className="px-2 py-1 text-[11px] text-muted-foreground">
                        {t.shell.workspacesCount.replace("{count}", String(ownedCount)).replace("{limit}", String(limit))}
                      </div>
                    )}
                    {atLimit ? (
                      <DropdownMenuItem
                        className="gap-2 p-2 cursor-pointer"
                        onClick={() => openUpgrade()}
                      >
                        <div className="flex size-6 items-center justify-center rounded-md border bg-transparent">
                          <Crown className="size-4 text-amber-500" />
                        </div>
                        <span className="font-medium text-amber-500">{t.shell.limitReachedUpgrade}</span>
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        className="gap-2 p-2 cursor-pointer"
                        onClick={() => setDialogOpen(true)}
                      >
                        <div className="flex size-6 items-center justify-center rounded-md border bg-transparent">
                          <Plus className="size-4" />
                        </div>
                        <span className="font-medium text-muted-foreground">{t.shell.newWorkspace}</span>
                      </DropdownMenuItem>
                    )}
                  </>
                )
              })()}
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      {/* Dialog de création */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="size-5" />
              {t.shell.createWorkspace}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label htmlFor="workspace-name">{t.shell.workspaceName}</Label>
              <Input
                id="workspace-name"
                placeholder={t.shell.workspaceNamePlaceholder}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="workspace-template">{t.shell.brainTemplate}</Label>
              <Select value={newTemplate} onValueChange={setNewTemplate}>
                <SelectTrigger id="workspace-template">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BLANK">{t.shell.templateBlank}</SelectItem>
                  <SelectItem value="SAAS">{t.shell.templateSaas}</SelectItem>
                  <SelectItem value="ECOMMERCE">{t.shell.templateEcommerce}</SelectItem>
                  <SelectItem value="MARKETPLACE">{t.shell.templateMarketplace}</SelectItem>
                  <SelectItem value="AGENTIC">{t.shell.templateAgentic}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t.shell.templateHint}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button onClick={handleCreate} disabled={!newName.trim() || creating}>
              {creating ? t.shell.creating : t.common.createNew}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** @deprecated Utiliser WorkspaceSwitcher à la place */
export function TeamSwitcher() {
  return <WorkspaceSwitcher />
}

