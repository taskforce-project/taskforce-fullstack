import { describe, expect, it } from "vitest"

import { audioLevel, concatSamples, isSilent, resample, TARGET_RATE } from "./audio"

/** Un son pur, le temps demandé. */
function tone(frequency: number, rate: number, seconds: number, amplitude = 0.5): Float32Array {
  const samples = new Float32Array(Math.round(rate * seconds))
  for (let i = 0; i < samples.length; i++) samples[i] = amplitude * Math.sin((2 * Math.PI * frequency * i) / rate)
  return samples
}

function rms(samples: Float32Array): number {
  return Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length)
}

describe("concatSamples", () => {
  it("puts the pieces end to end", () => {
    expect(Array.from(concatSamples([new Float32Array([1, 2]), new Float32Array(0), new Float32Array([3])]))).toEqual([1, 2, 3])
  })
})

describe("resample", () => {
  it("leaves a signal already at the right rate as it is", () => {
    const samples = new Float32Array([0.1, 0.2])
    expect(resample(samples, TARGET_RATE)).toBe(samples)
  })

  it("keeps an empty signal empty", () => {
    expect(resample(new Float32Array(0), 48_000).length).toBe(0)
  })

  it.each([48_000, 44_100, 22_050])("brings %i Hz down to 16 kHz with the right length", (rate) => {
    const output = resample(tone(440, rate, 1), rate)
    expect(output.length).toBe(16_000)
  })

  it("keeps the voice band", () => {
    const output = resample(tone(1_000, 48_000, 0.5), 48_000)
    expect(rms(output.subarray(100, output.length - 100))).toBeCloseTo(rms(tone(1_000, 48_000, 0.5)), 2)
  })

  it("removes what 16 kHz cannot carry, instead of folding it into the voice", () => {
    const output = resample(tone(12_000, 48_000, 0.5), 48_000)
    expect(rms(output.subarray(100, output.length - 100))).toBeLessThan(0.02)
  })

  it("also goes up", () => {
    const output = resample(tone(440, 8_000, 0.5), 8_000)
    expect(output.length).toBe(8_000)
    expect(rms(output.subarray(100, output.length - 100))).toBeCloseTo(rms(tone(440, 8_000, 0.5)), 1)
  })
})

describe("audioLevel", () => {
  it("is zero with no sound", () => {
    expect(audioLevel(new Float32Array(0))).toBe(0)
    expect(audioLevel(new Float32Array(128))).toBe(0)
  })

  it("rises with the sound, within 0 and 1", () => {
    const quiet = audioLevel(tone(440, 16_000, 0.1, 0.01))
    const loud = audioLevel(tone(440, 16_000, 0.1, 0.3))
    expect(quiet).toBeGreaterThan(0)
    expect(loud).toBeGreaterThan(quiet)
    expect(audioLevel(tone(440, 16_000, 0.1, 1))).toBe(1)
  })

  it("stays at zero under the bottom of the scale", () => {
    expect(audioLevel(tone(440, 16_000, 0.1, 0.0001))).toBe(0)
  })
})

describe("isSilent", () => {
  it("is true for nothing, and for near silence", () => {
    expect(isSilent(new Float32Array(0))).toBe(true)
    expect(isSilent(new Float32Array(16_000))).toBe(true)
    expect(isSilent(tone(440, 16_000, 1, 0.001))).toBe(true)
  })

  it("is false as soon as one moment carries sound", () => {
    const samples = new Float32Array(16_000)
    samples.set(tone(440, 16_000, 0.05, 0.2), 8_000)
    expect(isSilent(samples)).toBe(false)
  })
})
