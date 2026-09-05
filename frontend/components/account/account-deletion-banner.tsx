"use client"

import { useState } from "react"
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react"
import { toast } from "sonner"

import { useAuth } from "@/lib/contexts/auth-context"
import { restoreMyAccount } from "@/lib/api/gdpr-service"
import { Button } from "@/components/ui/button"

/**
 * Bandeau de restauration de compte.
 *
 * Visible sur toute l'app tant que le compte courant est planifié pour suppression
 * (`user.scheduledPurgeAt` non nul - posé par le droit à l'effacement RGPD, avec délai de grâce).
 * Il rappelle la date de purge et propose de restaurer le compte tant que le délai court : c'est le
 * filet promis à l'utilisateur (« si je me reconnecte, est-ce que je peux récupérer mon compte ? »).
 *
 * Barre FIXE en bas : elle ne participe pas au modèle de hauteur de l'AppShell (`h-svh`), donc elle
 * s'affiche partout sans décaler le header ni la sidebar. Rend `null` hors état de suppression.
 */
export function AccountDeletionBanner() {
  const { user, refreshUser } = useAuth()
  const [restoring, setRestoring] = useState(false)

  const purgeAt = user?.scheduledPurgeAt
  if (!purgeAt) return null

  const purgeDate = new Date(purgeAt)
  const label = Number.isNaN(purgeDate.getTime())
    ? null
    : purgeDate.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })

  const handleRestore = async () => {
    setRestoring(true)
    try {
      await restoreMyAccount()
      await refreshUser()
      toast.success("Account restored. Welcome back.")
      // Succès : refreshUser efface scheduledPurgeAt → ce composant se démonte (pas de reset de
      // `restoring` nécessaire).
    } catch {
      toast.error("Could not restore your account. Try again or contact contact@taskforce-project.fr.")
      setRestoring(false)
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-amber-500/40 bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-col items-start gap-2 px-4 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          <p className="text-foreground">
            Your account is scheduled for deletion
            {label ? <> on <span className="font-semibold">{label}</span></> : null}. Restore it
            before then to keep your workspaces and access.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleRestore}
          disabled={restoring}
          className="h-8 shrink-0 gap-2 border-amber-500/50 text-xs"
        >
          {restoring ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <RotateCcw className="size-3.5" aria-hidden />}
          Restore account
        </Button>
      </div>
    </div>
  )
}
