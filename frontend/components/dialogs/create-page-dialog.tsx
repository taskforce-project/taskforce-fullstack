"use client"

import { useState } from "react"
import { FileText } from "lucide-react"

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

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CreatePagePayload {
  id: string
  title: string
  emoji: string
  excerpt: string
  lastEditedBy: string
  lastEditedByInitials: string
  lastEditedByColor: string
  lastEditedAt: string
}

interface CreatePageDialogProps {
  readonly children?: React.ReactNode
  readonly onCreated?: (payload: CreatePagePayload) => void
}

// ─────────────────────────────────────────────────────────────────────────────
// CreatePageDialog
// ─────────────────────────────────────────────────────────────────────────────

export function CreatePageDialog({ children, onCreated }: CreatePageDialogProps) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [emoji, setEmoji] = useState("📄")

  const canCreate = title.trim().length > 0

  function resetForm() {
    setTitle("")
    setEmoji("📄")
  }

  function handleCreate() {
    if (!canCreate) return
    const payload: CreatePagePayload = {
      id: Date.now().toString(),
      title: title.trim(),
      emoji,
      excerpt: "New page — start writing to add content.",
      lastEditedBy: "You",
      lastEditedByInitials: "ME",
      lastEditedByColor: "bg-primary",
      lastEditedAt: "Just now",
    }
    onCreated?.(payload)
    resetForm()
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm() }}>
      <DialogTrigger asChild>
        {children ?? (
          <Button size="sm" className="gap-2">
            <FileText className="h-4 w-4" />
            New page
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            New Page
          </DialogTitle>
          <DialogDescription>
            Create a new page to document decisions, guidelines, or notes.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Emoji + Title */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="page-title" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Title
            </label>
            <div className="flex items-center gap-2">
              <Input
                className="w-12 text-center text-base px-1"
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                maxLength={2}
                aria-label="Page emoji"
              />
              <Input
                id="page-title"
                placeholder="Architecture Decision Records…"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && canCreate) handleCreate() }}
                autoFocus
                className="flex-1"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled={!canCreate} onClick={handleCreate}>
            Create page
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
