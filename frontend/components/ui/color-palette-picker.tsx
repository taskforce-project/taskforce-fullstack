"use client"

import { cn } from "@/lib/utils"

/**
 * Palette d'accent des projets (classes Tailwind, stockées en base) : `bg-primary` = sans teinte, puis
 * les formes pleines de la direction artistique. V93 a converti les anciennes valeurs.
 */
export const PROJECT_COLORS = [
  "bg-primary",
  "bg-shape-blue",
  "bg-shape-sky",
  "bg-shape-green",
  "bg-shape-lime",
  "bg-shape-yellow",
  "bg-shape-red",
  "bg-shape-pink",
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
            c === "bg-primary" ? "bg-subtle" : c,
            value === c ? "border-foreground scale-110" : "border-transparent hover:scale-105"
          )}
        />
      ))}
    </div>
  )
}
