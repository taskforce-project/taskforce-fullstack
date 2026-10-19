"use client"

import { useEffect, useState } from "react"
import { Loader2, TerminalSquare } from "lucide-react"
import { toast } from "sonner"

import { CopyableCode } from "@/components/settings/copyable-code"
import { Button } from "@/components/ui/button"
import { useDeliveryStore } from "@/lib/store/delivery-store"
import type { RunnerProvision } from "@/lib/api/delivery-service"
import { API_URL } from "@/lib/config/urls"

/**
 * « Connect a runner » en libre-service (ADR-013) : crée l'identité machine du runner local de l'utilisateur
 * connecté, puis affiche UNE fois son `.env` et les commandes pour le lancer. Remplace le script d'admin
 * (`scripts/keycloak-runner.ps1`, `ops/kc-runner.sh`) pour tout utilisateur.
 *
 * <p>Le secret ne passe jamais par le store global : l'action le renvoie, ce composant le garde en état local
 * le temps de la copie, et « Done » l'efface. Le runner fait tourner le Claude Code de la personne, avec son
 * propre compte : TaskForce ne voit jamais son login Claude (conditions d'Anthropic, cf. ADR-013).</p>
 */

/**
 * Dépôt public d'où l'on récupère le runner (accès anticipé : pas encore publié sur npm). Le serveur MCP n'est plus à
 * installer : le runner branche l'agent sur celui de l'instance.
 */
const REPO_URL = "https://github.com/taskforce-project/taskforce-fullstack.git"

const INSTALL_COMMANDS = [
  `git clone --depth 1 ${REPO_URL}`,
  "cd taskforce-fullstack/taskforce-runner && npm install",
].join("\n")

const RUN_COMMANDS = ["npm run check", "npm run dev"].join("\n")

/** Contenu du `.env` du runner : URL publique de l'API (suffixe `/api`) + identité fraîchement créée. */
export function runnerEnvFile(credentials: RunnerProvision, apiUrl: string = API_URL): string {
  return [
    `TASKFORCE_API_URL=${apiUrl.replace(/\/+$/, "")}/api`,
    `TASKFORCE_RUNNER_CLIENT_ID=${credentials.clientId}`,
    `TASKFORCE_RUNNER_CLIENT_SECRET=${credentials.clientSecret}`,
  ].join("\n")
}

export function LocalRunnerSetup() {
  const runner = useDeliveryStore((s) => s.runner)
  const fetchRunner = useDeliveryStore((s) => s.fetchRunner)
  const provisionRunner = useDeliveryStore((s) => s.provisionRunner)

  const [credentials, setCredentials] = useState<RunnerProvision | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => { fetchRunner() }, [fetchRunner])

  async function onProvision() {
    const regenerating = Boolean(runner?.exists)
    setBusy(true)
    const res = await provisionRunner()
    setBusy(false)
    setConfirming(false)
    if (res) {
      setCredentials(res)
      toast.success(regenerating ? "New runner secret generated" : "Local runner created")
    } else {
      toast.error("Couldn't set up the runner. Please try again.")
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed border-border p-2">
      <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
        <TerminalSquare className="size-3.5 text-muted-foreground" /> Local runner
      </span>
      <p className="text-[11px] text-muted-foreground">
        {runner?.exists ? (
          <>
            Identity <code className="rounded bg-muted px-1 text-[10px]">{runner.clientId}</code> is set up for{" "}
            {runner.ownerEmail}. It only picks up the tasks you delegate. Regenerate the secret if you lost it.
          </>
        ) : (
          <>
            Create your runner identity, then start the runner on your machine. It runs your own Claude Code with
            your own account: TaskForce never sees your Claude login.
          </>
        )}
      </p>

      {!credentials && !confirming && (
        <div>
          {runner?.exists ? (
            <Button variant="outline" size="sm" className="h-7 text-xs" disabled={busy} onClick={() => setConfirming(true)}>
              Regenerate secret
            </Button>
          ) : (
            <Button size="sm" className="h-7 text-xs" disabled={busy} onClick={onProvision}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : "Set up local runner"}
            </Button>
          )}
        </div>
      )}

      {confirming && (
        <div className="flex flex-col gap-1.5 rounded border border-shape-yellow/30 bg-shape-yellow/5 p-2">
          <span className="text-[11px] text-foreground">
            A new secret replaces the current one: a runner already started stops working until you paste the new
            secret.
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" className="h-7 text-xs" disabled={busy} onClick={onProvision}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : "Regenerate"}
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={busy} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {credentials && (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-medium text-ink-yellow">
            Copy it now: the secret is shown only once.
          </p>
          <CopyableCode label="1. Get the runner (Node 20+, git)" text={INSTALL_COMMANDS} />
          <CopyableCode label="2. Save as taskforce-runner/.env" text={runnerEnvFile(credentials)} />
          <CopyableCode label="3. Check, then start" text={RUN_COMMANDS} />
          <p className="text-[10px] text-muted-foreground">
            Needs Claude Code 2.1.293 or later, installed and signed in once (npm install -g @anthropic-ai/claude-code,
            then claude), and gh signed in so the runner can open pull requests. While it works, follow it live on the
            issue, and allow or deny the actions it asks for.
          </p>
          <div>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setCredentials(null)}>
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
