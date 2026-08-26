"use client"

import { useState } from "react"
import QRCode from "qrcode"
import { toast } from "sonner"
import { Loader2, ShieldCheck, Copy, Check } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { setupTwoFactor, confirmTwoFactor } from "@/lib/api/user-service"
import { usePreferencesStore } from "@/lib/store/preferences-store"

/**
 * Activation du 2FA (TOTP) — 100 % dans l'app, jamais de page Keycloak.
 *
 * À l'ouverture : `setup` génère un secret + l'URI otpauth, encodée en QR côté client (`qrcode`).
 * L'utilisateur scanne avec son authenticator, saisit un premier code, et `confirm` active le 2FA.
 */
export function TwoFactorSetupDialog({
  children,
  onEnabled,
}: {
  readonly children: React.ReactNode
  readonly onEnabled: () => void
}) {
  const { t } = usePreferencesStore()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [qr, setQr] = useState<string | null>(null)
  const [secret, setSecret] = useState("")
  const [code, setCode] = useState("")
  const [copied, setCopied] = useState(false)

  const start = async () => {
    setLoading(true)
    try {
      const s = await setupTwoFactor()
      setSecret(s.secret)
      setQr(await QRCode.toDataURL(s.otpauthUri, { margin: 1, width: 220 }))
    } catch {
      toast.error(t.auth.ui.twoFactorSetupError)
      setOpen(false)
    } finally {
      setLoading(false)
    }
  }

  const onOpenChange = (o: boolean) => {
    setOpen(o)
    if (o) {
      setQr(null)
      setSecret("")
      setCode("")
      void start()
    }
  }

  const confirm = async () => {
    if (code.length !== 6) return
    setLoading(true)
    try {
      await confirmTwoFactor(code)
      toast.success(t.auth.ui.twoFactorEnabled)
      onEnabled()
      setOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.auth.ui.twoFactorCodeInvalid)
    } finally {
      setLoading(false)
    }
  }

  const copySecret = () => {
    navigator.clipboard?.writeText(secret)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-blue-500" /> {t.auth.ui.twoFactorSetupTitle}
          </DialogTitle>
          <DialogDescription>{t.auth.ui.twoFactorSetupDesc}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="QR" className="size-48 rounded-lg border border-border bg-white p-2" />
          ) : (
            <div className="flex size-48 items-center justify-center rounded-lg border border-border">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {secret && (
            <button
              type="button"
              onClick={copySecret}
              title={t.auth.ui.twoFactorCopySecret}
              className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {secret.replace(/(.{4})/g, "$1 ").trim()}
              {copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
            </button>
          )}

          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && confirm()}
            className="w-40 text-center font-mono tracking-[0.4em]"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t.auth.ui.twoFactorCancel}</Button>
          <Button onClick={confirm} disabled={loading || code.length !== 6} className="gap-2">
            {loading && <Loader2 className="size-3.5 animate-spin" />} {t.auth.ui.twoFactorActivate}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
