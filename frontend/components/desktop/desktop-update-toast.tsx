"use client"

import { useEffect } from "react"
import { toast } from "sonner"

import type { TranslationKeys } from "@/lib/constants_en"
import { fillText } from "@/lib/delivery/result-card"
import { desktopBridge, type DesktopUpdateState } from "@/lib/desktop"
import { usePreferencesStore } from "@/lib/store/preferences-store"

const TOAST_ID = "desktop-update"

type Texts = TranslationKeys["desktopUpdate"]

/** Barre d'avancement du téléchargement, dans le toast. */
function DownloadProgress({ percent, t }: Readonly<{ percent: number; t: Texts }>) {
  return (
    <div className="mt-1.5 flex flex-col gap-1">
      <div
        className="h-1 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={t.progressLabel}
      >
        <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${percent}%` }} />
      </div>
      <span>{fillText(t.progress, { percent })}</span>
    </div>
  )
}

/**
 * Montre l'état de la mise à jour dans un seul toast, qui reste et change sur place. L'installeur tourne sans fenêtre
 * depuis le 05/11/2026 : une version qui n'a pas pris au dernier arrêt (`retry`) le dit ici, avec de quoi recommencer.
 */
export function showUpdateState(state: DesktopUpdateState, install: () => void, retry: () => void): void {
  const t = usePreferencesStore.getState().t.desktopUpdate
  switch (state.status) {
    case "downloading":
      toast.loading(fillText(t.downloading, { version: state.version }), {
        id: TOAST_ID,
        description: <DownloadProgress percent={state.percent} t={t} />,
        duration: Infinity,
      })
      break
    case "ready":
      if (state.retry) {
        toast.error(fillText(t.notInstalled, { version: state.version }), {
          id: TOAST_ID,
          description: t.notInstalledHint,
          duration: Infinity,
          action: { label: t.restart, onClick: install },
          cancel: { label: t.later, onClick: () => undefined },
        })
        break
      }
      toast.success(fillText(t.ready, { version: state.version }), {
        id: TOAST_ID,
        description: t.readyHint,
        duration: Infinity,
        action: { label: t.restart, onClick: install },
        cancel: { label: t.later, onClick: () => undefined },
      })
      break
    case "failed":
      toast.error(fillText(t.failed, { version: state.version }), {
        id: TOAST_ID,
        description: t.failedHint,
        duration: Infinity,
        action: { label: t.tryAgain, onClick: retry },
      })
      break
    default:
      break
  }
}

/**
 * La mise à jour de l'app desktop, dans l'app (demande du CEO, 29/10/2026) : l'avancement du téléchargement dans un
 * toast qui reste, puis « Restart now ». Avant, rien ne le montrait, et une boîte de dialogue du système s'ouvrait à la
 * fin. Sans effet hors de l'app desktop.
 */
export function DesktopUpdateToast() {
  useEffect(() => {
    const bridge = desktopBridge()
    const updater = bridge?.updater
    if (!bridge || !updater) return
    const install = () => void updater.install()
    const retry = () => void bridge.checkForUpdates().catch(() => undefined)
    const show = (state: DesktopUpdateState) => showUpdateState(state, install, retry)
    updater.state().then(show).catch(() => undefined)
    return updater.onState(show)
  }, [])
  return null
}
