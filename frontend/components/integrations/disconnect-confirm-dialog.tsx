"use client"

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { buttonVariants } from "@/components/ui/button"

/** Ce que coûte la déconnexion de chaque intégration native, dit avant de la confirmer. */
export const DISCONNECT_CONSEQUENCES: Record<"github" | "slack", string> = {
  github: "TaskForce stops reading your repositories and its access is revoked at GitHub. Links already added to issues and projects stay, but their status no longer updates.",
  slack: "Notifications stop, the channels you set up are removed and TaskForce's access is revoked at Slack.",
}

/**
 * Confirmation d'une déconnexion (GitHub, Slack) : elle révoque l'accès chez le service, on ne la fait pas
 * sur un clic égaré.
 */
export function DisconnectConfirmDialog({
  open, onOpenChange, name, consequence, onConfirm,
}: Readonly<{
  open: boolean
  onOpenChange: (open: boolean) => void
  name: string
  consequence: string
  onConfirm: () => void
}>) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Disconnect {name}?</AlertDialogTitle>
          <AlertDialogDescription>{consequence}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction className={buttonVariants({ variant: "destructive" })} onClick={onConfirm}>
            Disconnect {name}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
