"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Check, X, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  listMyInvitations,
  acceptMyInvitation,
  type IncomingInvitation,
} from "@/lib/api/invitation-service"

/**
 * Bannière d'approbation des invitations reçues (in-app).
 *
 * Depuis le passage à une acceptation EXPLICITE (plus d'auto-rattachement silencieux à la connexion),
 * un compte déjà existant qui a été invité voit ici ses invitations en attente et clique « Accepter »
 * — sans dépendre de l'email. Rendue nulle s'il n'y a rien : aucun espace occupé dans le cas courant.
 */
export function PendingInvitationsBanner() {
  const [invitations, setInvitations] = useState<IncomingInvitation[]>([])
  const [acceptingId, setAcceptingId] = useState<number | null>(null)

  useEffect(() => {
    // Silencieux : une bannière optionnelle ne doit jamais casser le rendu de l'app.
    listMyInvitations()
      .then(setInvitations)
      .catch(() => setInvitations([]))
  }, [])

  async function accept(inv: IncomingInvitation) {
    setAcceptingId(inv.id)
    try {
      await acceptMyInvitation(inv.id)
      toast.success(`You joined ${inv.workspaceName}`)
      // Rechargement dur : le nouveau workspace doit apparaître dans le sélecteur et les stores.
      window.location.assign("/")
    } catch {
      toast.error("Could not accept the invitation")
      setAcceptingId(null)
    }
  }

  function dismiss(id: number) {
    setInvitations((prev) => prev.filter((i) => i.id !== id))
  }

  if (invitations.length === 0) return null

  return (
    <div className="space-y-2 px-4 pt-4">
      {invitations.map((inv) => (
        <div
          key={inv.id}
          className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3"
        >
          <p className="min-w-0 flex-1 text-sm">
            <span className="font-medium">{inv.invitedByName ?? "Someone"}</span>
            {" invited you to join "}
            <span className="font-medium">{inv.workspaceName}</span>
            {inv.role ? <span className="text-muted-foreground"> · {inv.role.toLowerCase()}</span> : null}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              size="sm"
              onClick={() => accept(inv)}
              disabled={acceptingId !== null}
              className="gap-1.5"
            >
              {acceptingId === inv.id ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              Accept
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => dismiss(inv.id)}
              disabled={acceptingId !== null}
              aria-label="Dismiss"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
