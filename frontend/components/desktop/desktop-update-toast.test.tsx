import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { render, waitFor } from "@testing-library/react"

import type { DesktopUpdateState } from "@/lib/desktop"

vi.mock("sonner", () => ({ toast: { loading: vi.fn(), success: vi.fn(), error: vi.fn() } }))

type Listener = (state: DesktopUpdateState) => void

/** Pont de la coque réduit à la mise à jour ; `emit` joue un changement d'état envoyé par la coque. */
function installBridge(initial: DesktopUpdateState) {
  let listener: Listener | null = null
  const updater = {
    state: vi.fn().mockResolvedValue(initial),
    install: vi.fn().mockResolvedValue(undefined),
    onState: vi.fn((callback: Listener) => {
      listener = callback
      return () => { listener = null }
    }),
  }
  const bridge = { checkForUpdates: vi.fn().mockResolvedValue({ status: "downloading", version: "1.3.3" }), updater }
  ;(window as Window & { taskforceDesktop?: unknown }).taskforceDesktop = bridge
  return { bridge, emit: (state: DesktopUpdateState) => listener?.(state) }
}

/** Build desktop : le drapeau est figé au chargement, le composant est rechargé avec lui. */
async function load() {
  vi.stubEnv("NEXT_PUBLIC_DESKTOP", "true")
  vi.resetModules()
  const loaded = await import("./desktop-update-toast")
  const { toast } = await import("sonner")
  return { ...loaded, toast }
}

describe("DesktopUpdateToast: the app update, inside the app", () => {
  beforeEach(() => vi.clearAllMocks())

  afterEach(() => {
    vi.unstubAllEnvs()
    delete (window as Window & { taskforceDesktop?: unknown }).taskforceDesktop
  })

  it("shows the download progress in one toast that stays", async () => {
    installBridge({ status: "downloading", version: "1.3.3", percent: 42 })
    const { DesktopUpdateToast, toast } = await load()

    render(<DesktopUpdateToast />)

    await waitFor(() => expect(toast.loading).toHaveBeenCalled())
    const [title, options] = vi.mocked(toast.loading).mock.calls[0]
    expect(title).toBe("Downloading TaskForce 1.3.3")
    expect(options).toMatchObject({ id: "desktop-update", duration: Infinity })
  })

  it("turns into Restart now when the shell says it is ready", async () => {
    const { bridge, emit } = installBridge({ status: "idle" })
    const { DesktopUpdateToast, toast } = await load()
    render(<DesktopUpdateToast />)
    await waitFor(() => expect(bridge.updater.onState).toHaveBeenCalled())

    emit({ status: "ready", version: "1.3.3" })

    const [title, options] = vi.mocked(toast.success).mock.calls[0]
    expect(title).toBe("TaskForce 1.3.3 is ready")
    const action = (options as { action: { label: string; onClick: () => void } }).action
    expect(action.label).toBe("Restart now")
    action.onClick()
    expect(bridge.updater.install).toHaveBeenCalled()
  })

  it("says a failed download and offers to try again", async () => {
    const { bridge, emit } = installBridge({ status: "idle" })
    const { DesktopUpdateToast, toast } = await load()
    render(<DesktopUpdateToast />)
    await waitFor(() => expect(bridge.updater.onState).toHaveBeenCalled())

    emit({ status: "failed", version: "1.3.3", message: "net::ERR_CONNECTION_RESET" })

    const [title, options] = vi.mocked(toast.error).mock.calls[0]
    expect(title).toBe("TaskForce 1.3.3 couldn't download")
    const action = (options as { action: { label: string; onClick: () => void } }).action
    expect(action.label).toBe("Try again")
    action.onClick()
    expect(bridge.checkForUpdates).toHaveBeenCalled()
  })

  it("shows nothing while there is no update", async () => {
    installBridge({ status: "idle" })
    const { DesktopUpdateToast, toast } = await load()

    render(<DesktopUpdateToast />)

    await waitFor(() => expect(toast.loading).not.toHaveBeenCalled())
    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
  })
})
