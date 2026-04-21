"use client"

import * as React from "react"
import { ChevronsUpDown, Plus, Building2 } from "lucide-react"
import { useRouter } from "next/navigation"

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
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { useWorkspaceStore } from "@/lib/store/workspace-store"

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")
}

export function WorkspaceSwitcher() {
  const { isMobile } = useSidebar()
  const router = useRouter()

  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace)
  const fetchWorkspaces = useWorkspaceStore((s) => s.fetchWorkspaces)
  const createWorkspace = useWorkspaceStore((s) => s.createWorkspace)

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [newName, setNewName] = React.useState("")
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
    const workspace = await createWorkspace({ name: newName.trim() })
    setCreating(false)
    if (workspace) {
      setDialogOpen(false)
      setNewName("")
      router.push(`/${workspace.slug}/dashboard`)
    }
  }

  const displayName = activeWorkspace?.name ?? "Workspace"
  const initials = getInitials(displayName)

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
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground text-xs font-bold">
                  {activeWorkspace?.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={activeWorkspace.logoUrl} alt={displayName} className="size-8 rounded-lg object-cover" />
                  ) : (
                    initials
                  )}
                </div>
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
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Workspaces
              </DropdownMenuLabel>
              {workspaces.map((ws) => (
                <DropdownMenuItem
                  key={ws.uuid}
                  onClick={() => handleSwitch(ws.slug)}
                  className="gap-2 p-2"
                  data-active={ws.slug === activeWorkspace?.slug}
                >
                  <div className="flex size-6 items-center justify-center rounded-md border text-xs font-semibold">
                    {ws.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={ws.logoUrl} alt={ws.name} className="size-6 rounded-md object-cover" />
                    ) : (
                      getInitials(ws.name)
                    )}
                  </div>
                  <span className="flex-1 truncate">{ws.name}</span>
                  {ws.slug === activeWorkspace?.slug && (
                    <span className="ml-auto text-xs text-muted-foreground">actif</span>
                  )}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="gap-2 p-2 cursor-pointer"
                onClick={() => setDialogOpen(true)}
              >
                <div className="flex size-6 items-center justify-center rounded-md border bg-transparent">
                  <Plus className="size-4" />
                </div>
                <span className="font-medium text-muted-foreground">Nouveau workspace</span>
              </DropdownMenuItem>
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
              Créer un workspace
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label htmlFor="workspace-name">Nom du workspace</Label>
              <Input
                id="workspace-name"
                placeholder="Mon équipe"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleCreate} disabled={!newName.trim() || creating}>
              {creating ? "Création..." : "Créer"}
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

