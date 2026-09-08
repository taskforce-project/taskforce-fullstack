"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useWorkspaceStore } from "@/lib/store/workspace-store"
import { useAuth } from "@/lib/contexts/auth-context"

/**
 * Page racine des routes protégées.
 * Redirige vers le dashboard du premier workspace de l'utilisateur.
 */
export default function ProtectedRootPage() {
  const router = useRouter()
  const { isAuthenticated, isLoading: authLoading, logout } = useAuth()
  const fetchWorkspaces = useWorkspaceStore((s) => s.fetchWorkspaces)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const workspacesLoaded = useWorkspaceStore((s) => s.workspacesLoaded)

  useEffect(() => {
    if (!isAuthenticated || authLoading) return

    if (workspacesLoaded) {
      if (workspaces.length > 0) {
        router.replace(`/${workspaces[0].slug}/dashboard`)
      }
      // workspacesLoaded=true mais liste vide → aucun workspace : on tombe sur l'état vide ci-dessous
      return
    }

    fetchWorkspaces().then((list) => {
      if (list.length > 0) {
        router.replace(`/${list[0].slug}/dashboard`)
      }
    })
  }, [isAuthenticated, authLoading, workspacesLoaded, workspaces, fetchWorkspaces, router])

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
