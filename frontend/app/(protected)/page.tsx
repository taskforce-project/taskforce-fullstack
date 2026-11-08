"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useUserStore } from "@/lib/store/user-store"
import { useWindowStore } from "@/lib/store/window-store"
import { useWorkspaceStore } from "@/lib/store/workspace-store"
import { useAuth } from "@/lib/contexts/auth-context"
import { homePath } from "@/lib/window/pane"

/**
 * Page racine des routes protégées. La fenêtre s'ouvre là où la personne l'a laissée (R123) : l'accueil de son dernier
 * espace, sinon du premier, où elle reprend sa dernière conversation et son volet. Le tableau de bord n'est plus
 * l'accueil (R124) : il s'ouvre en volet.
 */
export default function ProtectedRootPage() {
  const router = useRouter()
  const { isAuthenticated, isLoading: authLoading, logout } = useAuth()
  const fetchWorkspaces = useWorkspaceStore((s) => s.fetchWorkspaces)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const workspacesLoaded = useWorkspaceStore((s) => s.workspacesLoaded)
  const me = useUserStore((s) => s.user?.id)

  useEffect(() => {
    if (!isAuthenticated || authLoading) return
    const open = (list: readonly { slug: string }[]) => {
      const last = me === null || me === undefined ? undefined : useWindowStore.getState().lastSpaces[String(me)]
      router.replace(homePath(list.find((ws) => ws.slug === last)?.slug ?? list[0].slug))
    }

    if (workspacesLoaded) {
      if (workspaces.length > 0) open(workspaces)
      // workspacesLoaded=true mais liste vide → aucun workspace : on tombe sur l'état vide ci-dessous
      return
    }

    fetchWorkspaces().then((list) => {
      if (list.length > 0) open(list)
    })
  }, [isAuthenticated, authLoading, workspacesLoaded, workspaces, fetchWorkspaces, router, me])

  // Cas limite (dernier workspace supprimé, invitation déclinée, hoquet backend) : la liste est
  // chargée mais vide. Sans ce garde, la page restait bloquée sur un spinner infini (cul-de-sac).
  if (isAuthenticated && !authLoading && workspacesLoaded && workspaces.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-lg font-semibold">No workspace yet</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          You&apos;re not part of any workspace. Reload if this looks wrong, or sign out to start fresh - creating an account sets up your first workspace.
        </p>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => { void fetchWorkspaces() }}>
            Reload
          </Button>
          <Button size="sm" onClick={() => { void logout() }}>
            Sign out
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  )
}
