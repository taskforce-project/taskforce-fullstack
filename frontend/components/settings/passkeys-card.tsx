"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import { KeyRound, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { passkeysSupported } from "@/lib/auth/passkeys"
import { usePasskeyStore } from "@/lib/store/passkey-store"
import { parseServerDate } from "@/lib/utils/server-date"

function shortDate(value: string | null): string {
  if (!value) return ""
  return parseServerDate(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

const noSubscription = () => () => {}

/**
 * Passkeys du compte : se connecter avec l'empreinte, le visage ou le code de l'appareil (Windows Hello, Touch ID, un
 * téléphone, une clé de sécurité) au lieu du mot de passe. Le navigateur crée la passkey, le serveur la vérifie.
 */
export function PasskeysCard() {
  const passkeys = usePasskeyStore((s) => s.passkeys)
  const fetchPasskeys = usePasskeyStore((s) => s.fetchPasskeys)
  const addPasskey = usePasskeyStore((s) => s.addPasskey)
  const removePasskey = usePasskeyStore((s) => s.removePasskey)
  // Lu après l'hydratation : le serveur ne connaît pas le navigateur.
  const supported = useSyncExternalStore(noSubscription, passkeysSupported, () => false)
  const [adding, setAdding] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => { void fetchPasskeys() }, [fetchPasskeys])

  async function add() {
    setAdding(true)
    const created = await addPasskey()
    setAdding(false)
    if (created) {
      toast.success("Passkey added. Use it the next time you sign in.")
      return
    }
    const error = usePasskeyStore.getState().error
    if (error) toast.error(error)
  }

  async function remove(id: string, label: string) {
    setBusyId(id)
    const ok = await removePasskey(id)
    setBusyId(null)
    if (ok) toast.success(`${label} removed`)
    else toast.error(usePasskeyStore.getState().error ?? "Couldn't remove this passkey. Please try again.")
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">Passkeys</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Sign in with your fingerprint, your face or your device PIN instead of your password.
          </p>
        </div>
        <Button size="sm" onClick={() => void add()} disabled={!supported || adding}>
          {adding && <Loader2 className="size-3.5 animate-spin" />}
          Add a passkey
        </Button>
      </div>
      {!supported && (
        <p className="text-xs text-muted-foreground">
          This browser can&apos;t create a passkey here. Use a recent browser, on the app&apos;s https address.
        </p>
      )}
      {passkeys && passkeys.length > 0 && (
        <ul className="flex flex-col divide-y divide-border/50">
          {passkeys.map((passkey) => (
            <li key={passkey.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
              <div className="flex min-w-0 items-start gap-3">
                <KeyRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate text-sm text-foreground">{passkey.label}</p>
                  <p className="text-xs text-muted-foreground">
                    Added {shortDate(passkey.createdAt)}
                    {passkey.lastUsedAt ? ` · last used ${shortDate(passkey.lastUsedAt)}` : ""}
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={busyId === passkey.id}
                onClick={() => void remove(passkey.id, passkey.label)}
              >
                {busyId === passkey.id && <Loader2 className="size-3.5 animate-spin" />}
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
