import { afterEach, describe, expect, it, vi } from "vitest"

import { browserSpeechSupported, openBrowserSpeech } from "./browser-speech"
import type { VoiceSession } from "./session"

interface Handlers {
  onstart: (() => void) | null
  onsoundstart: (() => void) | null
  onsoundend: (() => void) | null
  onresult: ((event: unknown) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
}

class FakeRecognition implements Handlers {
  static last: FakeRecognition
  static throwOnStart = false

  continuous = false
  interimResults = true
  lang = ""
  onstart: (() => void) | null = null
  onsoundstart: (() => void) | null = null
  onsoundend: (() => void) | null = null
  onresult: ((event: unknown) => void) | null = null
  onerror: ((event: { error: string }) => void) | null = null
  onend: (() => void) | null = null
  start = vi.fn(() => {
    if (FakeRecognition.throwOnStart) throw new Error("already started")
  })
  stop = vi.fn()
  abort = vi.fn()

  constructor() {
    FakeRecognition.last = this
  }

  speak(...sentences: string[]) {
    this.onresult?.({ resultIndex: 0, results: sentences.map((transcript) => ({ isFinal: true, 0: { transcript } })) })
  }
}

const open = (onLevel = vi.fn(), onClosed = vi.fn()) => openBrowserSpeech({ onLevel, onClosed }, "fr-FR")

async function started(onLevel = vi.fn(), onClosed = vi.fn()): Promise<{ session: VoiceSession; recognition: FakeRecognition }> {
  const opening = open(onLevel, onClosed)
  FakeRecognition.last.onstart?.()
  return { session: await opening, recognition: FakeRecognition.last }
}

describe("browser speech", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    FakeRecognition.throwOnStart = false
  })

  it("exists where the browser has the service, under either name", () => {
    expect(browserSpeechSupported()).toBe(false)
    vi.stubGlobal("webkitSpeechRecognition", FakeRecognition)
    expect(browserSpeechSupported()).toBe(true)
    vi.unstubAllGlobals()
    vi.stubGlobal("SpeechRecognition", FakeRecognition)
    expect(browserSpeechSupported()).toBe(true)
  })

  it("refuses to open without the service", async () => {
    await expect(open()).rejects.toMatchObject({ notice: "service" })
  })

  describe("with the service", () => {
    const withService = () => vi.stubGlobal("SpeechRecognition", FakeRecognition)

    it("listens continuously in the language given and keeps only what is final", async () => {
      withService()
      const { session, recognition } = await started()

      expect(recognition.continuous).toBe(true)
      expect(recognition.interimResults).toBe(false)
      expect(recognition.lang).toBe("fr-FR")

      recognition.onresult?.({ resultIndex: 0, results: [{ isFinal: false, 0: { transcript: "not yet" } }] })
      recognition.speak("Crée une issue", " pour vendredi ")
      const finishing = session.finish()
      expect(recognition.stop).toHaveBeenCalled()
      recognition.onend?.()

      await expect(finishing).resolves.toEqual({ text: "Crée une issue pour vendredi" })
    })

    it("uses the browser's language by default", async () => {
      withService()
      const opening = openBrowserSpeech({ onLevel: vi.fn(), onClosed: vi.fn() })
      FakeRecognition.last.onstart?.()
      await opening

      expect(FakeRecognition.last.lang).toBe(navigator.language)
    })

    it("shows whether sound is arriving", async () => {
      withService()
      const onLevel = vi.fn()
      const { recognition } = await started(onLevel)

      recognition.onsoundstart?.()
      expect(onLevel).toHaveBeenLastCalledWith(0.6)
      recognition.onsoundend?.()
      expect(onLevel).toHaveBeenLastCalledWith(0)
    })

    it("says nothing was heard", async () => {
      withService()
      const { session, recognition } = await started()

      const finishing = session.finish()
      recognition.onerror?.({ error: "no-speech" })
      recognition.onend?.()

      await expect(finishing).resolves.toEqual({ notice: "nothing" })
    })

    it("tells when the service stops by itself", async () => {
      withService()
      const onClosed = vi.fn()
      const { recognition } = await started(vi.fn(), onClosed)

      recognition.speak("Which issues are blocked?")
      recognition.onend?.()

      expect(onClosed).toHaveBeenCalledWith({ text: "Which issues are blocked?" })
    })

    it("forgets everything on cancel", async () => {
      withService()
      const onClosed = vi.fn()
      const { session, recognition } = await started(vi.fn(), onClosed)

      session.cancel()

      expect(recognition.abort).toHaveBeenCalled()
      expect(recognition.onend).toBeNull()
      expect(onClosed).not.toHaveBeenCalled()
    })

    it("ignores the service's own abort notice", async () => {
      withService()
      const { session, recognition } = await started()

      recognition.onerror?.({ error: "aborted" })
      recognition.speak("Hello")
      const finishing = session.finish()
      recognition.onend?.()

      await expect(finishing).resolves.toEqual({ text: "Hello" })
    })

    it.each([
      ["not-allowed", "denied"],
      ["service-not-allowed", "denied"],
      ["audio-capture", "noDevice"],
      ["network", "service"],
      ["language-not-supported", "service"],
    ])("says why when the browser refuses: %s", async (error, notice) => {
      withService()
      const opening = open()

      FakeRecognition.last.onerror?.({ error })

      await expect(opening).rejects.toMatchObject({ notice })
    })

    it("says the service is out of reach when it ends before starting", async () => {
      withService()
      const opening = open()

      FakeRecognition.last.onend?.()

      await expect(opening).rejects.toMatchObject({ notice: "service" })
    })

    it("says the service is out of reach when it refuses to start", async () => {
      withService()
      FakeRecognition.throwOnStart = true

      await expect(open()).rejects.toMatchObject({ notice: "service" })
    })

    it("reports a failure during the listening, once finished", async () => {
      withService()
      const { session, recognition } = await started()

      recognition.onerror?.({ error: "network" })
      const finishing = session.finish()
      recognition.onend?.()

      await expect(finishing).resolves.toEqual({ notice: "service" })
    })
  })
})
