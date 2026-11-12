"use client"

import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, Check, Copy, ExternalLink, Loader2, Plug, ShieldCheck, Terminal } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DialogFooter } from "@/components/ui/dialog"
import { McpActionConsole } from "@/components/integrations/mcp-action-console"
import { GoogleDriveFiles } from "@/components/storage/google-drive-files"
import { DisconnectConfirmDialog } from "@/components/integrations/disconnect-confirm-dialog"
import { IS_DESKTOP } from "@/lib/desktop"
import { fillText } from "@/lib/delivery/result-card"
import { getMcpServerTools, type ConnectorView, type McpServerStatus, type McpToolInfo } from "@/lib/api/integration-service"
import { useConnectorStore } from "@/lib/store/connector-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { toolLabel } from "@/lib/utils/tool-label"
import type { CONSTANTS_EN } from "@/lib/constants_en"

type ConnectTexts = (typeof CONSTANTS_EN)["connect"]

type PanelProps = Readonly<{
  slug: string
  tool: ConnectorView
  /** Propriétaire ou administrateur de l'espace : il partage une source, saisit l'application de l'entreprise. */
  manager: boolean
  /** Le catalogue se relit : l'état de l'outil a changé. */
  onChanged: () => void
  /** La console d'actions, dépliée, élargit le dialogue. */
  onWide?: (wide: boolean) => void
}>

/** Le chemin d'un outil tel que la carte le dit (R133 : pas de mot interne). */
export function pathLabel(tool: ConnectorView, t: ConnectTexts): string | null {
  switch (tool.connection) {
    case "self-registration":
    case "our-app":
      return t.pathOneClick
    case "company-app":
      return t.pathAdminFirst
    case "api-key":
    case "server-url":
      return t.pathKey
    case "open":
      return t.pathOpen
    default:
      return null
  }
}

/**
 * Se brancher à un outil du catalogue (TF-J2-12, séance n°22 R154) : un clic, le navigateur, la connexion chez
 * l'éditeur, le retour, « Connected as … ». Derrière, le serveur choisit le chemin que l'éditeur permet et dit la suite :
 * le navigateur, c'est branché, l'étape de l'administrateur (une phrase et un message à lui envoyer, ou le formulaire de
 * l'application de l'entreprise), la clé guidée, l'accord d'un serveur local. Une colonne, une action principale en bas
 * à droite (R133).
 */
export function ConnectPanel({ slug, tool, manager, onChanged, onWide }: PanelProps) {
  const t = usePreferencesStore((s) => s.t.connect)
  const outcome = useConnectorStore((s) => s.outcomes[tool.key])
  const busy = useConnectorStore((s) => s.busy === tool.key)
  const waiting = useConnectorStore((s) => s.waiting === tool.key)
  const connect = useConnectorStore((s) => s.connect)
  const waitForConnection = useConnectorStore((s) => s.waitForConnection)
  const stopWaiting = useConnectorStore((s) => s.stopWaiting)
  const forget = useConnectorStore((s) => s.forget)
  const [shared, setShared] = useState(false)
  const [allowWrites, setAllowWrites] = useState(false)
  // La clé guidée, quand l'éditeur en propose une : un autre chemin que l'administrateur (GitHub, Stripe).
  const [byKey, setByKey] = useState(false)
  const name = tool.name

  const go = useCallback(async (extra: Parameters<typeof connect>[2] = {}) => {
    const result = await connect(slug, tool.key, { shared, allowWrites, ...extra })
    if (!result) {
      const error = useConnectorStore.getState().error
      toast.error(error ? `${fillText(t.failed, { name })} ${error}` : fillText(t.failed, { name }))
      return
    }
    if (result.next === "browser" && result.authorizeUrl) {
      if (IS_DESKTOP) {
        // Le navigateur du système (RFC 8252) ; la fenêtre de l'app reste, et attend le retour sur 127.0.0.1.
        window.open(result.authorizeUrl, "_blank", "noopener")
        const ok = await waitForConnection(slug, tool.key)
        if (ok) {
          forget(tool.key)
          toast.success(fillText(t.returnedConnected, { name }))
          onChanged()
        }
      } else {
        window.location.href = result.authorizeUrl
      }
    } else if (result.next === "connected") {
      forget(tool.key)
      toast.success(fillText(t.returnedConnected, { name }))
      onChanged()
    }
  }, [connect, slug, tool.key, shared, allowWrites, t, name, waitForConnection, forget, onChanged])

  if (tool.blocked) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-foreground">{t.notAvailable}</p>
        <p className="text-sm text-muted-foreground">{tool.blocked}</p>
      </div>
    )
  }
  if (waiting) {
    return (
      <div className="flex flex-col gap-3" aria-live="polite">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Loader2 className="size-4 animate-spin" /> {t.browserTitle}
        </div>
        <p className="text-sm text-muted-foreground">{fillText(t.browserText, { name })}</p>
        <DialogFooter>
          <Button variant="outline" onClick={stopWaiting}>{t.cancel}</Button>
        </DialogFooter>
      </div>
    )
  }
  if (tool.state === "CONNECTED" && !outcome) {
    return <ConnectedView slug={slug} tool={tool} manager={manager} onChanged={onChanged} onWide={onWide} />
  }

  const step = byKey ? "key" : outcome?.next
    ?? (tool.state === "WAITING_FOR_ADMIN" ? (manager && tool.connection === "company-app" ? "company-app" : "admin") : "start")
  const adminMessage = outcome?.message ?? tool.admin?.text ?? null

  if (step === "admin") {
    return <AdminStep name={name} message={adminMessage} link={tool.admin?.link ?? null} busy={busy} onRetry={() => go()}
      onUseKey={tool.apiKey ? () => setByKey(true) : undefined} />
  }
  if (step === "company-app") {
    return <CompanyAppForm slug={slug} tool={tool} instructions={adminMessage} onSaved={() => go()}
      onUseKey={tool.apiKey ? () => setByKey(true) : undefined} />
  }
  if (step === "key") {
    return <KeyForm tool={tool} busy={busy} onSubmit={(value) => go(tool.connection === "server-url"
      ? { mcpUrl: value } : { mcpToken: value })} />
  }
  if (step === "local") {
    return <LocalStep message={outcome?.message ?? null} busy={busy} onApprove={() => go({ localApproved: true })} />
  }

  const reconnecting = tool.state === "NEEDS_RECONNECT"
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {reconnecting ? fillText(t.needsReconnectingText, { name }) : fillText(shared ? t.introShared : t.intro, { name })}
      </p>
      {tool.admin && !tool.admin.required && (
        <details className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none">{fillText(t.adminNote, { name })}</summary>
          <p className="mt-2 leading-relaxed">{tool.admin.text}</p>
        </details>
      )}
      {tool.writeChoice && (
        <label className="flex items-start gap-2 text-sm text-foreground">
          <input type="checkbox" className="mt-1" checked={allowWrites} onChange={(e) => setAllowWrites(e.target.checked)} />
          <span>{t.allowChanges}<span className="block text-xs text-muted-foreground">{t.allowChangesHelp}</span></span>
        </label>
      )}
      {manager && (
        <label className="flex items-start gap-2 text-sm text-foreground">
          <input type="checkbox" className="mt-1" checked={shared} onChange={(e) => setShared(e.target.checked)} />
          <span>{t.shareWithWorkspace}<span className="block text-xs text-muted-foreground">{fillText(t.shareWithWorkspaceHelp, { name })}</span></span>
        </label>
      )}
      <DialogFooter>
        <Button onClick={() => go()} disabled={busy} className="gap-1.5">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Plug className="size-3.5" />}
          {busy ? t.connecting : reconnecting ? t.reconnect : t.connect}
        </Button>
      </DialogFooter>
    </div>
  )
}

/** L'étape de l'administrateur : une phrase, le message à lui envoyer, sa page, et « Try again ». */
function AdminStep({ name, message, link, busy, onRetry, onUseKey }: Readonly<{
  name: string; message: string | null; link: string | null; busy: boolean; onRetry: () => void; onUseKey?: () => void
}>) {
  const t = usePreferencesStore((s) => s.t.connect)
  const [copied, setCopied] = useState(false)
  async function copy() {
    if (!message) return
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium text-foreground">{t.waitingForAdmin}</p>
      <p className="text-sm text-muted-foreground">{fillText(t.adminText, { name })}</p>
      {message && (
        <blockquote className="rounded-md border border-border bg-muted/40 p-3 text-xs leading-relaxed text-foreground">{message}</blockquote>
      )}
      <div className="flex flex-wrap gap-2">
        {message && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={copy}>
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? t.copied : t.copyMessage}
          </Button>
        )}
        {link && (
          <a href={link} target="_blank" rel="noopener noreferrer"
             className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted">
            {t.openAdminPage} <ExternalLink className="size-3" />
          </a>
        )}
      </div>
      <DialogFooter>
        {onUseKey && <Button variant="ghost" onClick={onUseKey}>{t.useKeyInstead}</Button>}
        <Button onClick={onRetry} disabled={busy}>{busy ? t.connecting : t.tryAgain}</Button>
      </DialogFooter>
    </div>
  )
}

/** L'application de l'entreprise (chemin C) : son administrateur la crée chez l'éditeur, puis la saisit ici une fois. */
function CompanyAppForm({ slug, tool, instructions, onSaved, onUseKey }: Readonly<{
  slug: string; tool: ConnectorView; instructions: string | null; onSaved: () => void; onUseKey?: () => void
}>) {
  const t = usePreferencesStore((s) => s.t.connect)
  const save = useConnectorStore((s) => s.saveCompanyApp)
  const busy = useConnectorStore((s) => s.busy === tool.key)
  const [clientId, setClientId] = useState("")
  const [secret, setSecret] = useState("")
  async function submit() {
    if (await save(slug, tool.key, clientId.trim(), secret.trim())) {
      toast.success(t.companyAppSaved)
      onSaved()
    } else {
      toast.error(useConnectorStore.getState().error ?? t.failedAdmin)
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium text-foreground">{t.companyAppTitle}</p>
      <p className="text-sm text-muted-foreground">{fillText(t.companyAppText, { name: tool.name })}</p>
      {instructions && (
        <p className="rounded-md border border-border bg-muted/40 p-3 text-xs leading-relaxed text-foreground">{instructions}</p>
      )}
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">{t.clientId}</span>
        <Input value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="off" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">{t.clientSecret}</span>
        <Input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="off" />
        {tool.companyApp && <span className="text-[11px] text-muted-foreground">{t.clientSecretKept}</span>}
      </label>
      <DialogFooter>
        {onUseKey && <Button variant="ghost" onClick={onUseKey}>{t.useKeyInstead}</Button>}
        <Button onClick={submit} disabled={busy || !clientId.trim()}>{busy ? t.connecting : t.saveAndConnect}</Button>
      </DialogFooter>
    </div>
  )
}

/** La clé guidée (chemin D), ou l'adresse du serveur que l'entreprise crée chez l'éditeur : elle vaut une clé. */
function KeyForm({ tool, busy, onSubmit }: Readonly<{ tool: ConnectorView; busy: boolean; onSubmit: (value: string) => void }>) {
  const t = usePreferencesStore((s) => s.t.connect)
  const [value, setValue] = useState("")
  const address = tool.connection === "server-url"
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium text-foreground">{t.keyTitle}</p>
      {tool.apiKey && <p className="text-sm text-muted-foreground">{tool.apiKey.hint}</p>}
      {tool.apiKey?.link && (
        <a href={tool.apiKey.link} target="_blank" rel="noopener noreferrer"
           className="inline-flex w-fit items-center gap-1 text-xs text-foreground underline underline-offset-2">
          {t.createKey} <ExternalLink className="size-3" />
        </a>
      )}
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">{address ? t.serverAddressLabel : t.keyLabel}</span>
        <Input type="password" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" />
      </label>
      <DialogFooter>
        <Button onClick={() => onSubmit(value.trim())} disabled={busy || !value.trim()}>{busy ? t.connecting : t.connect}</Button>
      </DialogFooter>
    </div>
  )
}

/** Un serveur sur la machine ou le réseau local : la personne voit son adresse, et l'accepte (bonnes pratiques MCP). */
function LocalStep({ message, busy, onApprove }: Readonly<{ message: string | null; busy: boolean; onApprove: () => void }>) {
  const t = usePreferencesStore((s) => s.t.connect)
  const [confirmed, setConfirmed] = useState(false)
  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-2 text-sm font-medium text-foreground"><ShieldCheck className="size-4" /> {t.localTitle}</p>
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> {t.localConfirm}
      </label>
      <DialogFooter>
        <Button onClick={onApprove} disabled={busy || !confirmed}>{busy ? t.connecting : t.connect}</Button>
      </DialogFooter>
    </div>
  )
}

/**
 * Branché : « Connected as … », à qui est la connexion, les outils qui ont changé depuis la connexion (en attente d'un
 * nouvel accord), ce que Cortex peut faire (un clic plus loin), la console (deux clics), et la déconnexion qui révoque.
 */
function ConnectedView({ slug, tool, manager, onChanged, onWide }: PanelProps) {
  const t = usePreferencesStore((s) => s.t.connect)
  const servers = useConnectorStore((s) => s.servers)
  const approveTools = useConnectorStore((s) => s.approveTools)
  const disconnect = useConnectorStore((s) => s.disconnect)
  const busy = useConnectorStore((s) => s.busy === tool.key)
  const [status, setStatus] = useState<McpServerStatus | null>(null)
  const [tools, setTools] = useState<McpToolInfo[] | null>(null)
  const [showConsole, setShowConsole] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const shared = tool.scope === "WORKSPACE"
  const mayChange = !shared || manager

  useEffect(() => {
    let alive = true
    void servers(slug).then((list) => {
      if (!alive || !list) return
      setStatus(list.find((s) => s.connectorKey === tool.key && s.scope === (tool.scope ?? s.scope)) ?? null)
    })
    return () => { alive = false }
  }, [servers, slug, tool.key, tool.scope])

  async function loadTools() {
    if (tools) { setTools(null); return }
    try {
      setTools(await getMcpServerTools(slug, tool.key))
    } catch {
      setTools([])
    }
  }

  async function approve() {
    const list = await approveTools(slug, tool.key, shared)
    if (!list) { toast.error(useConnectorStore.getState().error ?? t.failedAdmin); return }
    setStatus(list.find((s) => s.connectorKey === tool.key) ?? null)
    toast.success(t.changesApproved)
    onChanged()
  }

  async function onDisconnect() {
    setConfirming(false)
    const result = await disconnect(slug, tool.key, shared)
    if (!result) { toast.error(useConnectorStore.getState().error ?? t.failedAdmin); return }
    toast.success(fillText(result.revoked ? t.disconnectedRevoked : t.disconnectedHere, { name: tool.name }))
    onChanged()
  }

  const changed = status?.changedTools ?? []
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 rounded-md border border-shape-green/25 bg-shape-green/10 p-3 text-sm text-ink-green">
        <Check className="size-4 shrink-0" />
        <span>
          {tool.accountLabel ? fillText(t.connectedAs, { account: tool.accountLabel })
            : shared ? t.connected : t.connectedWithYourAccount}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">{shared ? t.shared : t.yours}</span>
      </div>
      {/* Google Drive, avec drive.file : Cortex ne lit que ce que la personne choisit ici (TF-J2-14). */}
      {tool.key === "google-drive" && !shared && <GoogleDriveFiles slug={slug} />}
      {status && !status.reachable && (
        <p className="flex items-start gap-2 text-xs text-ink-yellow">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {fillText(t.unreachable, { name: tool.name })}
        </p>
      )}
      {changed.length > 0 && (
        <div className="flex flex-col gap-2 rounded-md border border-shape-yellow/25 bg-shape-yellow/10 p-3 text-xs text-ink-yellow">
          <span>{changed.length === 1 ? t.toolChanged : fillText(t.toolsChanged, { count: changed.length })}</span>
          <ul className="list-disc pl-4 text-foreground">
            {changed.map((name) => <li key={name}>{toolLabel(name, tool.name)}</li>)}
          </ul>
          {mayChange && (
            <Button size="sm" variant="outline" className="w-fit" onClick={approve} disabled={busy}>{t.approveChanges}</Button>
          )}
        </div>
      )}
      <button type="button" onClick={loadTools} className="w-fit text-xs text-muted-foreground hover:text-foreground">
        {t.whatCortexCanDo}
      </button>
      {tools && (
        <ul className="flex flex-col gap-1 text-xs">
          {tools.filter((x) => !x.changed).map((x) => (
            <li key={x.name} className="flex justify-between gap-2">
              <span className="text-foreground">{toolLabel(x.name, tool.name)}</span>
              <span className="text-muted-foreground">{x.readOnly ? t.reads : t.asksFirst}</span>
            </li>
          ))}
        </ul>
      )}
      {showConsole && <McpActionConsole slug={slug} connectorKey={tool.key} connectorName={tool.name} />}
      <DialogFooter className="sm:justify-between">
        {mayChange ? (
          <Button variant="outline" size="sm" className="h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                  onClick={() => setConfirming(true)} disabled={busy}>
            {t.disconnect}
          </Button>
        ) : <span />}
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" title={t.runAction}
                onClick={() => { const next = !showConsole; setShowConsole(next); onWide?.(next) }}>
          <Terminal className="size-3" /> {showConsole ? t.hideActions : t.runAction}
        </Button>
      </DialogFooter>
      <DisconnectConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        name={tool.name}
        consequence={fillText(t.disconnectConsequence, { name: tool.name })}
        onConfirm={onDisconnect}
      />
    </div>
  )
}
