"use client"

import { useEffect, useRef, useState } from "react"
import { Coins } from "lucide-react"
import { cn } from "@/lib/utils"

interface TokenMeterProps {
  /** Valeur cible (nombre de tokens). Le composant anime la transition depuis la valeur précédente. */
  readonly value: number
  readonly label?: string
  readonly className?: string
  readonly showIcon?: boolean
}

/**
 * Compteur de tokens **animé** (count-up façon consommation live, style Claude/Revolut).
 * À chaque changement de `value`, interpole l'affichage sur ~600 ms (ease-out cubique).
 */
export function TokenMeter({ value, label = "tokens", className, showIcon = true }: TokenMeterProps) {
  const [display, setDisplay] = useState(value)
  const fromRef = useRef(value)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const from = fromRef.current
    const to = value
    if (from === to) return

    const start = performance.now()
    const duration = 600
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(Math.round(from + (to - from) * eased))
      if (p < 1) {
        rafRef.current = requestAnimationFrame(step)
      } else {
        fromRef.current = to
      }
    }
    rafRef.current = requestAnimationFrame(step)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [value])

  return (
    <span className={cn("inline-flex items-center gap-1 tabular-nums", className)}>
      {showIcon && <Coins className="size-3 shrink-0 opacity-70" />}
      <span>{display.toLocaleString("fr-FR")}</span>
      {label && <span className="opacity-70">{label}</span>}
    </span>
  )
}
