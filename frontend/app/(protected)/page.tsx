"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

import { useWorkspaceStore } from "@/lib/store/workspace-store"
import { useAuth } from "@/lib/contexts/auth-context"

/**
 * Page racine des routes protégées.
 * Redirige vers le dashboard du premier workspace de l'utilisateur.
 */
export default function ProtectedRootPage() {
  const router = useRouter()
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const fetchWorkspaces = useWorkspaceStore((s) => s.fetchWorkspaces)
  const workspaces = useWorkspaceStore((s) => s.workspaces)

  useEffect(() => {
    if (!isAuthenticated || authLoading) return

    if (workspaces.length > 0) {
      router.replace(`/${workspaces[0].slug}/dashboard`)
      return
    }

    fetchWorkspaces().then((list) => {
      if (list.length > 0) {
        router.replace(`/${list[0].slug}/dashboard`)
      } else {
        // Aucun workspace — onboarding ou page de création
        router.replace("/auth/login")
      }
    })
  }, [isAuthenticated, authLoading, workspaces, fetchWorkspaces, router])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  )
}
