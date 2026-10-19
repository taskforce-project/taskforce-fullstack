"use client"

import { useEffect } from "react"
import { ExternalLink, Loader2, RefreshCw } from "lucide-react"
import { toast } from "sonner"

import { Button, buttonVariants } from "@/components/ui/button"
import { BrandLogo } from "@/components/ui/brand-logo"
import { cn } from "@/lib/utils"
import { useDesktopToolsStore } from "@/lib/store/desktop-tools-store"

/** Page d'installation du GitHub CLI. */
export const GITHUB_CLI_URL = "https://cli.github.com"

/**
 * GitHub dans l'app desktop : prêt quand le GitHub CLI de la personne est installé et connecté. Sinon, ce bloc mène au
 * geste qui manque : l'installer, ou se connecter avec un code à usage unique (comme `gh auth login`). Une fois GitHub
 * prêt, il ne montre rien : l'appelant affiche son formulaire.
 *
 * `purpose` dit en une phrase pourquoi GitHub sert ici.
 */
export function DesktopGitHubConnect({ purpose }: Readonly<{ purpose: string }>) {
  const github = useDesktopToolsStore((s) => s.status?.github ?? null)
  const checking = useDesktopToolsStore((s) => s.checking)
  const signInCode = useDesktopToolsStore((s) => s.signInCode)
  const error = useDesktopToolsStore((s) => s.error)
  const refresh = useDesktopToolsStore((s) => s.refresh)
  const startGitHubSignIn = useDesktopToolsStore((s) => s.startGitHubSignIn)
  const openGitHubSignInPage = useDesktopToolsStore((s) => s.openGitHubSignInPage)
  const cancelGitHubSignIn = useDesktopToolsStore((s) => s.cancelGitHubSignIn)

  useEffect(() => {
    if (useDesktopToolsStore.getState().status === null) void refresh()
  }, [refresh])

  async function copyAndOpen(code: string) {
    try {
      await navigator.clipboard.writeText(code)
    } catch {
      toast.error("Couldn't copy the code: type it on GitHub")
    }
    openGitHubSignInPage()
  }

  if (github === null) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Checking GitHub on this computer…
      </div>
    )
  }
  if (github.signedIn) return null

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 px-3 py-3">
      <div className="flex items-start gap-2.5">
        <div className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-background p-1">
          <BrandLogo slug="github" name="GitHub" className="size-full" />
        </div>
        <p className="text-xs text-muted-foreground">
          {purpose}{" "}
          {github.installed
            ? "Sign in to GitHub once: GitHub CLI keeps the connection on this computer, and TaskForce never sees it."
            : "TaskForce does it with GitHub CLI on this computer: install it, then restart TaskForce."}
        </p>
      </div>

      {!github.installed && (
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={GITHUB_CLI_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ size: "sm", variant: "outline" }), "gap-1.5")}
          >
            Install GitHub CLI <ExternalLink className="size-3.5" />
          </a>
          <Button size="sm" variant="ghost" className="gap-1.5" disabled={checking} onClick={() => void refresh()}>
            {checking ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            Check again
          </Button>
        </div>
      )}

      {github.installed && !signInCode && (
        <div>
          <Button size="sm" onClick={() => void startGitHubSignIn()}>Sign in to GitHub</Button>
        </div>
      )}

      {github.installed && signInCode && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-foreground">Enter this code on GitHub:</p>
          <code className="w-fit rounded-md border border-border bg-background px-3 py-1.5 font-mono text-base tracking-[0.2em] text-foreground">
            {signInCode}
          </code>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" className="gap-1.5" onClick={() => void copyAndOpen(signInCode)}>
              Copy the code and open GitHub <ExternalLink className="size-3.5" />
            </Button>
            <Button size="sm" variant="ghost" onClick={cancelGitHubSignIn}>Cancel</Button>
          </div>
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Loader2 className="size-3 animate-spin" /> Waiting for GitHub…
          </p>
        </div>
      )}

      {error && !signInCode && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
