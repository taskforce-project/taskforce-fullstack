"use client"

import { useEffect, type ReactNode } from "react"
import { CircleAlert, CircleCheck, ExternalLink, Loader2, RefreshCw } from "lucide-react"

import { DesktopGitHubConnect } from "@/components/desktop/desktop-github-connect"
import { CopyableCode } from "@/components/settings/copyable-code"
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useDesktopToolsStore } from "@/lib/store/desktop-tools-store"

/** Page de téléchargement de git. */
export const GIT_URL = "https://git-scm.com/downloads"

/**
 * App desktop : ce qu'il faut sur l'ordinateur pour que Claude Code travaille les tâches qu'on lui délègue, vérifié en
 * direct. Le runner part avec l'app ; il emploie Claude Code (connecté une fois au compte Claude de la personne), git,
 * et GitHub CLI pour les projets qui ont un dépôt (cloner, pousser la branche, ouvrir la pull request).
 */
export function DesktopClaudeCodeSetup() {
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
