"use client"

import { useEffect, useState } from "react"
import { KeyRound, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { CopyableCode } from "@/components/settings/copyable-code"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { AccessToken, CreatedAccessToken } from "@/lib/api/access-token-service"
import { DELIVERY_ROUTES } from "@/lib/config/api-routes"
import { API_URL } from "@/lib/config/urls"
import { useAccessTokenStore } from "@/lib/store/access-token-store"
import { parseServerDate } from "@/lib/utils/server-date"

/**
 * Claude Code en mode interactif (lot 5) : la personne branche SON Claude Code sur le serveur MCP de l'instance avec
 * un jeton personnel, et travaille ses issues depuis son terminal. Le jeton agit en son nom, sur le serveur MCP
 * seulement ; il ne passe jamais par l'état global (gardé ici le temps de la copie, effacé par « Done »).
 */

const EXPIRY_OPTIONS: Array<{ value: string; label: string; days: number | null }> = [
  { value: "30", label: "30 days", days: 30 },
  { value: "90", label: "90 days", days: 90 },
  { value: "365", label: "1 year", days: 365 },
  { value: "never", label: "No expiration", days: null },
]

/** Adresse du serveur MCP du workspace, telle que Claude Code doit la joindre. */
export function mcpServerUrl(slug: string, apiUrl: string = API_URL): string {
  return `${apiUrl.replace(/\/+$/, "")}${DELIVERY_ROUTES.MCP_SERVER(slug)}`
}

/** Commande qui branche Claude Code sur le serveur MCP du workspace avec ce jeton. */
export function claudeMcpAddCommand(slug: string, token: string, apiUrl: string = API_URL): string {
  return `claude mcp add --transport http taskforce ${mcpServerUrl(slug, apiUrl)} --header "Authorization: Bearer ${token}"`
}

function shortDate(value: string | null): string {
  if (!value) return ""
  return parseServerDate(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export function ClaudeCodeMcpSetup({ slug }: Readonly<{ slug: string }>) {
  const tokens = useAccessTokenStore((s) => s.tokens)
  const fetchTokens = useAccessTokenStore((s) => s.fetchTokens)
  const createToken = useAccessTokenStore((s) => s.createToken)
  const revokeToken = useAccessTokenStore((s) => s.revokeToken)

  const [creating, setCreating] = useState(false)
  const [name, setName] = useState("Claude Code")
  const [expiry, setExpiry] = useState("90")
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<CreatedAccessToken | null>(null)

  useEffect(() => { fetchTokens() }, [fetchTokens])

  async function onCreate() {
    const days = EXPIRY_OPTIONS.find((o) => o.value === expiry)?.days ?? null
    setBusy(true)
    const res = await createToken(name.trim() || "Claude Code", days)
    setBusy(false)
    if (res) {
      setCreated(res)
      setCreating(false)
      toast.success("Access token created")
    } else {
      toast.error("Couldn't create the token. Please try again.")
    }
  }

  async function onRevoke(token: AccessToken) {
    const ok = await revokeToken(token.id)
    if (ok) toast.success(`"${token.name}" revoked: it stops working right away`)
    else toast.error("Couldn't revoke the token. Please try again.")
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed border-border p-2">
      <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
        <KeyRound className="size-3.5 text-muted-foreground" /> Claude Code in your terminal
      </span>
      <p className="text-[11px] text-muted-foreground">
        Work on your issues from your own Claude Code: it connects to the MCP server of this workspace with a personal
        access token. The token acts as you, and only on the MCP server.
      </p>

      {tokens && tokens.length > 0 && (
        <ul className="flex flex-col divide-y divide-border/50 rounded border border-border/60">
          {tokens.map((token) => (
            <li key={token.id} className="flex items-center gap-2 px-2 py-1.5">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
                  {token.name}
                  <code className="rounded bg-muted px-1 text-[10px] font-normal">{token.hint}...</code>
                  {token.expired && <Badge variant="secondary" className="text-[9px] uppercase">Expired</Badge>}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Created {shortDate(token.createdAt)}
                  {token.lastUsedAt ? ` · last used ${shortDate(token.lastUsedAt)}` : " · never used"}
                  {token.expiresAt ? ` · ${token.expired ? "expired" : "expires"} ${shortDate(token.expiresAt)}` : " · no expiration"}
                </p>
              </div>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-destructive" onClick={() => onRevoke(token)}>
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}

      {!creating && !created && (
        <div>
          <Button size="sm" className="h-7 text-xs" onClick={() => setCreating(true)}>Create an access token</Button>
        </div>
      )}

      {creating && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-40 flex-1 flex-col gap-1 text-[11px] text-muted-foreground">
            Name
            <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} className="h-7 text-xs" />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
            Expires
            <Select value={expiry} onValueChange={setExpiry}>
              <SelectTrigger className="h-7 w-36 text-xs" aria-label="Expiration"><SelectValue /></SelectTrigger>
              <SelectContent position="popper">
                {EXPIRY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          <Button size="sm" className="h-7 text-xs" disabled={busy} onClick={onCreate}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : "Create"}
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={busy} onClick={() => setCreating(false)}>
            Cancel
          </Button>
        </div>
      )}

      {created && (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-medium text-ink-yellow">Copy it now: the token is shown only once.</p>
          <CopyableCode label="1. Add the TaskForce MCP server to Claude Code" text={claudeMcpAddCommand(slug, created.value)} />
          <CopyableCode label="2. Then ask Claude Code, for example" text="List my TaskForce issues and pick one to work on." />
          <p className="text-[10px] text-muted-foreground">
            Other MCP clients connect the same way: the server is {mcpServerUrl(slug)}, with the header
            Authorization: Bearer and your token. Revoke the token here when you no longer use it.
          </p>
          <div>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setCreated(null)}>Done</Button>
          </div>
        </div>
      )}
    </div>
  )
}
