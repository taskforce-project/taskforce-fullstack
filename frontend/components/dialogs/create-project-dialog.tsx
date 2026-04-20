"use client"

import { useState } from "react"
import {
  Plus,
  FolderKanban,
  Loader2,
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
import { useWorkspaceStore } from "@/lib/store/workspace-store"
import { useProjectStore } from "@/lib/store/project-store"
import type { Project } from "@/lib/api/project-service"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateProjectDialogProps {
  readonly children?: React.ReactNode
  readonly onCreated?: (project: Project) => void
}

// ---------------------------------------------------------------------------
// CreateProjectDialog
// ---------------------------------------------------------------------------

export function CreateProjectDialog({ children, onCreated }: CreateProjectDialogProps) {
  const slug = useWorkspaceStore((s) => s.activeWorkspace?.slug)
  const createProject = useProjectStore((s) => s.createProject)

  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [name, setName] = useState("")
  const [identifier, setIdentifier] = useState("")
  const [description, setDescription] = useState("")

  function handleNameChange(value: string) {
    setName(value)
    const derived = value.toUpperCase().replaceAll(/[^A-Z0-9]/g, "").slice(0, 6)
    const prevDerived = name.toUpperCase().replaceAll(/[^A-Z0-9]/g, "").slice(0, 6)
    if (!identifier || identifier === prevDerived) {
      setIdentifier(derived)
    }
  }

  async function handleCreate() {
    if (!name.trim() || !identifier.trim() || !slug) return
    setIsLoading(true)
    try {
      const project = await createProject(slug, {
        name: name.trim(),
        identifier: identifier.trim().toUpperCase(),
        description: description.trim() || undefined,
      })
      if (project) {
        onCreated?.(project)
        resetForm()
        setOpen(false)
      }
    } finally {
      setIsLoading(false)
    }
  }

  function resetForm() {
    setName("")
    setIdentifier("")
    setDescription("")
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
            <div className="size-12 rounded-xl flex items-center justify-center bg-muted border border-border shrink-0">
              <FolderKanban className="size-6 text-muted-foreground" />
            </div>

            <div className="flex-1 flex flex-col gap-1.5">
              <label htmlFor="project-name" className="text-sm font-medium text-foreground">Project name</label>
              <Input
                id="project-name"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="My New Project"
                className="h-9"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && name.trim() && identifier.trim() && handleCreate()}
              />
            </div>
          </div>

          {/* Identifier */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="project-identifier" className="text-sm font-medium text-foreground">
              Identifier{" "}
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">Used as issue prefix (e.g. WEB-42)</span>
            </label>
            <Input
              id="project-identifier"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value.toUpperCase().replaceAll(/[^A-Z0-9-]/g, "").slice(0, 10))}
              placeholder="WEB"
              className="h-9 font-mono uppercase"
            />
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
          <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleCreate} disabled={!name.trim() || !identifier.trim() || isLoading} className="gap-2">
            {isLoading ? <Loader2 className="size-4 animate-spin" /> : <FolderKanban className="size-4" />}
            Create project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
