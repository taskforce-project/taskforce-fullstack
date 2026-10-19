"use client"

import { useEffect, useState, type ReactNode } from "react"
import { CircleAlert, CircleCheck, ExternalLink, KeyRound, Loader2, RefreshCw } from "lucide-react"
import { toast } from "sonner"

import { DesktopGitHubConnect } from "@/components/desktop/desktop-github-connect"
import { CopyableCode } from "@/components/settings/copyable-code"
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useAccessTokenStore } from "@/lib/store/access-token-store"
import { useDesktopToolsStore } from "@/lib/store/desktop-tools-store"

/** Page de téléchargement de git. */
export const GIT_URL = "https://git-scm.com/downloads"

/** Nom du jeton personnel que l'app crée pour le Claude Code de cet ordinateur, un par espace. */
export function claudeCodeTokenName(slug: string): string {
  return `Claude Code on this computer (${slug})`
}

/**
 * App desktop : ce qu'il faut sur l'ordinateur pour que Claude Code travaille les tâches qu'on lui délègue, vérifié en
 * direct. Le runner part avec l'app ; il emploie Claude Code (connecté une fois au compte Claude de la personne), git,
 * et GitHub CLI pour les projets qui ont un dépôt (cloner, pousser la branche, ouvrir la pull request).
 */
export function DesktopClaudeCodeSetup({ slug }: Readonly<{ slug: string }>) {
  const status = useDesktopToolsStore((s) => s.status)
  const checking = useDesktopToolsStore((s) => s.checking)
  const refresh = useDesktopToolsStore((s) => s.refresh)

  useEffect(() => { void refresh() }, [refresh])

  if (status === null) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Checking Claude Code, git and GitHub on this computer…
      </p>
    )
  }

  const { claude, git, github } = status
  const claudeReady = claude.installed && claude.signedIn !== false
  const ready = claudeReady && git.installed && github.signedIn

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        {ready
          ? "Ready: delegate an issue to Claude Code and it works on it here, while the app is open. Projects with a repository get a pull request, the others an answer in a comment."
          : "TaskForce runs Claude Code for you while the app is open. A few things are needed on this computer first:"}
      </p>

      <ToolRow
        ok={claudeReady}
        name="Claude Code"
        detail={claude.installed
          ? [claude.version && `version ${claude.version}`, claude.signedIn === false ? "not signed in" : claude.signedIn && "signed in"]
            .filter(Boolean).join(", ")
          : "not installed"}
      >
        {!claude.installed && <CopyableCode label="Install it, then restart TaskForce" text="npm install -g @anthropic-ai/claude-code" />}
        {claude.installed && claude.signedIn === false && (
          <CopyableCode label="Sign in once with your Claude account, in a terminal" text="claude" />
        )}
      </ToolRow>

      <ToolRow ok={git.installed} name="Git" detail={git.installed ? `version ${git.version ?? "unknown"}` : "not installed"}>
        {!git.installed && (
          <a href={GIT_URL} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ size: "sm", variant: "outline" }), "w-fit gap-1.5")}>
            Install Git <ExternalLink className="size-3.5" />
          </a>
        )}
      </ToolRow>

      <ToolRow
        ok={github.signedIn}
        name="GitHub"
        detail={github.signedIn ? `signed in${github.login ? ` as ${github.login}` : ""}` : "for projects with a repository"}
      >
        {!github.signedIn && (
          <DesktopGitHubConnect purpose="Claude Code clones the project's repository, pushes a branch and opens a pull request with your GitHub account." />
        )}
      </ToolRow>

      <div>
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" disabled={checking} onClick={() => void refresh()}>
          {checking ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          Check again
        </Button>
      </div>

      {claude.installed && slug && <ClaudeCodeConnection slug={slug} />}
    </div>
  )
}

/**
 * Mode interactif en un clic : le Claude Code de la personne (terminal, IDE) branché sur le serveur MCP de l'espace,
 * avec un jeton personnel créé ici et jamais affiché. Elle y travaille ses issues avec ses droits et tout ce que Claude
 * Code sait faire, tant que l'app est ouverte. Rebrancher remplace le jeton ; débrancher le révoque.
 */
function ClaudeCodeConnection({ slug }: Readonly<{ slug: string }>) {
  const connection = useDesktopToolsStore((s) => s.mcp[slug] ?? null)
  const fetchMcp = useDesktopToolsStore((s) => s.fetchMcp)
  const connectClaudeCode = useDesktopToolsStore((s) => s.connectClaudeCode)
  const disconnectClaudeCode = useDesktopToolsStore((s) => s.disconnectClaudeCode)
  const fetchTokens = useAccessTokenStore((s) => s.fetchTokens)
  const createToken = useAccessTokenStore((s) => s.createToken)
  const revokeToken = useAccessTokenStore((s) => s.revokeToken)
  const [busy, setBusy] = useState(false)

  useEffect(() => { void fetchMcp(slug) }, [slug, fetchMcp])

  /** Jetons créés par l'app pour ce branchement : un seul en principe. */
  async function revokeAppTokens() {
    const tokens = (await fetchTokens()) ?? []
    await Promise.all(tokens.filter((t) => t.name === claudeCodeTokenName(slug)).map((t) => revokeToken(t.id)))
  }

  async function connect() {
    setBusy(true)
    await revokeAppTokens()
    const created = await createToken(claudeCodeTokenName(slug), null)
    const ok = created ? await connectClaudeCode(slug, created.value) : false
    if (!ok && created) await revokeToken(created.token.id)
    setBusy(false)
    if (ok) toast.success("Claude Code is connected to this workspace")
    else toast.error(useDesktopToolsStore.getState().error ?? "Couldn't connect Claude Code. Please try again.")
  }

  async function disconnect() {
    setBusy(true)
    const ok = await disconnectClaudeCode(slug)
    if (ok) await revokeAppTokens()
    setBusy(false)
    if (ok) toast.success("Claude Code is disconnected, and its token revoked")
    else toast.error(useDesktopToolsStore.getState().error ?? "Couldn't disconnect Claude Code. Please try again.")
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed border-border p-2.5">
      <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
        <KeyRound className="size-3.5 text-muted-foreground" /> Claude Code in your terminal
      </span>

      {connection === null && (
        <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Loader2 className="size-3 animate-spin" /> Checking Claude Code&apos;s connection to TaskForce…
        </p>
      )}

      {connection !== null && !connection.connected && (
        <>
          <p className="text-[11px] text-muted-foreground">
            Work on your issues from your own Claude Code, in a terminal or your editor: it reads and updates them with
            your rights while this app is open. TaskForce adds itself to Claude Code with a personal access token made
            for it.
          </p>
          <div>
            <Button size="sm" className="h-7 gap-1.5 text-xs" disabled={busy} onClick={() => void connect()}>
              {busy && <Loader2 className="size-3.5 animate-spin" />}
              Connect Claude Code
            </Button>
          </div>
        </>
      )}

      {connection?.connected && !connection.current && (
        <>
          <p className="text-[11px] text-ink-yellow">
            Claude Code still points to a previous address of this app: connect it again.
          </p>
          <div>
            <Button size="sm" className="h-7 gap-1.5 text-xs" disabled={busy} onClick={() => void connect()}>
              {busy && <Loader2 className="size-3.5 animate-spin" />}
              Reconnect Claude Code
            </Button>
          </div>
        </>
      )}

      {connection?.connected && connection.current && (
        <>
          <p className="flex items-center gap-1.5 text-[11px] text-foreground">
            <CircleCheck className="size-3.5 shrink-0 text-ink-green" /> Your Claude Code is connected to this workspace.
          </p>
          <CopyableCode label="In any project, ask Claude Code for example" text="List my TaskForce issues and pick one to work on." />
          <div>
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs text-destructive" disabled={busy} onClick={() => void disconnect()}>
              {busy && <Loader2 className="size-3.5 animate-spin" />}
              Disconnect
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

function ToolRow({ ok, name, detail, children }: Readonly<{ ok: boolean; name: string; detail: string; children?: ReactNode }>) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border/60 px-2.5 py-2">
      <p className="flex items-center gap-2 text-xs">
        {ok ? <CircleCheck className="size-3.5 shrink-0 text-ink-green" /> : <CircleAlert className="size-3.5 shrink-0 text-ink-yellow" />}
        <span className="font-medium text-foreground">{name}</span>
        <span className="text-muted-foreground">{detail}</span>
      </p>
      {children}
    </div>
  )
}
