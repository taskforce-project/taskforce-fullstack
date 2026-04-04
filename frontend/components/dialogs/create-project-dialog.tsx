"use client"

import { useState } from "react"
import {
  Plus,
  FolderKanban,
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
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateProjectPayload {
  name: string
  description: string
  emoji: string
  color: string
}

interface CreateProjectDialogProps {
  readonly children?: React.ReactNode
  readonly onCreated?: (payload: CreateProjectPayload) => void
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const EMOJIS = ["🚀", "🎨", "⚡", "📱", "🔒", "📊", "🌐", "🛠️", "💎", "🔬", "🗄️", "📋"]
const COLORS = [
  { value: "bg-violet-500", preview: "bg-violet-500" },
  { value: "bg-blue-500", preview: "bg-blue-500" },
  { value: "bg-emerald-500", preview: "bg-emerald-500" },
  { value: "bg-amber-500", preview: "bg-amber-500" },
  { value: "bg-red-500", preview: "bg-red-500" },
  { value: "bg-orange-500", preview: "bg-orange-500" },
  { value: "bg-pink-500", preview: "bg-pink-500" },
  { value: "bg-slate-500", preview: "bg-slate-500" },
]

// ---------------------------------------------------------------------------
// CreateProjectDialog
// ---------------------------------------------------------------------------

export function CreateProjectDialog({ children, onCreated }: CreateProjectDialogProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [emoji, setEmoji] = useState("🚀")
  const [color, setColor] = useState("bg-violet-500")

  function handleCreate() {
    if (!name.trim()) return
    onCreated?.({ name, description, emoji, color })
    resetForm()
    setOpen(false)
  }

  function resetForm() {
    setName("")
    setDescription("")
    setEmoji("🚀")
    setColor("bg-violet-500")
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm() }}>
      <DialogTrigger asChild>
        {children ?? (
          <Button size="sm" className="gap-2">
            <Plus className="size-4" />
            New project
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create project</DialogTitle>
          <DialogDescription>
            Projects help you track work across issues, cycles, and pages.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 py-2">
          {/* Icon + Name row */}
          <div className="flex items-start gap-3">
            {/* Emoji + color picker */}
            <div className="flex flex-col gap-2 shrink-0">
              <div className={cn("size-12 rounded-xl flex items-center justify-center text-2xl bg-linear-to-br from-muted to-muted/50 border border-border")}>
                {emoji}
              </div>
            </div>

            {/* Name */}
            <div className="flex-1 flex flex-col gap-1.5">
              <label htmlFor="project-name" className="text-sm font-medium text-foreground">Project name</label>
              <Input
                id="project-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My New Project"
                className="h-9"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && name.trim() && handleCreate()}
              />
            </div>
          </div>

          {/* Emoji picker */}
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">Icon</p>
            <div className="flex flex-wrap gap-2">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  onClick={() => setEmoji(e)}
                  className={cn(
                    "size-9 rounded-lg border flex items-center justify-center text-xl transition-all",
                    emoji === e
                      ? "border-primary bg-primary/5"
                      : "border-border bg-muted/30 hover:border-border/80"
                  )}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          {/* Color picker */}
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">Color</p>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setColor(c.value)}
                  className={cn(
                    "size-7 rounded-full transition-all ring-offset-background",
                    c.preview,
                    color === c.value ? "ring-2 ring-offset-2 ring-foreground/20" : "opacity-70 hover:opacity-100"
                  )}
                />
              ))}
            </div>
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="project-description" className="text-sm font-medium text-foreground">
              Description <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <textarea
              id="project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this project about?"
              className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all min-h-18"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleCreate} disabled={!name.trim()} className="gap-2">
            <FolderKanban className="size-4" />
            Create project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
