"use client"

import { useEffect, useState } from "react"
import { formatDistanceToNow } from "date-fns"
import { Loader2, Pause, Pencil, Play, RefreshCw, Send, Trash2, History, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { CopyableCode } from "@/components/settings/copyable-code"
import { EventPicker } from "@/components/settings/event-picker"
import { DeleteConfirmDialog } from "@/components/dialogs/delete-confirm-dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import { getErrorMessage, getErrorStatus } from "@/lib/api/client"
import { useIntegrationStore } from "@/lib/store/integration-store"
import { parseServerDate } from "@/lib/utils/server-date"
import type { Webhook, WebhookDelivery } from "@/lib/api/integration-service"

function ago(date: string): string {
  return formatDistanceToNow(parseServerDate(date), { addSuffix: true })
}

/** Résumé du dernier envoi d'un webhook. */
function lastDelivery(w: Webhook): string {
  if (!w.lastFiredAt) return "No delivery yet"
  const result = w.lastStatus == null ? "no response" : `HTTP ${w.lastStatus}`
  return `Last delivery: ${result}, ${ago(w.lastFiredAt)}`
}

/** Secret de signature montré une seule fois, après création ou renouvellement. */
function SecretCallout({ secret, onDismiss }: Readonly<{ secret: string; onDismiss: () => void }>) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-primary/25 bg-primary/5 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-foreground">
          Copy the signing secret now: it won&apos;t be shown again. Use it to check the
          <span className="font-mono"> X-TaskForce-Signature</span> header of each request.
        </p>
        <Button variant="ghost" size="icon" className="size-6 shrink-0" onClick={onDismiss} aria-label="Hide the secret">
          <X className="size-3.5" />
        </Button>
      </div>
      <CopyableCode label="Signing secret" text={secret} />
    </div>
  )
}

const DELIVERY_STATUS: Record<WebhookDelivery["status"], { label: string; cls: string }> = {
  DELIVERED: { label: "Delivered", cls: "border-shape-green/25 bg-shape-green/10 text-ink-green" },
  PENDING: { label: "Retrying", cls: "border-shape-yellow/25 bg-shape-yellow/10 text-ink-yellow" },
  FAILED: { label: "Failed", cls: "border-destructive/25 bg-destructive/10 text-destructive" },
}

function DeliveryList({ deliveries }: Readonly<{ deliveries: WebhookDelivery[] | undefined }>) {
  if (!deliveries) {
    return <div className="flex justify-center py-2"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>
  }
  if (deliveries.length === 0) return <p className="text-xs text-muted-foreground">No delivery yet.</p>
  return (
    <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
      {deliveries.map((d) => (
        <li key={d.deliveryId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-xs">
          <Badge variant="outline" className={cn("text-[10px]", DELIVERY_STATUS[d.status].cls)}>{DELIVERY_STATUS[d.status].label}</Badge>
          <span className="font-mono text-foreground">{d.eventType}</span>
          <span className="text-muted-foreground">
            {d.lastStatus != null ? `HTTP ${d.lastStatus}` : d.attempts > 0 ? "no response" : "not sent yet"}
            {d.attempts > 1 ? `, ${d.attempts} attempts` : ""}
          </span>
          <span className="ml-auto text-muted-foreground">{ago(d.createdAt)}</span>
          {d.lastError && d.status !== "DELIVERED" && (
            <span className="w-full truncate text-muted-foreground" title={d.lastError}>{d.lastError}</span>
          )}
          {d.status === "PENDING" && d.nextAttemptAt && (
            <span className="w-full text-muted-foreground">Next attempt {ago(d.nextAttemptAt)}</span>
          )}
        </li>
      ))}
    </ul>
  )
}

/** Un webhook : état, dernier envoi, actions, modification en place et historique. */
function WebhookRow({ slug, webhook, onSecret }: Readonly<{ slug: string; webhook: Webhook; onSecret: (secret: string) => void }>) {
  const { editWebhook, removeWebhook, rotateWebhookSecret, sendWebhookTest, fetchWebhookDeliveries, webhookDeliveries } =
    useIntegrationStore()
  const [busy, setBusy] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [url, setUrl] = useState(webhook.url)
  const [events, setEvents] = useState<string[]>(webhook.eventTypes)
  const [showDeliveries, setShowDeliveries] = useState(false)
  const [confirming, setConfirming] = useState<"secret" | "delete" | null>(null)

  async function run(action: string, fn: () => Promise<void>) {
    setBusy(action)
    try {
      await fn()
    } catch (e) {
      toast.error(getErrorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  const test = () => run("test", async () => {
    const d = await sendWebhookTest(slug, webhook.id)
    if (d.status === "DELIVERED") toast.success(`Test delivered (HTTP ${d.lastStatus})`)
    else toast.error(`Test failed: ${d.lastStatus != null ? `HTTP ${d.lastStatus}` : d.lastError ?? "no response"}`)
  })
  const toggleActive = () => run("active", async () => {
    await editWebhook(slug, webhook.id, { url: webhook.url, eventTypes: webhook.eventTypes, active: !webhook.active })
    toast.success(webhook.active ? "Webhook paused" : "Webhook resumed")
  })
  const save = () => run("save", async () => {
    await editWebhook(slug, webhook.id, { url: url.trim(), eventTypes: events })
    setEditing(false)
    toast.success("Webhook updated")
  })
  const rotate = () => run("secret", async () => {
    onSecret(await rotateWebhookSecret(slug, webhook.id))
  })
  const remove = () => run("delete", async () => {
    await removeWebhook(slug, webhook.id)
    toast.success("Webhook deleted")
  })
  const toggleDeliveries = () => {
    const next = !showDeliveries
    setShowDeliveries(next)
    if (next) fetchWebhookDeliveries(slug, webhook.id).catch((e) => toast.error(getErrorMessage(e)))
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border px-3 py-2.5">
      {editing ? (
        <div className="flex flex-col gap-2">
          <Input type="url" value={url} onChange={(e) => setUrl(e.target.value)} className="h-control font-mono text-xs" />
          <EventPicker value={events} onChange={setEvents} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setEditing(false); setUrl(webhook.url); setEvents(webhook.eventTypes) }}>
              Cancel
            </Button>
            <Button size="sm" className="h-7 text-xs" disabled={!url.trim() || busy !== null} onClick={save}>
              {busy === "save" && <Loader2 className="size-3 animate-spin" />} Save
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate font-mono text-sm text-foreground">{webhook.url}</p>
              <Badge variant="outline" className={cn("shrink-0 text-[10px]", webhook.active
                ? "border-shape-green/25 bg-shape-green/10 text-ink-green" : "text-muted-foreground")}>
                {webhook.active ? "Active" : "Paused"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {webhook.eventTypes.length === 0 ? "All events" : webhook.eventTypes.join(", ")} · {lastDelivery(webhook)}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1">
            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={test} disabled={busy !== null || !webhook.active}>
              {busy === "test" ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />} Send test
            </Button>
            <Button variant="ghost" size="icon" className="size-7" onClick={toggleDeliveries} aria-label="Recent deliveries" title="Recent deliveries">
              <History className="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="size-7" onClick={() => setEditing(true)} aria-label="Edit" title="Edit">
              <Pencil className="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="size-7" onClick={toggleActive} disabled={busy !== null}
                    aria-label={webhook.active ? "Pause" : "Resume"} title={webhook.active ? "Pause" : "Resume"}>
              {webhook.active ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
            </Button>
            <Button variant="ghost" size="icon" className="size-7" onClick={() => setConfirming("secret")} disabled={busy !== null}
                    aria-label="New signing secret" title="New signing secret">
              <RefreshCw className="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="size-7 text-destructive hover:bg-destructive/10" onClick={() => setConfirming("delete")}
                    disabled={busy !== null} aria-label="Delete" title="Delete">
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </div>
      )}
      {showDeliveries && <DeliveryList deliveries={webhookDeliveries[webhook.id]} />}
      <AlertDialog open={confirming === "secret"} onOpenChange={(open) => { if (!open) setConfirming(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Make a new signing secret?</AlertDialogTitle>
            <AlertDialogDescription>
              The current secret stops signing deliveries at once: update it wherever you check signatures.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirming(null); rotate() }}>Make a new secret</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <DeleteConfirmDialog
        open={confirming === "delete"}
        onOpenChange={(open) => { if (!open) setConfirming(null) }}
        title="Delete this webhook?"
        description="Nothing more is sent to this address, and its delivery history is deleted."
        onConfirm={() => { setConfirming(null); remove() }}
      />
    </div>
  )
}

/**
 * Webhooks sortants du workspace (OSS-6.2) : envoyer les événements à n8n, Zapier, Make ou un script maison.
 * Réservé aux propriétaires et administrateurs : un membre voit pourquoi la section est fermée.
 */
export function WebhooksPanel({ slug }: Readonly<{ slug: string }>) {
  const { webhooks, fetchWebhooks, addWebhook } = useIntegrationStore()
  const [state, setState] = useState<"loading" | "ready" | "forbidden" | "error">("loading")
  const [url, setUrl] = useState("")
  const [events, setEvents] = useState<string[]>(["issue.created"])
  const [adding, setAdding] = useState(false)
  const [secret, setSecret] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) return
    fetchWebhooks(slug)
      .then(() => setState("ready"))
      .catch((e) => setState(getErrorStatus(e) === 403 ? "forbidden" : "error"))
  }, [slug, fetchWebhooks])

  async function handleAdd() {
    if (!url.trim()) return
    setAdding(true)
    try {
      const created = await addWebhook(slug, { url: url.trim(), eventTypes: events })
      setUrl("")
      setSecret(created.secret)
      toast.success("Webhook added")
    } catch (e) {
      toast.error(getErrorMessage(e))
    } finally {
      setAdding(false)
    }
  }

  if (state === "loading") {
    return <div className="flex justify-center py-4"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>
  }
  if (state === "forbidden") {
    return (
      <p className="text-sm text-muted-foreground">
        Only owners and admins manage webhooks: a webhook sends the workspace&apos;s content to another address.
      </p>
    )
  }
  if (state === "error") {
    return <p className="text-sm text-muted-foreground">The webhooks could not be loaded.</p>
  }

  return (
    <div className="flex flex-col gap-3">
      {secret && <SecretCallout secret={secret} onDismiss={() => setSecret(null)} />}

      {webhooks.length > 0 && (
        <div className="flex flex-col gap-2">
          {webhooks.map((wh) => (
            <WebhookRow key={wh.id} slug={slug} webhook={wh} onSecret={setSecret} />
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Input
          type="url"
          placeholder="https://example.com/webhook"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="h-control"
        />
        <Button size="sm" className="h-control shrink-0 text-xs" disabled={!url.trim() || adding} onClick={handleAdd}>
          {adding ? "Adding…" : "Add webhook"}
        </Button>
      </div>
      <EventPicker value={events} onChange={setEvents} />

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Each event is a JSON POST, signed: <span className="font-mono">X-TaskForce-Signature</span> is
        <span className="font-mono"> sha256=</span>HMAC-SHA256 of
        <span className="font-mono"> X-TaskForce-Timestamp + &quot;.&quot; + body</span> with the signing secret. A failed
        delivery is retried for about 9 hours.
      </p>
    </div>
  )
}
