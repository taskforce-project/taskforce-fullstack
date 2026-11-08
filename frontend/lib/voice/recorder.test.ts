import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { openRecorder } from "./recorder"
import { VoiceStartError } from "./session"

function fakeContext(options: { workletFails?: boolean; sampleRate?: number } = {}) {
  const source = { connect: vi.fn(), disconnect: vi.fn() }
  const instances: { port: { onmessage: ((event: MessageEvent<Float32Array>) => void) | null } }[] = []
  const contexts: { close: ReturnType<typeof vi.fn> }[] = []

  class FakeAudioContext {
    sampleRate = options.sampleRate ?? 16_000
    audioWorklet = { addModule: vi.fn(() => (options.workletFails ? Promise.reject(new Error("blocked")) : Promise.resolve())) }
    resume = vi.fn().mockResolvedValue(undefined)
    close = vi.fn().mockResolvedValue(undefined)
    createMediaStreamSource = vi.fn(() => source)
    constructor() {
      contexts.push(this)
    }
  }

  class FakeNode {
    port: { onmessage: ((event: MessageEvent<Float32Array>) => void) | null } = { onmessage: null }
    constructor() {
      instances.push(this)
    }
  }

  vi.stubGlobal("AudioContext", FakeAudioContext)
  vi.stubGlobal("AudioWorkletNode", FakeNode)
  return { source, instances, contexts }
}

function fakeMicrophone(error?: { name: string }) {
  const track = { stop: vi.fn() }
  const stream = { getTracks: () => [track] }
  const getUserMedia = error ? vi.fn().mockRejectedValue(error) : vi.fn().mockResolvedValue(stream)
  vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia } })
  return { track, getUserMedia }
}

describe("openRecorder", () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("asks for the microphone only, and gives the sound back at 16 kHz", async () => {
    const { source, instances, contexts } = fakeContext()
    const { track, getUserMedia } = fakeMicrophone()
    const onLevel = vi.fn()

    const recorder = await openRecorder(onLevel)
    instances[0]?.port.onmessage?.({ data: new Float32Array([0.5, 0.5]) } as MessageEvent<Float32Array>)
    instances[0]?.port.onmessage?.({ data: new Float32Array([0.25]) } as MessageEvent<Float32Array>)
    const samples = await recorder.stop()

    expect(getUserMedia.mock.calls[0]?.[0].audio).toBeTruthy()
    expect(getUserMedia.mock.calls[0]?.[0].video).toBeUndefined()
    expect(source.connect).toHaveBeenCalled()
    expect(onLevel).toHaveBeenCalledTimes(2)
    expect(Array.from(samples)).toEqual([0.5, 0.5, 0.25])
    expect(track.stop).toHaveBeenCalled()
    expect(contexts[0]?.close).toHaveBeenCalled()
  })

  it("resamples what the device gives", async () => {
    const { instances } = fakeContext({ sampleRate: 48_000 })
    fakeMicrophone()

    const recorder = await openRecorder(vi.fn())
    instances[0]?.port.onmessage?.({ data: new Float32Array(4800) } as MessageEvent<Float32Array>)

    expect((await recorder.stop()).length).toBe(1600)
  })

  it("closes the microphone and forgets the sound on cancel", async () => {
    const { source, instances, contexts } = fakeContext()
    const { track } = fakeMicrophone()

    const recorder = await openRecorder(vi.fn())
    recorder.cancel()

    expect(instances[0]?.port.onmessage).toBeNull()
    expect(source.disconnect).toHaveBeenCalled()
    expect(track.stop).toHaveBeenCalled()
    expect(contexts[0]?.close).toHaveBeenCalled()
  })

  it.each([
    ["NotAllowedError", "denied"],
    ["SecurityError", "denied"],
    ["NotFoundError", "noDevice"],
    ["OverconstrainedError", "noDevice"],
    ["NotReadableError", "busy"],
    ["AbortError", "busy"],
    ["TypeError", "engine"],
  ])("says why when the browser answers %s", async (name, notice) => {
    fakeContext()
    fakeMicrophone({ name })

    await expect(openRecorder(vi.fn())).rejects.toMatchObject({ name: "VoiceStartError", notice })
  })

  it("says there is no microphone where the browser has no capture at all", async () => {
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: undefined })

    await expect(openRecorder(vi.fn())).rejects.toBeInstanceOf(VoiceStartError)
  })

  it("closes everything when the audio engine fails", async () => {
    const { contexts } = fakeContext({ workletFails: true })
    const { track } = fakeMicrophone()

    await expect(openRecorder(vi.fn())).rejects.toMatchObject({ notice: "engine" })
    expect(track.stop).toHaveBeenCalled()
    expect(contexts[0]?.close).toHaveBeenCalled()
  })
})
