"use client"

import { cn } from "@/lib/utils"

/** Préréglages partagés (statuts, libellés…) : formes et encres de la palette, en hex (stockés en base). */
export const COLOR_PRESETS: readonly string[] = [
  "#736e67", // gris
  "#2f6bf6", // bleu
  "#a9c6ff", // ciel
  "#418b5c", // vert
  "#e2f78c", // citron
  "#ffaa0d", // jaune
  "#e14322", // rouge
  "#f99bc3", // rose
  "#1e4fc4", // encre bleue
  "#2d6b45", // encre verte
  "#8a5300", // encre jaune
  "#a3336c", // encre rose
]

const HEX_RE = /^#([0-9a-fA-F]{6})$/

/**
 * Sélecteur de couleur : grille de presets + champ hex libre.
 * Contrôlé via `value` / `onChange`.
 */
export function ColorPicker({
  value,
  onChange,
  className,
}: {
  readonly value: string
  readonly onChange: (color: string) => void
  readonly className?: string
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="grid grid-cols-6 gap-1.5">
        {COLOR_PRESETS.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => onChange(color)}
            aria-label={color}
            className={cn(
              "size-6 rounded-md border transition-all",
              value.toLowerCase() === color.toLowerCase()
                ? "ring-2 ring-offset-1 ring-foreground/60 border-transparent"
                : "border-border/60 hover:scale-110"
            )}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <span
          className="size-5 shrink-0 rounded-md border border-border/60"
          style={{ backgroundColor: HEX_RE.test(value) ? value : "transparent" }}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => {
            const next = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`
            onChange(next.slice(0, 7))
          }}
          placeholder="#2f6bf6"
          spellCheck={false}
          className="h-7 flex-1 rounded-md border border-border bg-transparent px-2 text-xs font-mono outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>
    </div>
  )
}
