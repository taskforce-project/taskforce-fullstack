"use client"

import { useEffect } from "react"
import { toast } from "sonner"

import { desktopBridge, type DesktopUpdateState } from "@/lib/desktop"

const TOAST_ID = "desktop-update"

/** Barre d'avancement du téléchargement, dans le toast. */
function DownloadProgress({ percent }: Readonly<{ percent: number }>) {
  return (
    <div className="mt-1.5 flex flex-col gap-1">
      <div
        className="h-1 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label="Update download"
      >
        <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${percent}%` }} />
      </div>
      <span>{percent}% · Keep TaskForce open: the download starts over if you quit.</span>
    </div>
  )
}

/** Montre l'état de la mise à jour dans un seul toast, qui reste et change sur place. */
export function showUpdateState(state: DesktopUpdateState, install: () => void, retry: () => void): void {
  switch (state.status) {
    case "downloading":
      toast.loading(`Downloading TaskForce ${state.version}`, {
        id: TOAST_ID,
        description: <DownloadProgress percent={state.percent} />,
        duration: Infinity,
      })
      break
    case "ready":
      toast.success(`TaskForce ${state.version} is ready`, {
        id: TOAST_ID,
        description: "Restart to use it now. Otherwise it installs when you quit TaskForce.",
        duration: Infinity,
        action: { label: "Restart now", onClick: install },
        cancel: { label: "Later", onClick: () => undefined },
      })
      break
    case "failed":
      toast.error(`TaskForce ${state.version} couldn't download`, {
        id: TOAST_ID,
        description: "Check your connection, then try again.",
        duration: Infinity,
        action: { label: "Try again", onClick: retry },
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
