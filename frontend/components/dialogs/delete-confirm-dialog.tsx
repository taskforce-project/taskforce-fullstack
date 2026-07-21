"use client"

import { useState } from "react"
import {
  Trash2,
  AlertTriangle,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DeleteConfirmDialogProps {
  readonly title?: string
  readonly description?: string
  readonly confirmLabel?: string
  readonly children?: React.ReactNode
  readonly onConfirm?: () => void
  readonly variant?: "danger" | "warning"
  /**
   * Garde-fou : si fourni, l'utilisateur DOIT saisir exactement ce texte (ex. son email, le nom du
   * workspace) pour activer le bouton de suppression. Anti-suppression accidentelle (RGPD-02).
   */
  readonly confirmText?: string
  /** Libellé au-dessus du champ de saisie (défaut générique). */
  readonly confirmTextLabel?: string
  /** Mode contrôlé (ex. déclenché depuis un menu) — si fourni, le trigger interne est optionnel. */
  readonly open?: boolean
  readonly onOpenChange?: (open: boolean) => void
}

// ---------------------------------------------------------------------------
// DeleteConfirmDialog
// ---------------------------------------------------------------------------

export function DeleteConfirmDialog({
  title = "Are you sure?",
  description = "This action cannot be undone.",
  confirmLabel = "Delete",
  children,
  onConfirm,
  variant = "danger",
  confirmText,
  confirmTextLabel,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: DeleteConfirmDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const [typed, setTyped] = useState("")
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : uncontrolledOpen
  const setOpen = (next: boolean) => {
    if (isControlled) controlledOnOpenChange?.(next)
    else setUncontrolledOpen(next)
  }

  // Réinitialise le champ à chaque (ré)ouverture pour ne pas garder une saisie précédente.
  // Ajustement **pendant le rendu** (motif documenté par React pour un état dérivé d'une prop)
  // plutôt qu'en effet : le champ est déjà vide au premier rendu du dialogue, sans passe
  // supplémentaire pendant laquelle l'ancienne saisie resterait visible.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setTyped("")
  }

  // Sans `confirmText`, le bouton est toujours actif (comportement historique). Avec, il faut une
  // correspondance exacte (insensible à la casse et aux espaces de bord).
  const gated = Boolean(confirmText && confirmText.trim().length > 0)
  const matches = !gated || typed.trim().toLowerCase() === confirmText!.trim().toLowerCase()

  function handleConfirm() {
    if (!matches) return
    onConfirm?.()
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {children && (
        <DialogTrigger asChild>
          {children}
        </DialogTrigger>
      )}

      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className={`size-10 rounded-full flex items-center justify-center shrink-0 ${variant === "warning" ? "bg-amber-500/10" : "bg-destructive/10"}`}>
              <AlertTriangle className={`size-5 ${variant === "warning" ? "text-amber-500" : "text-destructive"}`} />
            </div>
            <DialogTitle>{title}</DialogTitle>
          </div>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {gated && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground">
              {confirmTextLabel ?? <>Pour confirmer, saisissez <span className="font-medium text-foreground">{confirmText}</span></>}
            </label>
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={confirmText}
              autoComplete="off"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") handleConfirm() }}
            />
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleConfirm}
            disabled={!matches}
            className="gap-2"
          >
            <Trash2 className="size-4" />
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
