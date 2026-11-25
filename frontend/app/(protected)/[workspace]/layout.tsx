"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams, usePathname, useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

import { RecordUnavailable } from "@/components/delivery/record-unavailable"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { useWorkspaceStore } from "@/lib/store/workspace-store"
import { paneOf, VERIFICATION } from "@/lib/window/pane"

export default function WorkspaceLayout({
  children,
}: {
  readonly children: React.ReactNode
}) {
  const params = useParams()
  const router = useRouter()
  const pathname = usePathname()
  const slug = params.workspace as string
  const t = usePreferencesStore((s) => s.t.verification)

  const setActiveBySlug = useWorkspaceStore((s) => s.setActiveBySlug)
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace)
  const isLoading = useWorkspaceStore((s) => s.isLoading)
  // La page de vérification d'un espace dont la personne n'est pas membre : le message neutre du dossier, jamais un renvoi
  // muet vers l'accueil (R161 M4 de #552). On y arrive par un lien reçu, celui d'une pull request par exemple.
  const verification = paneOf(pathname)?.section === VERIFICATION
  const [denied, setDenied] = useState<string | null>(null)

  useEffect(() => {
    if (slug) {
      setActiveBySlug(slug).then((ws) => {
        if (ws) return
        // Workspace introuvable ou non membre : la page de vérification le dit, les autres reviennent à la racine.
        if (verification) setDenied(slug)
        else router.replace("/")
      })
    }
  }, [slug, setActiveBySlug, router, verification])

  if (denied === slug && verification) {
    return (
      <div className="flex min-h-full items-start justify-center p-6">
        <RecordUnavailable title={t.title} message={t.denied} hint={t.deniedHint}
          back={<Link href="/" className="w-fit text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">{t.home}</Link>} />
      </div>
    )
  }

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
