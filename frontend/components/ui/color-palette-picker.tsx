"use client"

import { cn } from "@/lib/utils"

/** Palette d'accent partagée (classes Tailwind). Alignée sur celle des Teams. */
export const PROJECT_COLORS = [
  "bg-primary",
  "bg-violet-500",
  "bg-emerald-500",
  "bg-orange-500",
  "bg-blue-500",
  "bg-pink-500",
  "bg-cyan-500",
  "bg-amber-500",
] as const

interface ColorPalettePickerProps {
  readonly value: string
  readonly onChange: (color: string) => void
  readonly className?: string
}

/**
 * Sélecteur de couleur d'accent (pastilles). Réutilisé dans les dialogs
 * create/edit projet (PROD-2.8b). La valeur est une classe Tailwind (`bg-*`).
 */
export function ColorPalettePicker({ value, onChange, className }: ColorPalettePickerProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {PROJECT_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={c}
          onClick={() => onChange(c)}
          className={cn(
            "size-6 rounded-full border-2 transition-transform",
            c,
            value === c ? "border-foreground scale-110" : "border-transparent hover:scale-105"
          )}
        />
      ))}
    </div>
  )
}
