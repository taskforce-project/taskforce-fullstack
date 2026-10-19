"use client"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import Link from "next/link"
import { useAuth } from "@/lib/contexts/auth-context"
import type { AuthResponse } from "@/lib/api/auth-service"
import { afterSignInPath } from "@/lib/auth/desktop-handoff"
import { passkeyAutofillAvailable, passkeysSupported } from "@/lib/auth/passkeys"
import { sanitizeInput, globalRateLimiter } from "@/lib/utils/validation"
import { loginSchema, firstZodError } from "@/lib/validation/auth-schemas"
import { KeyRound, Loader2 } from "lucide-react"
import { AuthSocialButtons } from "@/components/auth/auth-social-buttons"
import { acceptInvitation } from "@/lib/api/invitation-service"
import { stashInvitationToken, takeInvitationToken } from "@/lib/utils/pending-invitation"

/**
 * Connexion.
 *
 * Une colonne, quatre éléments : titre, deux champs, une action. Quand le compte a le 2FA activé, une
 * <b>seconde étape</b> demande le code TOTP (le serveur répond `twoFactorRequired` sans émettre de
 * token - cf. {@link login}), puis on rejoue la connexion avec le code.
 *
 * Validation Zod + limitation de tentatives (mot de passe ET codes 2FA). Après connexion, on pose le
 * drapeau `tf.intro` → l'intro de marque joue aussi sur un login par mot de passe (comme en OAuth).
 *
 * <b>Passkeys</b> : quand le navigateur en gère, un bouton les propose, et le champ e-mail les suggère dès qu'on le
 * touche (demande « conditionnelle », annulée dès que la personne choisit le bouton ou quitte la page).
 */
const noSubscription = () => () => {}

export function LoginForm({ className, ...props }: React.ComponentProps<"div">) {
  const { login, loginWithPasskey } = useAuth()
  const router = useRouter()
  const { t } = usePreferencesStore()
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({ email: "", password: "" })
  // Étape 2FA : le serveur a répondu `twoFactorRequired` → on garde email+password et on demande le code.
  const [totpStep, setTotpStep] = useState(false)
  const [code, setCode] = useState("")
  // Lu après l'hydratation : le serveur ne connaît pas le navigateur.
  const passkeys = useSyncExternalStore(noSubscription, passkeysSupported, () => false)
  const [passkeyBusy, setPasskeyBusy] = useState(false)
  const autofill = useRef<AbortController | null>(null)

  // Un lien d'invitation mène ici avec `?invitation=<token>` : on le met de côté pour l'appliquer
  // après connexion (couvre aussi le détour OAuth, qui perd les paramètres d'URL au retour).
  useEffect(() => {
    stashInvitationToken(new URLSearchParams(window.location.search).get("invitation"))
  }, [])

  // Passkeys suggérées dans le champ e-mail, tant que la page reste ouverte sur l'étape 1.
  useEffect(() => {
    if (totpStep) return
    const controller = new AbortController()
    autofill.current = controller
    void (async () => {
      if (!(await passkeyAutofillAvailable()) || controller.signal.aborted) return
      try {
        const result = await loginWithPasskey({ conditional: true, signal: controller.signal })
        if (result) await finishSignIn(result)
      } catch (error) {
        if (!controller.signal.aborted) showPasskeyError(error)
      }
    })()
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totpStep])

  const showPasskeyError = (error: unknown) => {
    const message = error instanceof Error && error.name !== "PasskeyError" ? error.message : ""
    toast.error(t.common.error, { description: message || t.auth.ui.passkeyFailed })
  }

  const handlePasskey = async () => {
    autofill.current?.abort()
    setPasskeyBusy(true)
    try {
      const result = await loginWithPasskey()
      if (result) await finishSignIn(result)
    } catch (error) {
      showPasskeyError(error)
    } finally {
      setPasskeyBusy(false)
    }
  }

  /** Session ouverte : invitation en attente, intro de marque, puis la page suivante. */
  const finishSignIn = async (result: AuthResponse) => {
    globalRateLimiter.reset("login")
    globalRateLimiter.reset("login-2fa")

    // L'intro de marque joue aussi après un login par mot de passe (pas seulement OAuth) :
    // l'AppShell/ProtectedLayout consomme ce drapeau au montage.
    try {
      sessionStorage.setItem("tf.intro", "1")
    } catch {
      /* mode privé / stockage indisponible - pas d'intro, on entre quand même */
    }

    // Approbation explicite : si l'utilisateur arrive d'un lien d'invitation, on l'applique
    // maintenant (best-effort - un échec n'empêche jamais la connexion réussie).
    const invitationToken = takeInvitationToken()
    if (invitationToken) {
      try {
        await acceptInvitation(invitationToken)
        toast.success("Invitation accepted")
      } catch {
        toast.success(t.auth.success.loginSuccess)
      }
    } else {
      toast.success(t.auth.success.loginSuccess)
    }
    // Direct vers l'onboarding si non fait - évite que l'app « flashe » avant le wizard.
    // Connexion demandée par l'app desktop : retour sur son accord plutôt que dans la webapp.
    router.replace(afterSignInPath(result.user?.onboardingCompleted === false ? "/onboarding" : "/"))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!totpStep) {
      // Étape 1 - email + mot de passe. Validation Zod (règle d'or #8) + limitation de tentatives.
      const parsed = loginSchema.safeParse(formData)
      if (!parsed.success) {
        toast.error(t.common.error, { description: firstZodError(parsed.error) })
        return
      }
      if (!globalRateLimiter.isAllowed("login", 5, 15 * 60 * 1000)) {
        const timeLeft = globalRateLimiter.getTimeUntilReset("login", 15 * 60 * 1000)
        toast.error(t.common.error, { description: t.auth.ui.tooManyAttempts.replace("{seconds}", String(timeLeft)) })
        return
      }
    } else {
      // Étape 2 - code TOTP à 6 chiffres, avec limite dédiée (anti-brute-force ; le backend a la sienne).
      if (code.length !== 6) {
        toast.error(t.common.error, { description: t.auth.ui.twoFactorEnterCode })
        return
      }
      if (!globalRateLimiter.isAllowed("login-2fa", 6, 2 * 60 * 1000)) {
        toast.error(t.common.error, { description: t.auth.ui.twoFactorTooManyCodes })
        return
      }
    }

    const sanitizedEmail = sanitizeInput(formData.email)
    const sanitizedPassword = sanitizeInput(formData.password)

    setIsLoading(true)
    try {
      const result = await login({
        email: sanitizedEmail,
        password: sanitizedPassword,
        totp: totpStep ? code : undefined,
      })

      // Mot de passe correct mais 2FA requis → on bascule sur l'étape « code » sans se connecter.
      if (result.twoFactorRequired) {
        setTotpStep(true)
        return
      }

      await finishSignIn(result)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      toast.error(t.common.error, { description: errorMessage || t.auth.errors.loginFailed })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className={cn("auth-panel", className)} {...props}>
      <h1 className="auth-title">{totpStep ? t.auth.ui.twoFactorTitle : t.auth.ui.loginTitle}</h1>
      <p className="auth-subtitle">{totpStep ? t.auth.ui.twoFactorSubtitle : t.auth.ui.loginSubtitle}</p>

      {totpStep ? (
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <Input
            id="totp"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            required
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            disabled={isLoading}
            className="auth-input text-center font-mono tracking-[0.4em]"
          />
          <Button type="submit" disabled={isLoading || code.length !== 6} className="auth-submit">
            {isLoading ? (<><Loader2 className="size-4 animate-spin" />{t.auth.ui.signingIn}</>) : t.auth.ui.twoFactorVerify}
          </Button>
          <button
            type="button"
            onClick={() => { setTotpStep(false); setCode("") }}
            className="auth-link-muted mx-auto block text-[11px]"
          >
            {t.auth.ui.twoFactorUseAnother}
          </button>
        </form>
      ) : (
        <>
          {/* Fournisseurs externes, au-dessus du formulaire : quand ils existent, ils sont le chemin le plus rapide. */}
          <AuthSocialButtons />

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="auth-label">
                {t.auth.ui.email}
              </label>
              <Input
                id="email"
                type="email"
                autoComplete="username webauthn"
                placeholder={t.auth.ui.emailPlaceholder}
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                disabled={isLoading}
                className="auth-input"
              />
            </div>

            <div>
              <div className="flex items-baseline justify-between">
                <label htmlFor="password" className="auth-label">
                  {t.auth.ui.password}
                </label>
                <Link href="/auth/forgot-password" className="auth-link-muted mb-1.5 text-[11px]">
                  {t.auth.ui.forgotPassword}
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                disabled={isLoading}
                className="auth-input"
              />
            </div>

            <Button type="submit" disabled={isLoading || passkeyBusy} className="auth-submit">
              {isLoading ? (<><Loader2 className="size-4 animate-spin" />{t.auth.ui.signingIn}</>) : t.auth.ui.signIn}
            </Button>
            {passkeys && (
              <Button
                type="button"
                variant="outline"
                onClick={() => void handlePasskey()}
                disabled={isLoading || passkeyBusy}
                className="w-full"
              >
                {passkeyBusy
                  ? (<><Loader2 className="size-4 animate-spin" />{t.auth.ui.passkeyWaiting}</>)
                  : (<><KeyRound className="size-4" />{t.auth.ui.passkeySignIn}</>)}
              </Button>
            )}
          </form>

          <p className="mt-5 text-center text-xs" style={{ color: "var(--label-tertiary)" }}>
            {t.auth.ui.noAccount}{" "}
            <Link href="/auth/register" className="auth-link">
              {t.auth.ui.createAccount}
            </Link>
          </p>
        </>
      )}
    </div>
  )
}
