"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Loader2, MailX, Check, UserX } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { previewInvitation, acceptInvitation, type InvitationPreview } from "@/lib/api/invitation-service"
import { getErrorMessage } from "@/lib/api/client"
import { useAuth } from "@/lib/contexts/auth-context"

/**
 * Page d'atterrissage d'une invitation (PROD-3.5).
 * - Token invalide/expiré → message d'erreur.
 * - Non connecté + pas de compte → redirection inscription pré-remplie (email verrouillé).
 * - Non connecté + compte existant → redirection login (retour ici après connexion).
 * - Connecté avec le BON email → acceptation directe puis redirection app.
 * - Connecté avec un AUTRE email → message clair + bouton « changer de compte » (WS-03).
 */
export default function InvitationLandingPage() {
  const params = useParams<{ token: string }>()
  const token = typeof params.token === "string" ? params.token : ""
  const router = useRouter()
  const { isAuthenticated, isLoading: authLoading, user, logout } = useAuth()

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

  // Email de l'invitation ≠ email du compte connecté : on ne peut pas accepter avec ce compte.
  const emailMismatch = Boolean(
    isAuthenticated && preview?.valid && user?.email && preview.email &&
    user.email.toLowerCase() !== preview.email.toLowerCase(),
  )

  // Routing automatique pour un visiteur NON connecté (le token est porté jusqu'à l'inscription/login,
  // où `acceptPendingInvitations` (backend) le rattache par email).
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
      toast.success(`You have joined ${preview?.workspaceName ?? "the workspace"}`)
      router.replace("/")
    } catch (error) {
      // Remonter le motif réel du backend (email qui ne matche pas, invitation expirée…).
      toast.error(getErrorMessage(error))
      setAccepting(false)
    }
  }

  // Se déconnecter pour reprendre l'invitation avec le bon compte. Après connexion sous le bon email,
  // le backend rattache automatiquement l'invitation (acceptPendingInvitations), ou l'utilisateur
  // rouvre ce lien.
  async function switchAccount() {
    try {
      await logout()
    } catch {
      /* logout best-effort — la redirection se fait quand même */
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
        <h1 className="text-lg font-semibold">Invalid invitation</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          This invitation link is invalid, has expired, or has already been used.
        </p>
        <Button variant="outline" size="sm" onClick={() => router.replace("/")}>Back to home</Button>
      </div>
    )
  }

  // Connecté avec le mauvais compte → on explique et on propose de changer de compte.
  if (emailMismatch) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-amber-500/10">
          <UserX className="size-6 text-amber-500" />
        </div>
        <h1 className="text-lg font-semibold">This isn&apos;t the right account</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          This invitation to <strong>{preview.workspaceName}</strong> is intended for{" "}
          <strong>{preview.email}</strong>, but you are signed in as{" "}
          <strong>{user?.email}</strong>. Sign in with the invited account to accept it.
        </p>
        <div className="flex gap-2">
          <Button onClick={switchAccount} className="gap-2">Switch account</Button>
          <Button variant="outline" onClick={() => router.replace("/")}>Stay on this account</Button>
        </div>
      </div>
    )
  }

  // Connecté avec le bon compte → acceptation explicite.
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
        <Check className="size-6 text-primary" />
      </div>
      <h1 className="text-lg font-semibold">Join {preview.workspaceName}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        You have been invited to join the <strong>{preview.workspaceName}</strong> workspace.
      </p>
      <Button onClick={handleAccept} disabled={accepting} className="gap-2">
        {accepting && <Loader2 className="size-4 animate-spin" />}
        Accept invitation
      </Button>
    </div>
  )
}
