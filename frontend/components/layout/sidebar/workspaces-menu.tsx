"use client"

import * as React from "react"
import { Building2, Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { WorkspaceAvatar } from "@/components/ui/workspace-avatar"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { useWorkspaceStore } from "@/lib/store/workspace-store"

/**
 * Le choix de l'espace, dans le menu de la personne en bas de la barre de gauche (R121) : « Vos espaces » (le flag
 * `personal` du backend : je suis propriétaire) et « Partagés avec vous », puis « New workspace ». Changer d'espace
 * ouvre son tableau de bord, comme avant.
 */
export function WorkspacesSubmenu({ onCreate }: Readonly<{ onCreate: () => void }>) {
  const router = useRouter()
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace)
  const workspacesLoaded = useWorkspaceStore((s) => s.workspacesLoaded)
  const fetchWorkspaces = useWorkspaceStore((s) => s.fetchWorkspaces)
  const t = usePreferencesStore((s) => s.t.shell)
  const label = usePreferencesStore((s) => s.t.window.workspaces)

  // Charger la liste une seule fois
  React.useEffect(() => {
    if (!workspacesLoaded) void fetchWorkspaces()
  }, [workspacesLoaded, fetchWorkspaces])

  const owned = workspaces.filter((ws) => ws.personal)
  const shared = workspaces.filter((ws) => !ws.personal)

  const item = (ws: (typeof workspaces)[number]) => (
    <DropdownMenuItem
      key={ws.uuid}
      onClick={() => router.push(`/${ws.slug}/dashboard`)}
      className="gap-2"
      data-active={ws.slug === activeWorkspace?.slug}
    >
      <WorkspaceAvatar name={ws.name} seed={ws.slug ?? ws.uuid} logoUrl={ws.logoUrl} className="size-5" textClassName="text-[9px]" />
      <span className="flex-1 truncate">{ws.name}</span>
      {ws.slug === activeWorkspace?.slug && <span className="ml-auto text-xs text-muted-foreground">{t.active}</span>}
    </DropdownMenuItem>
  )

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="gap-2">
        <Building2 className="size-4 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{activeWorkspace?.name ?? label}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="min-w-56">
        {owned.length > 0 && (
          <>
            <DropdownMenuLabel className="text-xs text-muted-foreground">{t.yourWorkspaces}</DropdownMenuLabel>
            {owned.map(item)}
          </>
        )}
        {shared.length > 0 && (
          <>
            <DropdownMenuLabel className="text-xs text-muted-foreground">{t.sharedWorkspaces}</DropdownMenuLabel>
            {shared.map(item)}
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="gap-2" onClick={onCreate}>
          <Plus className="size-4" />
          <span>{t.newWorkspace}</span>
        </DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

/** La création d'un espace : son nom, et une phrase sur ce que fait l'équipe, qui donne son contexte à l'IA. */
export function CreateWorkspaceDialog({ open, onOpenChange }: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void }>) {
  const router = useRouter()
  const createWorkspace = useWorkspaceStore((s) => s.createWorkspace)
  const { t } = usePreferencesStore()
  const [name, setName] = React.useState("")
  const [activity, setActivity] = React.useState("")
  const [creating, setCreating] = React.useState(false)

  const handleCreate = async () => {
    if (!name.trim()) return
    setCreating(true)
    const workspace = await createWorkspace({ name: name.trim(), activity: activity.trim() || undefined })
    setCreating(false)
    // createWorkspace avale l'erreur et renvoie null : sans ce toast, un échec ne donnait AUCUN retour.
    if (workspace) {
      onOpenChange(false)
      setName("")
      setActivity("")
      router.push(`/${workspace.slug}/dashboard`)
    } else {
      toast.error("Couldn't create the workspace. Please try again.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="workspace-activity">{t.shell.workspaceActivity}</Label>
            <Input
              id="workspace-activity"
              placeholder={t.shell.workspaceActivityPlaceholder}
              value={activity}
              onChange={(e) => setActivity(e.target.value)}
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground">{t.shell.workspaceActivityHint}</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t.common.cancel}
          </Button>
          <Button onClick={handleCreate} disabled={!name.trim() || creating}>
            {creating ? t.shell.creating : t.common.createNew}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
