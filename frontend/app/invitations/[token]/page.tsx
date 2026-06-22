"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Loader2, MailX, Check } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { previewInvitation, acceptInvitation, type InvitationPreview } from "@/lib/api/invitation-service"
import { useAuth } from "@/lib/contexts/auth-context"

/**
 * Page d'atterrissage d'une invitation (PROD-3.5).
 * - Token invalide/expiré → message d'erreur.
 * - Non connecté + pas de compte → redirection inscription pré-remplie.
 * - Non connecté + compte existant → redirection login.
 * - Connecté → acceptation directe puis redirection app.
 */
export default function InvitationLandingPage() {
  const params = useParams<{ token: string }>()
  const token = typeof params.token === "string" ? params.token : ""
  const router = useRouter()
  const { isAuthenticated, isLoading: authLoading } = useAuth()

  const [preview, setPreview] = useState<InvitationPreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)

  useEffect(() => {
    if (!token) return
    previewInvitation(token)
      .then(setPreview)
      .catch(() => setPreview({ email: null, workspaceName: null, role: null, valid: false, accountExists: false }))
      .finally(() => setLoading(false))
  }, [token])

  // Routing automatique une fois le preview résolu et l'état d'auth connu
  useEffect(() => {
    if (loading || authLoading || !preview?.valid || isAuthenticated) return
    const dest = preview.accountExists
      ? `/auth/login?invitation=${token}`
      : `/auth/register?invitation=${token}&email=${encodeURIComponent(preview.email ?? "")}`
    router.replace(dest)
  }, [loading, authLoading, preview, isAuthenticated, token, router])

  async function handleAccept() {
    setAccepting(true)
    try {
      await acceptInvitation(token)
      toast.success(`Vous avez rejoint ${preview?.workspaceName ?? "le workspace"}`)
      router.replace("/")
    } catch {
      toast.error("Impossible d'accepter cette invitation")
      setAccepting(false)
    }
  }

  if (loading || authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!preview?.valid) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <MailX className="size-10 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Invitation invalide</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Ce lien d&apos;invitation est invalide, a expiré ou a déjà été utilisé.
        </p>
        <Button variant="outline" size="sm" onClick={() => router.replace("/")}>Retour à l&apos;accueil</Button>
      </div>
    )
  }

  // Connecté → proposer l'acceptation explicite
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
        <Check className="size-6 text-primary" />
      </div>
      <h1 className="text-lg font-semibold">Rejoindre {preview.workspaceName}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Vous avez été invité à rejoindre l&apos;espace de travail <strong>{preview.workspaceName}</strong>.
      </p>
      <Button onClick={handleAccept} disabled={accepting} className="gap-2">
        {accepting && <Loader2 className="size-4 animate-spin" />}
        Accepter l&apos;invitation
      </Button>
    </div>
  )
}
