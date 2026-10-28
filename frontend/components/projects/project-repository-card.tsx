"use client"

import { useEffect, useId, useState } from "react"
import { ExternalLink, Loader2, Plug } from "lucide-react"
import { toast } from "sonner"

import { DesktopGitHubConnect } from "@/components/desktop/desktop-github-connect"
import { ProjectTestCommand } from "@/components/projects/project-test-command"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { BrandLogo } from "@/components/ui/brand-logo"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import type { ProjectRepoLinkPayload } from "@/lib/api/project-service"
import { IS_DESKTOP } from "@/lib/desktop"
import { cn } from "@/lib/utils"
import { isGitHubRepoFullName, isGitHubRepoName } from "@/lib/utils/github"
import { useDesktopToolsStore } from "@/lib/store/desktop-tools-store"
import { useProjectStore } from "@/lib/store/project-store"
import { useIntegrationStore } from "@/lib/store/integration-store"
import { useSettingsStore } from "@/lib/store/settings-store"

type Mode = "link" | "create"

/**
 * Dépôt de code d'un projet : le voir, en lier un, en créer un, le changer ou le délier. Il ne se choisissait
 * jusqu'ici qu'à la création du projet. Les agents de code clonent ce dépôt et y ouvrent leurs pull requests.
 *
 * Dans la webapp, GitHub passe par l'intégration de l'espace ; dans l'app desktop, par le GitHub CLI de la personne
 * (`useDesktopToolsStore`) : le dépôt s'y crée ou s'y vérifie, puis se lie par son nom.
 */
export function ProjectRepositoryCard({ workspace, projectId }: Readonly<{ workspace: string; projectId: number }>) {
  const repoFullName = useProjectStore((s) => (s.activeProject?.id === projectId ? s.activeProject.repoFullName : null))
  const linkRepo = useProjectStore((s) => s.linkRepo)
  const unlinkRepo = useProjectStore((s) => s.unlinkRepo)
  const githubStatus = useIntegrationStore((s) => s.githubStatus)
  const githubRepos = useIntegrationStore((s) => s.githubRepos)
  const fetchGitHubStatus = useIntegrationStore((s) => s.fetchGitHubStatus)
  const fetchGitHubRepos = useIntegrationStore((s) => s.fetchGitHubRepos)
  const openSettings = useSettingsStore((s) => s.openSettings)
  const desktopGitHub = useDesktopToolsStore((s) => s.status?.github ?? null)
  const desktopRepos = useDesktopToolsStore((s) => s.repos)
  const refreshTools = useDesktopToolsStore((s) => s.refresh)
  const fetchDesktopRepos = useDesktopToolsStore((s) => s.fetchRepos)
  const resolveDesktopRepo = useDesktopToolsStore((s) => s.resolveRepo)

  const listId = useId()
  const [editing, setEditing] = useState(false)
  const [mode, setMode] = useState<Mode>("link")
  const [value, setValue] = useState("")
  const [privateRepo, setPrivateRepo] = useState(true)
  const [saving, setSaving] = useState(false)
  const [confirmUnlink, setConfirmUnlink] = useState(false)

  const checking = IS_DESKTOP ? desktopGitHub === null : githubStatus === null
  const connected = IS_DESKTOP ? Boolean(desktopGitHub?.signedIn) : Boolean(githubStatus?.connected)
  const showForm = connected && (editing || !repoFullName)
  // Desktop : seuls les dépôts où la personne peut pousser sont proposés (Claude Code y ouvre ses pull requests).
  const suggestions = IS_DESKTOP
    ? (desktopRepos ?? []).filter((r) => r.canPush).map((r) => r.fullName)
    : githubRepos.map((r) => r.fullName)

  useEffect(() => {
    if (IS_DESKTOP) {
      if (useDesktopToolsStore.getState().status === null) void refreshTools()
    } else if (workspace) {
      fetchGitHubStatus(workspace).catch(() => { /* la carte dit « connecter GitHub » */ })
    }
  }, [workspace, fetchGitHubStatus, refreshTools])

  // Dépôts proposés à la saisie : lus une fois le formulaire affiché (la liste vient de GitHub).
  useEffect(() => {
    if (!showForm) return
    if (IS_DESKTOP) {
      if (desktopRepos === null) void fetchDesktopRepos()
    } else if (githubRepos.length === 0) {
      fetchGitHubRepos(workspace).catch(() => { /* saisie libre */ })
    }
  }, [showForm, githubRepos.length, desktopRepos, workspace, fetchGitHubRepos, fetchDesktopRepos])

  const name = value.trim()
  const valid = mode === "link" ? isGitHubRepoFullName(name) : isGitHubRepoName(name)

  function startEditing() {
    setMode("link")
    setValue("")
    setEditing(true)
  }

  /** Ce que le serveur doit lier. Desktop : le dépôt est d'abord créé ou vérifié avec le GitHub CLI de la personne. */
  async function linkPayload(): Promise<ProjectRepoLinkPayload | null> {
    if (!IS_DESKTOP) {
      return mode === "link" ? { mode: "LINK", repoFullName: name } : { mode: "CREATE", repoName: name, privateRepo }
    }
    const fullName = await resolveDesktopRepo(mode, name, privateRepo)
    return fullName ? { mode: "LINK", repoFullName: fullName } : null
  }

  async function handleSave() {
    if (!valid) return
    setSaving(true)
    const payload = await linkPayload()
    const result = payload ? await linkRepo(workspace, projectId, payload) : null
    setSaving(false)
    if (!result) {
      const error = payload ? useProjectStore.getState().error : useDesktopToolsStore.getState().error
      toast.error(error ?? "Couldn't link the repository")
      return
    }
    toast.success(mode === "link" ? `Linked to ${result.repoFullName}` : `Created ${result.repoFullName} and linked it`)
    setEditing(false)
    setValue("")
  }

  async function handleUnlink() {
    setConfirmUnlink(false)
    const ok = await unlinkRepo(workspace, projectId)
    if (ok) toast.success("Repository unlinked")
    else toast.error(useProjectStore.getState().error ?? "Couldn't unlink the repository")
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted p-1.5">
          <BrandLogo slug="github" name="GitHub" className="size-full" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">Code repository</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Coding agents clone this repository and open their pull requests there.
            {IS_DESKTOP && desktopGitHub?.signedIn && ` With GitHub CLI on this computer${desktopGitHub.login ? `, as ${desktopGitHub.login}` : ""}.`}
          </p>
        </div>
      </div>

      {repoFullName && !editing && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5">
          <a
            href={`https://github.com/${repoFullName}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-w-0 items-center gap-1.5 font-mono text-sm text-foreground hover:underline"
          >
            <span className="truncate">{repoFullName}</span>
            <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
          </a>
          {connected && (
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={startEditing}>Change</Button>
              <Button variant="dangerGhost" size="sm" className="h-7 text-xs" onClick={() => setConfirmUnlink(true)}>
                Unlink
              </Button>
            </div>
          )}
        </div>
      )}

      {repoFullName && !editing && <ProjectTestCommand workspace={workspace} projectId={projectId} />}

      {IS_DESKTOP && !connected && (
        <DesktopGitHubConnect
          purpose={repoFullName
            ? "Claude Code clones this repository and opens its pull requests with your GitHub account."
            : "Link a repository so that Claude Code can work on it and open pull requests."}
        />
      )}

      {!IS_DESKTOP && checking && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Checking the GitHub connection…
        </div>
      )}

      {!IS_DESKTOP && !checking && !connected && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
          <p className="text-xs text-muted-foreground">
            {repoFullName
              ? "GitHub is not connected for this workspace: connect it to change the repository."
              : "Connect GitHub for this workspace to link a repository to this project."}
          </p>
          <Button size="sm" variant="outline" className="shrink-0 gap-1.5" onClick={() => openSettings("integrations")}>
            <Plug className="size-3.5" /> Open integrations
          </Button>
        </div>
      )}

      {showForm && (
        <div className="flex flex-col gap-2">
          <div className="inline-flex w-fit rounded-md border border-border p-0.5 text-xs">
            {(["link", "create"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setValue("") }}
                className={cn(
                  "rounded px-2.5 py-1 transition-colors",
                  mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m === "link" ? "Link existing" : "New repository"}
              </button>
            ))}
          </div>
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => { e.preventDefault(); handleSave() }}
          >
            <Input
              aria-label={mode === "link" ? "Repository (owner/name)" : "New repository name"}
              value={value}
              onChange={(e) => setValue(mode === "create" ? e.target.value.replaceAll(/\s+/g, "-") : e.target.value)}
              placeholder={mode === "link" ? "owner/name" : "my-repo"}
              list={mode === "link" ? listId : undefined}
              className="h-control min-w-0 flex-1 font-mono"
            />
            {mode === "link" && (
              <datalist id={listId}>
                {suggestions.map((fullName) => <option key={fullName} value={fullName} />)}
              </datalist>
            )}
            {mode === "create" && (
              <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
                <input type="checkbox" checked={privateRepo} onChange={(e) => setPrivateRepo(e.target.checked)} />
                Private
              </label>
            )}
            <Button type="submit" size="sm" className="h-control gap-1.5" disabled={!valid || saving}>
              {saving && <Loader2 className="size-3.5 animate-spin" />}
              {mode === "link" ? "Link" : "Create and link"}
            </Button>
            {editing && (
              <Button type="button" variant="ghost" size="sm" className="h-control" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            )}
          </form>
          {name !== "" && !valid && (
            <p className="text-xs text-destructive">
              {mode === "link" ? "Use the owner/name form, for example acme/website." : "Letters, digits, dots, dashes and underscores only."}
            </p>
          )}
        </div>
      )}

      <AlertDialog open={confirmUnlink} onOpenChange={setConfirmUnlink}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unlink {repoFullName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Coding agents can no longer work on this project until a repository is linked again. The repository
              itself stays on GitHub.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className={buttonVariants({ variant: "destructive" })} onClick={handleUnlink}>
              Unlink
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
