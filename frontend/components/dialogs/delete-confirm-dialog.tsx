"use client"

import { useState } from "react"
import {
  Trash2,
  AlertTriangle,
} from "lucide-react"

import { Button } from "@/components/ui/button"
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
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: DeleteConfirmDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : uncontrolledOpen
  const setOpen = (next: boolean) => {
    if (isControlled) controlledOnOpenChange?.(next)
    else setUncontrolledOpen(next)
  }

  function handleConfirm() {
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

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleConfirm}
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
