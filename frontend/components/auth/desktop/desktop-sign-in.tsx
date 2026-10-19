"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, MonitorCheck } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  clearDesktopRequest,
  pendingDesktopRequest,
  readDesktopRequest,
  saveDesktopRequest,
  DESKTOP_SIGN_IN_PATH,
  type DesktopSignInRequest,
} from "@/lib/auth/desktop-handoff"
import { useAuth } from "@/lib/contexts/auth-context"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { useDesktopSessionStore } from "@/lib/store/desktop-session-store"
import { SITE_URL } from "@/lib/config/urls"

/**
 * Page `/auth/desktop` : l'app desktop l'ouvre dans le navigateur pour se connecter, comme Claude Desktop. Pas encore
 * connecté, on passe par la connexion (ou l'inscription) habituelle de la webapp, la demande attendant dans l'onglet ;
 * connecté, on accepte, et la webapp renvoie le navigateur vers l'app, sur 127.0.0.1.
 */
export function DesktopSignIn() {
  const router = useRouter()
  const { user, isAuthenticated, isLoading, logout } = useAuth()
  const { t } = usePreferencesStore()
  const authorize = useDesktopSessionStore((s) => s.authorize)

  /**
   * La demande vient de l'adresse (ouverte par l'app), gardée dans l'onglet, ou de l'onglet (retour de la connexion).
   * `undefined` : rendu serveur ; `null` : aucune demande de l'app.
   */
  const [request] = useState<DesktopSignInRequest | null | undefined>(() => {
    if (globalThis.window === undefined) return undefined
    const fromApp = readDesktopRequest(new URLSearchParams(globalThis.location.search))
    if (fromApp) {
      saveDesktopRequest(fromApp)
      return fromApp
    }
    return pendingDesktopRequest()
  })
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  // Le défi et l'état de l'app ne restent pas dans l'adresse (historique, barre d'adresse).
  useEffect(() => {
    if (globalThis.location.search) router.replace(DESKTOP_SIGN_IN_PATH)
  }, [router])

  // Pas connecté : connexion ou inscription habituelles ; la webapp revient ici ensuite.
  useEffect(() => {
    if (!request || isLoading || isAuthenticated) return
    router.replace(request.signUp ? "/auth/register" : "/auth/login")
  }, [request, isLoading, isAuthenticated, router])

  async function onContinue() {
    if (!request) return
    setBusy(true)
    const redirectUrl = await authorize(request)
    if (!redirectUrl) {
      setBusy(false)
      toast.error(useDesktopSessionStore.getState().error ?? t.auth.ui.desktopError)
      return
    }
    clearDesktopRequest()
    setDone(true)
    window.location.assign(redirectUrl)
  }

  if (request === undefined || isLoading) {
    return (
      <div className="flex justify-center py-10" role="status" aria-label={t.auth.ui.oneMoment}>
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (request === null) {
    return (
      <div className="auth-panel" role="status">
        <h1 className="auth-title">{t.auth.ui.desktopMissingTitle}</h1>
        <p className="auth-subtitle">{t.auth.ui.desktopMissingSubtitle}</p>
        <a className="auth-link mt-6 inline-block" href={`${SITE_URL}/download`}>TaskForce Desktop</a>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="flex justify-center py-10" role="status" aria-label={t.auth.ui.oneMoment}>
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (done) {
    return (
      <div className="auth-panel" role="status">
        <MonitorCheck className="size-8 text-primary" aria-hidden="true" />
        <h1 className="auth-title">{t.auth.ui.desktopDoneTitle}</h1>
        <p className="auth-subtitle">{t.auth.ui.desktopDoneSubtitle}</p>
      </div>
    )
  }

  return (
    <div className="auth-panel">
      <h1 className="auth-title">{t.auth.ui.desktopTitle}</h1>
      <p className="auth-subtitle">{t.auth.ui.desktopSubtitle.replace("{email}", user?.email ?? "")}</p>
      <div className="mt-6 flex flex-col gap-3">
        <Button className="w-full" disabled={busy} onClick={() => void onContinue()}>
          {busy ? (<><Loader2 className="size-4 animate-spin" />{t.auth.ui.desktopOpening}</>) : t.auth.ui.desktopContinue}
        </Button>
        <button type="button" className="auth-link-muted mx-auto block text-[11px]" disabled={busy} onClick={() => void logout()}>
          {t.auth.ui.desktopUseAnother}
        </button>
      </div>
    </div>
  )
}
