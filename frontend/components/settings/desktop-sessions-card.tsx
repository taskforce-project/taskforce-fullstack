"use client"

import { useEffect, useState } from "react"
import { Loader2, Monitor } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { useDesktopSessionStore } from "@/lib/store/desktop-session-store"
import { parseServerDate } from "@/lib/utils/server-date"

function shortDate(value: string | null): string {
  if (!value) return ""
  return parseServerDate(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

/**
 * Ordinateurs connectés à l'app desktop (connexion par la page /auth/desktop). Déconnecter un ordinateur ferme sa
 * session : l'app demande de se reconnecter à son prochain lancement. Rien à montrer tant qu'aucun ne l'est.
 */
export function DesktopSessionsCard() {
  const sessions = useDesktopSessionStore((s) => s.sessions)
  const fetchSessions = useDesktopSessionStore((s) => s.fetchSessions)
  const revokeSession = useDesktopSessionStore((s) => s.revokeSession)
  const [busyId, setBusyId] = useState<number | null>(null)

  useEffect(() => { void fetchSessions() }, [fetchSessions])

  if (!sessions || sessions.length === 0) return null

  async function signOut(id: number, name: string) {
    setBusyId(id)
    const ok = await revokeSession(id)
    setBusyId(null)
    if (ok) toast.success(`${name} is signed out of TaskForce Desktop`)
    else toast.error(useDesktopSessionStore.getState().error ?? "Couldn't sign this computer out. Please try again.")
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
      <div>
        <p className="text-sm font-medium text-foreground">TaskForce Desktop</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Computers signed in to the desktop app with this account. Sign one out and the app asks to sign in again.
        </p>
      </div>
      <ul className="flex flex-col divide-y divide-border/50">
        {sessions.map((session) => (
          <li key={session.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
            <div className="flex min-w-0 items-start gap-3">
              <Monitor className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="truncate text-sm text-foreground">{session.name}</p>
                <p className="text-xs text-muted-foreground">
                  Signed in {shortDate(session.createdAt)}
                  {session.lastUsedAt ? ` · last opened ${shortDate(session.lastUsedAt)}` : ""}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={busyId === session.id}
              onClick={() => void signOut(session.id, session.name)}
            >
              {busyId === session.id && <Loader2 className="size-3.5 animate-spin" />}
              Sign out
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
