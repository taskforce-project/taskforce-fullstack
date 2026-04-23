/**
 * matrix-frames.ts
 * All Frame definitions and animations for the AiMatrixIcon system.
 * Each mode has: frames (animated) or pattern (static), color, fps.
 */

import type { Frame } from "./matrix"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyFrame(rows = 7, cols = 7): Frame {
  return Array.from({ length: rows }, () => new Array(cols).fill(0) as number[])
}

function px(frame: Frame, r: number, c: number, v = 1): void {
  if (r >= 0 && r < frame.length && c >= 0 && c < (frame[0]?.length ?? 0)) {
    frame[r][c] = v
  }
}

// ---------------------------------------------------------------------------
// Static patterns (7×7)
// ---------------------------------------------------------------------------

/** Idle: abstract constellation — scattered dots forming a diamond lattice */
export const idlePattern: Frame = [
  [1, 0, 0, 0, 0, 0, 1],
  [0, 0, 0, 1, 0, 0, 0],
  [0, 0, 1, 0, 1, 0, 0],
  [0, 1, 0, 0, 0, 1, 0],
  [0, 0, 1, 0, 1, 0, 0],
  [0, 0, 0, 1, 0, 0, 0],
  [1, 0, 0, 0, 0, 0, 1],
]

/** Question mark — 7×7 */
export const questionPattern: Frame = [
  [0, 1, 1, 1, 1, 0, 0],
  [1, 0, 0, 0, 0, 1, 0],
  [0, 0, 0, 0, 0, 1, 0],
  [0, 0, 0, 1, 1, 0, 0],
  [0, 0, 1, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0],
  [0, 0, 1, 0, 0, 0, 0],
]

/** Info "i" — 7×7 */
export const infoPattern: Frame = [
  [0, 0, 1, 1, 0, 0, 0],
  [0, 0, 1, 1, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0],
  [0, 0, 1, 1, 0, 0, 0],
  [0, 0, 1, 1, 0, 0, 0],
  [0, 0, 1, 1, 0, 0, 0],
  [0, 1, 1, 1, 1, 0, 0],
]

/** Warning "!" — centered 7×7 */
export const warningPattern: Frame = [
  [0, 0, 0, 1, 0, 0, 0],
  [0, 0, 0, 1, 0, 0, 0],
  [0, 0, 0, 1, 0, 0, 0],
  [0, 0, 0, 1, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 1, 0, 0, 0],
]

/** Tip: right-pointing chevron `>` — 7×7 */
export const tipPattern: Frame = [
  [0, 0, 0, 0, 0, 0, 0],
  [0, 1, 0, 0, 0, 0, 0],
  [0, 0, 1, 0, 0, 0, 0],
  [0, 0, 0, 1, 0, 0, 0],
  [0, 0, 1, 0, 0, 0, 0],
  [0, 1, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0],
]

/** Success: checkmark — 7×7 */
export const successPattern: Frame = [
  [0, 0, 0, 0, 0, 0, 1],
  [0, 0, 0, 0, 0, 1, 0],
  [0, 0, 0, 0, 1, 0, 0],
  [0, 0, 0, 1, 0, 0, 0],
  [1, 0, 1, 0, 0, 0, 0],
  [0, 1, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0],
]

/** Error: × cross — 7×7 */
export const errorPattern: Frame = [
  [1, 0, 0, 0, 0, 0, 1],
  [0, 1, 0, 0, 0, 1, 0],
  [0, 0, 1, 0, 1, 0, 0],
  [0, 0, 0, 1, 0, 0, 0],
  [0, 0, 1, 0, 1, 0, 0],
  [0, 1, 0, 0, 0, 1, 0],
  [1, 0, 0, 0, 0, 0, 1],
]

// ---------------------------------------------------------------------------
// Thinking: 8-position pixel spinner — 8 frames
// ---------------------------------------------------------------------------

export const thinkingAnim: Frame[] = (() => {
  // Clock positions around the 7×7 center
  const spinnerPath: Array<[number, number]> = [
    [0, 3], [1, 5], [3, 6], [5, 5], [6, 3], [5, 1], [3, 0], [1, 1],
  ]
  const n = spinnerPath.length
  const frames: Frame[] = []
  for (let f = 0; f < n; f++) {
    const frame = emptyFrame()
    // Center dim glow
    px(frame, 3, 3, 0.2)
    // Trail: -2 dim, -1 mid, current full
    const [r2, c2] = spinnerPath[(f - 2 + n) % n]
    const [r1, c1] = spinnerPath[(f - 1 + n) % n]
    const [r0, c0] = spinnerPath[f]
    px(frame, r2, c2, 0.2)
    px(frame, r1, c1, 0.5)
    px(frame, r0, c0, 1)
    frames.push(frame)
  }
  return frames
})()

// ---------------------------------------------------------------------------
// Writing / active: organic blob morphing — 20 frames
// ---------------------------------------------------------------------------

export const writing: Frame[] = (() => {
  const frames: Frame[] = []
  const center = 3

  for (let f = 0; f < 20; f++) {
    const t = (f / 20) * Math.PI * 2
    const frame = emptyFrame()

    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const dy = r - center
        const dx = c - center
        const dist = Math.hypot(dx, dy)
        const angle = Math.atan2(dy, dx)

        // Organic blob radius: 2 harmonics drifting over time
        const blobR =
          2.2 +
          0.9 * Math.sin(2 * angle + t) +
          0.5 * Math.sin(3 * angle - t * 1.4)

        if (dist < blobR) {
          px(frame, r, c, 1 - (dist / blobR) * 0.45)
        }
      }
    }
    frames.push(frame)
  }
  return frames
})()

// ---------------------------------------------------------------------------
// Question animated: "?" morphing pulse — 12 frames
// ---------------------------------------------------------------------------

export const questionAnim: Frame[] = (() => {
  const frames: Frame[] = []
  for (let f = 0; f < 12; f++) {
    const frame: Frame = questionPattern.map((row) => [...row])
    // Pulse the dot at bottom
    const dotBrightness = f % 6 < 3 ? 1 : 0.2
    px(frame, 6, 2, dotBrightness)
    frames.push(frame)
  }
  return frames
})()

// ---------------------------------------------------------------------------
// Warning animated: centred "!" flashing — 8 frames
// ---------------------------------------------------------------------------

export const warningAnim: Frame[] = (() => {
  const frames: Frame[] = []
  for (let f = 0; f < 8; f++) {
    const b = f % 4 < 2 ? 1 : 0.2
    const frame: Frame = warningPattern.map((row) => row.map((v) => (v > 0 ? b : 0)))
    frames.push(frame)
  }
  return frames
})()

// ---------------------------------------------------------------------------
// Success animated: checkmark sweep — 10 frames
// ---------------------------------------------------------------------------

export const successAnim: Frame[] = (() => {
  const checkPath: Array<[number, number]> = [
    [5, 1], [6, 2], [5, 3], [4, 4], [3, 5], [2, 6], [1, 6],
  ]
  const frames: Frame[] = []
  for (let f = 0; f < checkPath.length; f++) {
    const frame = emptyFrame()
    for (let i = 0; i <= f; i++) {
      const [r, c] = checkPath[i]
      px(frame, r, c, 1 - (f - i) * 0.12)
    }
    frames.push(frame)
  }
  // Hold last frame for 3 extra
  const last = frames.at(-1) ?? emptyFrame()
  frames.push(last, last, last)
  return frames
})()

// ---------------------------------------------------------------------------
// Error animated: × cross sweep — 10 frames
// ---------------------------------------------------------------------------

export const errorAnim: Frame[] = (() => {
  const crossPath: Array<[number, number]> = [
    [0, 0], [1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 6],
  ]
  const crossPath2: Array<[number, number]> = [
    [0, 6], [1, 5], [2, 4], [3, 3], [4, 2], [5, 1], [6, 0],
  ]
  const frames: Frame[] = []
  const total = crossPath.length
  for (let f = 0; f < total * 2; f++) {
    const frame = emptyFrame()
    const phase = f < total ? f : total - 1
    for (let i = 0; i <= phase; i++) {
      const [r, c] = crossPath[i]
      px(frame, r, c, 1)
    }
    if (f >= total) {
      const phase2 = f - total
      for (let i = 0; i <= phase2; i++) {
        const [r, c] = crossPath2[i]
        px(frame, r, c, 1)
      }
    }
    frames.push(frame)
  }
  return frames
})()

// ---------------------------------------------------------------------------
// Success: static checkmark (single frame, no animation)
// ---------------------------------------------------------------------------

export const successStatic: Frame[] = [successPattern]

// ---------------------------------------------------------------------------
// Error: static × cross (single frame, no animation)
// ---------------------------------------------------------------------------

export const errorStatic: Frame[] = [errorPattern]

// ---------------------------------------------------------------------------
// Info animated: "i" with pulse dot — 8 frames
// ---------------------------------------------------------------------------

export const infoAnim: Frame[] = (() => {
  const frames: Frame[] = []
  for (let f = 0; f < 8; f++) {
    const frame: Frame = infoPattern.map((row) => [...row])
    const dotBrightness = f % 4 < 2 ? 1 : 0.25
    px(frame, 0, 2, dotBrightness)
    px(frame, 0, 3, dotBrightness)
    frames.push(frame)
  }
  return frames
})()

// ---------------------------------------------------------------------------
// Tip animated: ">" chevron bouncing right — 10 frames
// ---------------------------------------------------------------------------

export const tipAnim: Frame[] = (() => {
  const makeChevron = (offset: number): Frame => {
    const f = emptyFrame()
    const base = offset
    px(f, 1, base + 1, 1)
    px(f, 2, base + 2, 1)
    px(f, 3, base + 3, 1)
    px(f, 4, base + 2, 1)
    px(f, 5, base + 1, 1)
    return f
  }
  const frames: Frame[] = []
  // bounce pattern: 0 1 2 3 2 1 → held 2 ticks each = 12 frames
  for (const o of [0, 0, 1, 1, 2, 2, 3, 3, 2, 2, 1, 1]) {
    frames.push(makeChevron(o))
  }
  return frames
})()

// ---------------------------------------------------------------------------
// Idle animated: 3 dots orbiting at 120° with trailing fade — 24 frames
// ---------------------------------------------------------------------------

export const idleAnim: Frame[] = (() => {
  const frames: Frame[] = []
  const center = 3
  const radius = 2.5
  const nDots = 3
  const trailOffset = 0.45

  for (let f = 0; f < 24; f++) {
    const frame = emptyFrame()
    for (let d = 0; d < nDots; d++) {
      const angle = (f / 24) * Math.PI * 2 + (d / nDots) * Math.PI * 2
      const x = Math.round(center + Math.cos(angle) * radius)
      const y = Math.round(center + Math.sin(angle) * radius)
      px(frame, y, x, 1)
      // Inner dim echo at 60% radius
      const ix = Math.round(center + Math.cos(angle) * 1.2)
      const iy = Math.round(center + Math.sin(angle) * 1.2)
      px(frame, iy, ix, 0.25)
      // Trail pixel
      const ta = angle - trailOffset
      const tx = Math.round(center + Math.cos(ta) * radius)
      const ty = Math.round(center + Math.sin(ta) * radius)
      px(frame, ty, tx, 0.35)
    }
    frames.push(frame)
  }
  return frames
})()

// ---------------------------------------------------------------------------
// Mode config map
// ---------------------------------------------------------------------------

// biome-ignore lint/suspicious/noDuplicateUnionMembers: false positive — Biome sees Record key as duplicate
export type AiMode =
  | "idle"
  | "thinking"
  | "writing"
  | "question"
  | "info"
  | "tip"
  | "warning"
  | "success"
  | "error"

interface ModeConfig {
  frames: Frame[]
  color: string
  fps: number
  label: string
}

/** Shadow palette colors from the landing-page CSS variables */
const C_PINK = "#ec4899"
const C_ORANGE = "#ff7a00"
const C_PURPLE = "#a855f7"
const C_RED = "#ff0055"
const C_AMBER = "#fbbf24"
const C_BLUE = "#2671f4"
const C_GREEN = "#22c55e"

export const AI_MODE_CONFIG: Record<AiMode, ModeConfig> = {
  idle:     { frames: idleAnim,     color: C_PURPLE, fps: 4,  label: "Idle" },
  thinking: { frames: thinkingAnim, color: C_ORANGE, fps: 12, label: "Thinking…" },
  writing:  { frames: writing,      color: C_BLUE,   fps: 10, label: "Writing…" },
  question: { frames: questionAnim, color: C_ORANGE, fps: 6,  label: "Question" },
  info:     { frames: infoAnim,     color: C_PURPLE, fps: 4,  label: "Info" },
  tip:      { frames: tipAnim,      color: C_AMBER,  fps: 8,  label: "Tip" },
  warning:  { frames: warningAnim,  color: C_RED,    fps: 6,  label: "Warning" },
  success:  { frames: successStatic, color: C_GREEN, fps: 1,  label: "Success" },
  error:    { frames: errorStatic,   color: C_RED,   fps: 1,  label: "Error" },
}

// Re-export common animations so consumers don't need to import matrix.tsx directly
export { loader, pulse, wave, snake } from "./matrix"
