import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { DesktopVoiceStatus } from "../desktop"
import type { VoiceCallbacks, VoiceOutcome, VoiceSession } from "../voice/session"

const recorder = vi.hoisted(() => ({ openRecorder: vi.fn() }))
const speech = vi.hoisted(() => ({ openBrowserSpeech: vi.fn(), browserSpeechSupported: vi.fn(() => true) }))
vi.mock("../voice/recorder", () => recorder)
vi.mock("../voice/browser-speech", () => speech)

/** `IS_DESKTOP` est figé au chargement (comme au build) : chaque cas recharge le store avec son environnement. */
async function loadStore(desktop = true) {
  vi.stubEnv("NEXT_PUBLIC_DESKTOP", desktop ? "true" : "false")
  vi.resetModules()
  const { VoiceStartError } = await import("../voice/session")
  return { ...(await import("./voice-store")), VoiceStartError }
}

const READY: DesktopVoiceStatus = { state: "ready", bytes: 100 }
const MISSING: DesktopVoiceStatus = { state: "missing", bytes: 671_000_000, received: 0 }

function installBridge(status: DesktopVoiceStatus = READY) {
  const listeners: ((status: DesktopVoiceStatus) => void)[] = []
  const voice = {
    status: vi.fn().mockResolvedValue(status),
    download: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
    cancelDownload: vi.fn().mockResolvedValue(undefined),
    onStatus: vi.fn((callback: (status: DesktopVoiceStatus) => void) => {
      listeners.push(callback)
      return () => listeners.splice(listeners.indexOf(callback), 1)
    }),
    prepare: vi.fn(),
    transcribe: vi.fn().mockResolvedValue({ ok: true, value: "Create an issue" }),
  }
  ;(window as Window & { taskforceDesktop?: unknown }).taskforceDesktop = { voice }
  return { voice, listeners }
}

/** Un son qui porte : assez fort pour ne pas passer pour du silence. */
const SOUND = new Float32Array(1600).fill(0.2)

function openMic(samples: Float32Array = SOUND) {
  const handle = { stop: vi.fn().mockResolvedValue(samples), cancel: vi.fn() }
  recorder.openRecorder.mockResolvedValue(handle)
  return handle
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

describe("useVoiceStore", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    speech.browserSpeechSupported.mockReturnValue(true)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    delete (window as Window & { taskforceDesktop?: unknown }).taskforceDesktop
  })

  describe("voiceKind", () => {
    it("is local in the desktop app with its engine", async () => {
      installBridge()
      expect((await loadStore()).voiceKind()).toBe("local")
    })

    it("is nothing in the desktop app without its engine (Microsoft Store), even with a browser service", async () => {
      ;(window as Window & { taskforceDesktop?: unknown }).taskforceDesktop = {}
      expect((await loadStore()).voiceKind()).toBeNull()
    })

    it("is the browser's service in the webapp", async () => {
      expect((await loadStore(false)).voiceKind()).toBe("browser")
    })

    it("is nothing where the browser has no service", async () => {
      speech.browserSpeechSupported.mockReturnValue(false)
      expect((await loadStore(false)).voiceKind()).toBeNull()
    })
  })

  describe("in the desktop app", () => {
    it("says the size of the model before downloading it", async () => {
      installBridge(MISSING)
      const { useVoiceStore } = await loadStore()

      await useVoiceStore.getState().press("7", vi.fn())

      expect(useVoiceStore.getState().phase).toBe("offer")
      expect(useVoiceStore.getState().model).toEqual({ bytes: 671_000_000, received: 0 })
      expect(recorder.openRecorder).not.toHaveBeenCalled()
    })

    it("downloads, shows the progress, and does not open the microphone by itself", async () => {
      const { voice, listeners } = installBridge(MISSING)
      const { useVoiceStore } = await loadStore()
      await useVoiceStore.getState().press("7", vi.fn())

      let resolve: (value: unknown) => void = () => undefined
      voice.download.mockReturnValue(new Promise((done) => (resolve = done)))
      const downloading = useVoiceStore.getState().startDownload()

      expect(useVoiceStore.getState().phase).toBe("downloading")
      listeners[0]?.({ state: "downloading", bytes: 1000, received: 250 })
      listeners[0]?.({ state: "ready", bytes: 1000 })
      expect(useVoiceStore.getState().model).toEqual({ bytes: 1000, received: 250 })

      resolve({ ok: true, value: undefined })

      await expect(downloading).resolves.toBe(true)
      expect(useVoiceStore.getState().phase).toBe("idle")
      expect(useVoiceStore.getState().notice).toBe("ready")
      expect(listeners.length).toBe(0)
      expect(recorder.openRecorder).not.toHaveBeenCalled()
    })

    it("rejoins a download already running", async () => {
      const { voice } = installBridge({ state: "downloading", bytes: 100, received: 10 })
      const { useVoiceStore } = await loadStore()

      await useVoiceStore.getState().press("7", vi.fn())

      expect(voice.download).toHaveBeenCalledTimes(1)
      expect(useVoiceStore.getState().phase).toBe("idle")
    })

    it.each([
      ["network", "network"],
      ["checksum", "checksum"],
      ["disk", "disk"],
      ["engine", "network"],
    ] as const)("says that the download failed (%s) and offers it again", async (error, notice) => {
      const { voice } = installBridge(MISSING)
      voice.download.mockResolvedValue({ ok: false, error })
      const { useVoiceStore } = await loadStore()
      await useVoiceStore.getState().press("7", vi.fn())

      await expect(useVoiceStore.getState().startDownload()).resolves.toBe(false)

      expect(useVoiceStore.getState().phase).toBe("offer")
      expect(useVoiceStore.getState().notice).toBe(notice)
    })

    it("says the download failed when the shell does not answer", async () => {
      const { voice } = installBridge(MISSING)
      voice.download.mockRejectedValue(new Error("no handler"))
      const { useVoiceStore } = await loadStore()

      await expect(useVoiceStore.getState().startDownload()).resolves.toBe(false)

      expect(useVoiceStore.getState().notice).toBe("network")
    })

    it("stops quietly when the person cancels the download", async () => {
      const { voice } = installBridge(MISSING)
      voice.download.mockResolvedValue({ ok: false, error: "cancelled" })
      const { useVoiceStore } = await loadStore()

      await useVoiceStore.getState().startDownload()
      useVoiceStore.getState().cancelDownload()

      expect(useVoiceStore.getState().phase).toBe("idle")
      expect(useVoiceStore.getState().notice).toBeNull()
      expect(voice.cancelDownload).toHaveBeenCalled()
    })

    it("does nothing to download outside the app", async () => {
      const { useVoiceStore } = await loadStore()

      await expect(useVoiceStore.getState().startDownload()).resolves.toBe(false)
    })

    it("one click starts, one click stops: the text goes to the composer, nothing is sent", async () => {
      const { voice } = installBridge()
      openMic()
      const { useVoiceStore } = await loadStore()
      const onText = vi.fn()

      await useVoiceStore.getState().press("7", onText)

      expect(useVoiceStore.getState().phase).toBe("listening")
      expect(voice.prepare).toHaveBeenCalled()

      await useVoiceStore.getState().press("7", onText)

      expect(voice.transcribe).toHaveBeenCalledWith(SOUND)
      expect(onText).toHaveBeenCalledWith("Create an issue")
      expect(useVoiceStore.getState().phase).toBe("idle")
      expect(useVoiceStore.getState().notice).toBeNull()
    })

    it("shows the level only while listening", async () => {
      installBridge()
      openMic()
      const { useVoiceStore } = await loadStore()

      await useVoiceStore.getState().press("7", vi.fn())
      const onLevel = recorder.openRecorder.mock.calls[0]?.[0] as (level: number) => void
      onLevel(0.4)
      expect(useVoiceStore.getState().level).toBe(0.4)

      useVoiceStore.getState().cancel()
      onLevel(0.9)
      expect(useVoiceStore.getState().level).toBe(0)
    })

    it("does not wake the model for a silence", async () => {
      const { voice } = installBridge()
      openMic(new Float32Array(1600))
      const { useVoiceStore } = await loadStore()
      const onText = vi.fn()

      await useVoiceStore.getState().press("7", onText)
      await useVoiceStore.getState().press("7", onText)

      expect(voice.transcribe).not.toHaveBeenCalled()
      expect(onText).not.toHaveBeenCalled()
      expect(useVoiceStore.getState().notice).toBe("nothing")
    })

    it.each([
      [{ ok: false, error: "model" }, "model"],
      [{ ok: false, error: "engine" }, "engine"],
      [{ ok: true, value: "   " }, "nothing"],
    ] as const)("says what went wrong after %j", async (result, notice) => {
      const { voice } = installBridge()
      voice.transcribe.mockResolvedValue(result)
      openMic()
      const { useVoiceStore } = await loadStore()
      const onText = vi.fn()

      await useVoiceStore.getState().press("7", onText)
      await useVoiceStore.getState().press("7", onText)

      expect(onText).not.toHaveBeenCalled()
      expect(useVoiceStore.getState().notice).toBe(notice)
      expect(useVoiceStore.getState().phase).toBe("idle")
    })

    it("says the engine failed when the shell does not answer", async () => {
      const { voice } = installBridge()
      voice.transcribe.mockRejectedValue(new Error("gone"))
      openMic()
      const { useVoiceStore } = await loadStore()

      await useVoiceStore.getState().press("7", vi.fn())
      await useVoiceStore.getState().press("7", vi.fn())

      expect(useVoiceStore.getState().notice).toBe("engine")
    })

    it("says that the status could not be read", async () => {
      const { voice } = installBridge()
      voice.status.mockRejectedValue(new Error("no handler"))
      const { useVoiceStore } = await loadStore()

      await useVoiceStore.getState().press("7", vi.fn())

      expect(useVoiceStore.getState().notice).toBe("engine")
      expect(useVoiceStore.getState().phase).toBe("idle")
    })

    it.each(["denied", "noDevice", "busy"] as const)("says why the microphone did not open: %s", async (notice) => {
      installBridge()
      const { useVoiceStore, VoiceStartError } = await loadStore()
      recorder.openRecorder.mockRejectedValue(new VoiceStartError(notice))

      await useVoiceStore.getState().press("7", vi.fn())

      expect(useVoiceStore.getState().phase).toBe("idle")
      expect(useVoiceStore.getState().notice).toBe(notice)
    })

    it("says the engine failed for an unexpected error", async () => {
      installBridge()
      recorder.openRecorder.mockRejectedValue(new Error("?"))
      const { useVoiceStore } = await loadStore()

      await useVoiceStore.getState().press("7", vi.fn())

      expect(useVoiceStore.getState().notice).toBe("engine")
    })

    it("Escape closes the microphone and forgets the sound", async () => {
      const { voice } = installBridge()
      const mic = openMic()
      const { useVoiceStore } = await loadStore()
      const onText = vi.fn()

      await useVoiceStore.getState().press("7", onText)
      useVoiceStore.getState().cancel()

      expect(mic.cancel).toHaveBeenCalled()
      expect(useVoiceStore.getState().phase).toBe("idle")
      expect(voice.transcribe).not.toHaveBeenCalled()
      expect(onText).not.toHaveBeenCalled()
    })

    it("an answer arriving after Escape writes nothing", async () => {
      const { voice } = installBridge()
      openMic()
      let answer: (value: unknown) => void = () => undefined
      voice.transcribe.mockReturnValue(new Promise((done) => (answer = done)))
      const { useVoiceStore } = await loadStore()
      const onText = vi.fn()

      await useVoiceStore.getState().press("7", onText)
      const stopping = useVoiceStore.getState().press("7", onText)
      await flush()
      expect(useVoiceStore.getState().phase).toBe("transcribing")

      useVoiceStore.getState().cancel()
      answer({ ok: true, value: "too late" })
      await stopping

      expect(onText).not.toHaveBeenCalled()
      expect(useVoiceStore.getState().phase).toBe("idle")
    })

    it("closes a microphone that was opening when Escape came", async () => {
      installBridge()
      const mic = { stop: vi.fn(), cancel: vi.fn() }
      let open: (value: unknown) => void = () => undefined
      recorder.openRecorder.mockReturnValue(new Promise((done) => (open = done)))
      const { useVoiceStore } = await loadStore()

      const starting = useVoiceStore.getState().press("7", vi.fn())
      await flush()
      expect(useVoiceStore.getState().phase).toBe("starting")
      useVoiceStore.getState().cancel()
      open(mic)
      await starting

      expect(mic.cancel).toHaveBeenCalled()
      expect(useVoiceStore.getState().phase).toBe("idle")
    })

    it("stays quiet about a microphone that fails after Escape", async () => {
      installBridge()
      let fail: (error: unknown) => void = () => undefined
      recorder.openRecorder.mockReturnValue(new Promise((_done, reject) => (fail = reject)))
      const { useVoiceStore, VoiceStartError } = await loadStore()

      const starting = useVoiceStore.getState().press("7", vi.fn())
      await flush()
      useVoiceStore.getState().cancel()
      fail(new VoiceStartError("denied"))
      await starting

      expect(useVoiceStore.getState().notice).toBeNull()
    })

    it("ignores clicks while the microphone opens or the text is being written", async () => {
      installBridge()
      let open: (value: unknown) => void = () => undefined
      recorder.openRecorder.mockReturnValue(new Promise((done) => (open = done)))
      const { useVoiceStore } = await loadStore()

      const starting = useVoiceStore.getState().press("7", vi.fn())
      await flush()
      await useVoiceStore.getState().press("7", vi.fn())
      expect(recorder.openRecorder).toHaveBeenCalledTimes(1)
      open({ stop: vi.fn().mockResolvedValue(SOUND), cancel: vi.fn() })
      await starting
      useVoiceStore.getState().cancel()
    })

    it("ignores a click while the model downloads", async () => {
      const { voice } = installBridge(MISSING)
      voice.download.mockReturnValue(new Promise(() => undefined))
      const { useVoiceStore } = await loadStore()
      void useVoiceStore.getState().startDownload()

      await useVoiceStore.getState().press("7", vi.fn())

      expect(voice.status).not.toHaveBeenCalled()
      expect(useVoiceStore.getState().phase).toBe("downloading")
    })

    it("a second click closes the question", async () => {
      installBridge(MISSING)
      const { useVoiceStore } = await loadStore()

      await useVoiceStore.getState().press("7", vi.fn())
      await useVoiceStore.getState().press("7", vi.fn())

      expect(useVoiceStore.getState().phase).toBe("idle")
    })

    it("closes the microphone by itself after two minutes and writes the text", async () => {
      vi.useFakeTimers()
      installBridge()
      const mic = openMic()
      const { useVoiceStore, MAX_LISTEN_MS } = await loadStore()
      const onText = vi.fn()

      await useVoiceStore.getState().press("7", onText)
      await vi.advanceTimersByTimeAsync(MAX_LISTEN_MS)

      expect(mic.stop).toHaveBeenCalled()
      expect(onText).toHaveBeenCalledWith("Create an issue")
      expect(useVoiceStore.getState().notice).toBe("limit")
    })

    it("a passing notice goes away by itself, a failure stays", async () => {
      vi.useFakeTimers()
      installBridge()
      openMic(new Float32Array(1600))
      const { useVoiceStore, VoiceStartError } = await loadStore()

      await useVoiceStore.getState().press("7", vi.fn())
      await useVoiceStore.getState().press("7", vi.fn())
      expect(useVoiceStore.getState().notice).toBe("nothing")
      await vi.advanceTimersByTimeAsync(4_000)
      expect(useVoiceStore.getState().notice).toBeNull()

      recorder.openRecorder.mockRejectedValue(new VoiceStartError("denied"))
      await useVoiceStore.getState().press("7", vi.fn())
      await vi.advanceTimersByTimeAsync(60_000)
      expect(useVoiceStore.getState().notice).toBe("denied")

      useVoiceStore.getState().dismissNotice()
      expect(useVoiceStore.getState().notice).toBeNull()
    })
  })

  describe("in the webapp", () => {
    function openSpeech() {
      const handle: VoiceSession = { finish: vi.fn<() => Promise<VoiceOutcome>>().mockResolvedValue({ text: "Which issues are blocked?" }), cancel: vi.fn() }
      speech.openBrowserSpeech.mockResolvedValue(handle)
      return handle
    }

    it("says where the voice goes before the first use", async () => {
      openSpeech()
      const { useVoiceStore } = await loadStore(false)

      await useVoiceStore.getState().press("7", vi.fn())

      expect(useVoiceStore.getState().phase).toBe("consent")
      expect(speech.openBrowserSpeech).not.toHaveBeenCalled()
    })

    it("listens once the person turns voice on, and remembers it for that person only", async () => {
      openSpeech()
      const { useVoiceStore } = await loadStore(false)
      const onText = vi.fn()

      await useVoiceStore.getState().press("7", onText)
      await useVoiceStore.getState().acceptConsent("7")

      expect(useVoiceStore.getState().phase).toBe("listening")
      expect(useVoiceStore.getState().consents).toEqual({ "7": true })
      const saved = vi.mocked(localStorage.setItem).mock.calls.filter(([name]) => name === "taskforce-voice").at(-1)
      expect(JSON.parse(saved?.[1] ?? "{}").state).toEqual({ consents: { "7": true } })

      await useVoiceStore.getState().press("7", onText)
      expect(onText).toHaveBeenCalledWith("Which issues are blocked?")

      await useVoiceStore.getState().press("7", onText)
      expect(useVoiceStore.getState().phase).toBe("listening")
      useVoiceStore.getState().cancel()

      await useVoiceStore.getState().press("8", onText)
      expect(useVoiceStore.getState().phase).toBe("consent")
    })

    it("keeps typing when the person says so", async () => {
      openSpeech()
      const { useVoiceStore } = await loadStore(false)

      await useVoiceStore.getState().press("7", vi.fn())
      useVoiceStore.getState().dismiss()

      expect(useVoiceStore.getState().phase).toBe("idle")
      expect(useVoiceStore.getState().consents).toEqual({})
    })

    it("asks again without a known person", async () => {
      openSpeech()
      const { useVoiceStore } = await loadStore(false)

      await useVoiceStore.getState().press(null, vi.fn())
      await useVoiceStore.getState().acceptConsent(null)
      useVoiceStore.getState().cancel()

      expect(useVoiceStore.getState().consents).toEqual({})
      await useVoiceStore.getState().press(null, vi.fn())
      expect(useVoiceStore.getState().phase).toBe("consent")
    })

    it("writes the text when the service stops by itself", async () => {
      const session = openSpeech()
      const { useVoiceStore } = await loadStore(false)
      const onText = vi.fn()
      await useVoiceStore.getState().press("7", onText)
      await useVoiceStore.getState().acceptConsent("7")
      const callbacks = speech.openBrowserSpeech.mock.calls[0]?.[0] as VoiceCallbacks

      callbacks.onClosed({ text: "Move the issue" })

      expect(onText).toHaveBeenCalledWith("Move the issue")
      expect(useVoiceStore.getState().phase).toBe("idle")
      expect(session.finish).not.toHaveBeenCalled()
    })

    it("ignores a service that stops after Escape", async () => {
      openSpeech()
      const { useVoiceStore } = await loadStore(false)
      const onText = vi.fn()
      await useVoiceStore.getState().press("7", onText)
      await useVoiceStore.getState().acceptConsent("7")
      const callbacks = speech.openBrowserSpeech.mock.calls[0]?.[0] as VoiceCallbacks

      useVoiceStore.getState().cancel()
      callbacks.onClosed({ text: "too late" })

      expect(onText).not.toHaveBeenCalled()
    })

    it("says the engine failed when finishing breaks", async () => {
      const session = openSpeech()
      vi.mocked(session.finish).mockRejectedValue(new Error("?"))
      const { useVoiceStore } = await loadStore(false)
      await useVoiceStore.getState().press("7", vi.fn())
      await useVoiceStore.getState().acceptConsent("7")

      await useVoiceStore.getState().press("7", vi.fn())

      expect(useVoiceStore.getState().notice).toBe("engine")
    })

    it("does nothing where no voice exists", async () => {
      speech.browserSpeechSupported.mockReturnValue(false)
      const { useVoiceStore } = await loadStore(false)

      await useVoiceStore.getState().press("7", vi.fn())

      expect(useVoiceStore.getState().phase).toBe("idle")
    })
  })
})
