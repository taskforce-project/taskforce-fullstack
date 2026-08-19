"use client"

import { useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

import { useWorkspaceStore } from "@/lib/store/workspace-store"

export default function WorkspaceLayout({
  children,
}: {
  readonly children: React.ReactNode
}) {
  const params = useParams()
  const router = useRouter()
  const slug = params.workspace as string

  const setActiveBySlug = useWorkspaceStore((s) => s.setActiveBySlug)
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace)
  const isLoading = useWorkspaceStore((s) => s.isLoading)

  useEffect(() => {
    if (slug) {
      setActiveBySlug(slug).then((ws) => {
        if (!ws) {
          // Workspace introuvable ou non membre → retour à la racine
          router.replace("/")
        }
      })
    }
  }, [slug, setActiveBySlug, router])

  // Afficher un loader seulement si le workspace actif ne correspond pas encore au slug
  const isWorkspaceLoading = isLoading || activeWorkspace?.slug !== slug

  if (isWorkspaceLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return <>{children}</>
}
