"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Check, CloudDownload, CloudUpload, ExternalLink, Loader2, RefreshCw } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { moveKey, useDesktopTransferStore, workspaceKey } from "@/lib/store/desktop-transfer-store"
import { useProjectStore } from "@/lib/store/project-store"
import { useWorkspaceStore } from "@/lib/store/workspace-store"

/**
 * Projets entre la webapp et l'app desktop : la coque copie le projet d'un côté à l'autre avec la session de l'app,
 * sans fichier à manipuler. L'original reste où il était.
 */

function LoadState({ onRetry }: Readonly<{ onRetry: () => void }>) {
  const loading = useDesktopTransferStore((s) => s.loading)
  const error = useDesktopTransferStore((s) => s.error)
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Reading your projects in the web app…
      </div>
    )
  }
  return (
    <div className="flex flex-col items-start gap-3 rounded-md border border-border bg-muted/30 px-3 py-3 text-sm">
      <p className="text-muted-foreground">{error ?? "Your projects in the web app couldn't be read."}</p>
      <Button size="sm" variant="outline" className="gap-1.5" onClick={onRetry}>
        <RefreshCw className="size-3.5" /> Try again
      </Button>
    </div>
  )
}

/**
 * Le travail de la webapp à copier sur cet ordinateur : un espace entier (son Brain OS et ses projets) devient un nouvel
 * espace de l'app ; un projet seul arrive dans l'espace ouvert (`target`). « Copy everything » copie tous les espaces.
 */
export function BringFromWebDialog({
  open,
  onOpenChange,
  target,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void; target: string }>) {
  const router = useRouter()
  const workspaces = useDesktopTransferStore((s) => s.webWorkspaces)
  const moving = useDesktopTransferStore((s) => s.moving)
  const moved = useDesktopTransferStore((s) => s.moved)
  const movedWorkspaces = useDesktopTransferStore((s) => s.movedWorkspaces)
  const fetchWebProjects = useDesktopTransferStore((s) => s.fetchWebProjects)
  const bring = useDesktopTransferStore((s) => s.bring)
  const bringWorkspace = useDesktopTransferStore((s) => s.bringWorkspace)
  const fetchProjects = useProjectStore((s) => s.fetchProjects)
  const fetchWorkspaces = useWorkspaceStore((s) => s.fetchWorkspaces)
  const [everything, setEverything] = useState<string | null>(null)

  useEffect(() => {
    if (open) void fetchWebProjects()
  }, [open, fetchWebProjects])

  async function handleBring(workspace: string, projectId: number) {
    const project = await bring({ workspace, projectId, target })
    if (!project) {
      toast.error(useDesktopTransferStore.getState().error ?? "The project wasn't copied. Please try again.")
      return
    }
    toast.success(`"${project.name}" is on this computer`)
    void fetchProjects(target)
  }

  async function handleBringWorkspace(slug: string): Promise<boolean> {
    const workspace = await bringWorkspace(slug)
    if (!workspace) {
      toast.error(useDesktopTransferStore.getState().error ?? "The workspace wasn't copied. Please try again.")
      return false
    }
    void fetchWorkspaces()
    return true
  }

  /** Tous les espaces pas encore copiés, l'un après l'autre. */
  async function handleBringEverything() {
    const pending = (workspaces ?? []).filter((w) => !useDesktopTransferStore.getState().movedWorkspaces[w.slug])
    for (const [index, workspace] of pending.entries()) {
      setEverything(`Copying ${index + 1} of ${pending.length}: ${workspace.name}`)
      if (!(await handleBringWorkspace(workspace.slug))) break
    }
    setEverything(null)
    if (pending.every((w) => useDesktopTransferStore.getState().movedWorkspaces[w.slug])) {
      toast.success("Everything from the web app is on this computer")
    }
  }

  const projects = workspaces?.flatMap((w) => w.projects) ?? []
  const busy = moving !== null || everything !== null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>From the web app</DialogTitle>
          <DialogDescription>
            Copy your work from the TaskForce web app to this computer: a whole workspace with its notes, documents
            and projects, or one project into this workspace. Issues keep their history and attachments. The
            originals stay in the web app.
          </DialogDescription>
        </DialogHeader>

        {workspaces === null ? (
          <LoadState onRetry={() => void fetchWebProjects()} />
        ) : workspaces.length === 0 ? (
          <p className="rounded-md border border-border bg-muted/30 px-3 py-4 text-sm text-muted-foreground">
            You have no workspace in the web app.
          </p>
        ) : (
          <div className="flex max-h-[55vh] flex-col gap-4 overflow-y-auto">
            <div className="flex items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2.5">
              <p className="text-sm text-foreground">
                {everything ?? `${workspaces.length} workspace${workspaces.length === 1 ? "" : "s"}, ${projects.length} project${projects.length === 1 ? "" : "s"}`}
              </p>
              <Button size="sm" className="shrink-0 gap-1.5" disabled={busy} onClick={() => void handleBringEverything()}>
                {everything ? <Loader2 className="size-3.5 animate-spin" /> : <CloudDownload className="size-3.5" />}
                Copy everything
              </Button>
            </div>
            {workspaces.map((workspace) => (
              <div key={workspace.slug} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-medium text-muted-foreground">{workspace.name}</p>
                  {movedWorkspaces[workspace.slug] ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 shrink-0 gap-1.5 text-xs text-ink-green"
                      onClick={() => {
                        onOpenChange(false)
                        router.push(`/${movedWorkspaces[workspace.slug].slug}`)
                      }}
                    >
                      <Check className="size-3.5" /> Open the workspace
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 shrink-0 gap-1.5 text-xs"
                      disabled={busy}
                      onClick={() => void handleBringWorkspace(workspace.slug)}
                    >
                      {moving === workspaceKey(workspace.slug) ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <CloudDownload className="size-3.5" />
                      )}
                      Copy the whole workspace
                    </Button>
                  )}
                </div>
                {workspace.projects.length === 0 && (
                  <p className="text-xs text-muted-foreground">No projects: its knowledge comes with the whole workspace.</p>
                )}
                {workspace.projects.map((project) => {
                  const key = moveKey({ workspace: workspace.slug, projectId: project.id })
                  const done = moved[key]
                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{project.name}</p>
                        <p className="text-xs text-muted-foreground">
                          <span className="font-mono">{project.identifier}</span> · {project.issueCount} issue
                          {project.issueCount === 1 ? "" : "s"}
                        </p>
                      </div>
                      {done ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="shrink-0 gap-1.5 text-ink-green"
                          onClick={() => {
                            onOpenChange(false)
                            router.push(`/${target}/projects/${done.id}`)
                          }}
                        >
                          <Check className="size-3.5" /> Open
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0 gap-1.5"
                          disabled={busy}
                          onClick={() => void handleBring(workspace.slug, project.id)}
                        >
                          {moving === key ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <CloudDownload className="size-3.5" />
                          )}
                          Copy here
                        </Button>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Copie d'un projet de cet ordinateur dans un espace de la webapp, choisi par la personne. */
export function SendToWebDialog({
  open,
  onOpenChange,
  workspace,
  projectId,
  projectName,
}: Readonly<{
  open: boolean
  onOpenChange: (open: boolean) => void
  workspace: string
  projectId: number
  projectName: string
}>) {
  const workspaces = useDesktopTransferStore((s) => s.webWorkspaces)
  const moving = useDesktopTransferStore((s) => s.moving)
  const fetchWebProjects = useDesktopTransferStore((s) => s.fetchWebProjects)
  const send = useDesktopTransferStore((s) => s.send)
  const openWeb = useDesktopTransferStore((s) => s.openWeb)
  const [target, setTarget] = useState("")
  const [sentUrl, setSentUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    void fetchWebProjects().then((list) => {
      if (list?.length === 1) setTarget(list[0].slug)
    })
  }, [open, fetchWebProjects])

  /** Fermée, la fenêtre oublie la copie faite : rouverte, elle propose d'en faire une autre. */
  function close() {
    setSentUrl(null)
    onOpenChange(false)
  }

  async function handleSend() {
    if (!target) return
    const project = await send({ workspace, projectId, target })
    if (!project) {
      toast.error(useDesktopTransferStore.getState().error ?? "The project wasn't copied. Please try again.")
      return
    }
    setSentUrl(project.url ?? null)
    toast.success(`"${project.name}" is in the web app`)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Copy to the web app</DialogTitle>
          <DialogDescription>
            Copy &ldquo;{projectName}&rdquo; to a workspace of the TaskForce web app, with its issues, history and
            attachments. It stays on this computer too.
          </DialogDescription>
        </DialogHeader>

        {sentUrl ? (
          <div className="flex flex-col items-start gap-3 rounded-md border border-border bg-muted/30 px-3 py-3 text-sm">
            <p className="flex items-center gap-1.5 font-medium text-foreground">
              <Check className="size-4 text-ink-green" /> Copied to the web app
            </p>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openWeb(sentUrl)}>
              <ExternalLink className="size-3.5" /> Open in the web app
            </Button>
          </div>
        ) : workspaces === null ? (
          <LoadState onRetry={() => void fetchWebProjects()} />
        ) : workspaces.length === 0 ? (
          <p className="rounded-md border border-border bg-muted/30 px-3 py-4 text-sm text-muted-foreground">
            You have no workspace in the web app yet.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Web app workspace">
            {workspaces.map((w) => (
              <button
                key={w.slug}
                type="button"
                role="radio"
                aria-checked={target === w.slug}
                onClick={() => setTarget(w.slug)}
                className={cn(
                  "flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors",
                  target === w.slug ? "border-primary bg-primary/5" : "border-border hover:bg-accent",
                )}
              >
                <span className="font-medium text-foreground">{w.name}</span>
                <span className="text-xs text-muted-foreground">
                  {w.projects.length} project{w.projects.length === 1 ? "" : "s"}
                </span>
              </button>
            ))}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={close} disabled={moving !== null}>
            {sentUrl ? "Done" : "Cancel"}
          </Button>
          {!sentUrl && (
            <Button size="sm" className="gap-2" onClick={handleSend} disabled={!target || moving !== null}>
              {moving ? <Loader2 className="size-4 animate-spin" /> : <CloudUpload className="size-4" />}
              Copy
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
