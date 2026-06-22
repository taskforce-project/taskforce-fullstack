"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { FolderKanban, Loader2, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ProjectIconPicker } from "@/components/ui/project-icon-picker"
import { ColorPalettePicker, PROJECT_COLORS } from "@/components/ui/color-palette-picker"
import { useProjectStore } from "@/lib/store/project-store"

export default function NewProjectPage() {
  const params = useParams<{ workspace: string }>()
  const router = useRouter()
  const slug = params.workspace
  const createProject = useProjectStore((s) => s.createProject)

  const [isLoading, setIsLoading] = useState(false)
  const [name, setName] = useState("")
  const [identifier, setIdentifier] = useState("")
  const [description, setDescription] = useState("")
  const [iconUrl, setIconUrl] = useState<string | null>(null)
  const [color, setColor] = useState<string>(PROJECT_COLORS[0])

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
        iconUrl: iconUrl ?? undefined,
        color,
      })
      if (project) {
        toast.success(`Projet "${project.name}" créé`)
        router.push(`/${slug}/projects/${project.id}/issues`)
      } else {
        toast.error("Impossible de créer le projet")
      }
    } catch {
      toast.error("Une erreur est survenue lors de la création du projet")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-8 max-w-xl mx-auto w-full pt-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <Link
          href={`/${slug}/projects`}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit mb-2"
        >
          <ArrowLeft className="size-3.5" />
          Back to projects
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">New project</h1>
        <p className="text-sm text-muted-foreground">
          Projects help you track work across issues, cycles, and pages.
        </p>
      </div>

      {/* Form */}
      <div className="rounded-xl border border-border bg-card p-6 flex flex-col gap-6">
        {/* Icon + Name */}
        <div className="flex items-end gap-4">
          <ProjectIconPicker value={iconUrl} onChange={setIconUrl} />
          <div className="flex-1 flex flex-col gap-1.5">
            <label htmlFor="project-name" className="text-sm font-medium text-foreground">
              Project name <span className="text-destructive">*</span>
            </label>
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
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
              Used as issue prefix (e.g. WEB-42)
            </span>
          </label>
          <Input
            id="project-identifier"
            value={identifier}
            onChange={(e) =>
              setIdentifier(e.target.value.toUpperCase().replaceAll(/[^A-Z0-9-]/g, "").slice(0, 10))
            }
            placeholder="WEB"
            className="h-9 font-mono uppercase"
          />
        </div>

        {/* Description */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="project-description" className="text-sm font-medium text-foreground">
            Description{" "}
            <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <textarea
            id="project-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this project about?"
            rows={3}
            className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
          />
        </div>

        {/* Color */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">Color</label>
          <ColorPalettePicker value={color} onChange={setColor} />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/${slug}/projects`)}
          disabled={isLoading}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleCreate}
          disabled={!name.trim() || !identifier.trim() || isLoading}
          className="gap-2"
        >
          {isLoading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <FolderKanban className="size-4" />
          )}
          Create project
        </Button>
      </div>
    </div>
  )
}
