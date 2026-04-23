"use client"

import * as React from "react"
import { Matrix } from "./matrix"
import { AI_MODE_CONFIG } from "./matrix-frames"
import type { AiMode } from "./matrix-frames"
import { cn } from "@/lib/utils"

export type { AiMode } from "./matrix-frames"

// CSS keyframes injected once — GPU-accelerated hue rotation
const HUE_KEYFRAMES = `@keyframes ai-hue{from{filter:hue-rotate(0deg)}to{filter:hue-rotate(360deg)}}`

// Color groups
// "hue-idle"  → abstract logo, slow rotation (8s) from purple base
// "hue-doing" → active processing, fast rotation (3s) from orange base
// "semantic"  → fixed unique color per meaning (question/info/tip/warning)
// "terminal"  → fixed green or red (success/error)
type ColorGroup = "hue-idle" | "hue-doing" | "semantic" | "terminal"

const COLOR_GROUP: Record<AiMode, ColorGroup> = {
  idle:     "hue-idle",
  thinking: "hue-doing",
  writing:  "hue-doing",
  question: "semantic",
  info:     "semantic",
  tip:      "semantic",
  warning:  "semantic",
  success:  "terminal",
  error:    "terminal",
}

const HUE_BASE: Record<"hue-idle" | "hue-doing", string> = {
  "hue-idle":  "#a855f7", // purple — shadow-xs base
  "hue-doing": "#ff7a00", // orange — shadow-2xs base
}

const HUE_DURATION: Record<"hue-idle" | "hue-doing", string> = {
  "hue-idle":  "8s",
  "hue-doing": "3s",
}

interface AiMatrixIconProps extends React.HTMLAttributes<HTMLDivElement> {
  mode?: AiMode
  size?: number
  gap?: number
  /** Override the auto-selected color */
  color?: string
}

/**
 * AiMatrixIcon — semantic LED-grid AI brand mark.
 *
 * idle            → orbital dots, smooth hue rotation (8s)
 * thinking/writing → blob wave, fast hue rotation (3s)
 * question/info/tip/warning → symbolic shape, fixed unique color
 * success         → checkmark sweep, fixed green
 * error           → cross sweep, fixed red
 */
export function AiMatrixIcon({
  mode = "idle",
  size = 3,
  gap = 1,
  color,
  className,
  ...props
}: Readonly<AiMatrixIconProps>) {
  const config = AI_MODE_CONFIG[mode]
  const group = COLOR_GROUP[mode]

  const isHue = group === "hue-idle" || group === "hue-doing"
  const baseColor = color ?? (isHue ? HUE_BASE[group] : config.color)
  const animation = isHue ? `ai-hue ${HUE_DURATION[group]} linear infinite` : undefined

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: HUE_KEYFRAMES }} />
      <div
        className={cn("inline-flex items-center justify-center shrink-0", className)}
        style={{
          width: size * 7 + gap * 6,
          height: size * 7 + gap * 6,
          animation,
        }}
        {...props}
      >
        <Matrix
          rows={7}
          cols={7}
          frames={config.frames}
          fps={config.fps}
          size={size}
          gap={gap}
          palette={{ on: baseColor, off: "transparent" }}
          ariaLabel={config.label}
        />
      </div>
    </>
  )
}
