"use client"

import { cn } from "@/lib/utils"

/** Palette de presets partagée (colonnes, labels…). */
export const COLOR_PRESETS: readonly string[] = [
  "#94a3b8", // slate
  "#6366f1", // indigo
  "#3b82f6", // blue
  "#06b6d4", // cyan
  "#10b981", // emerald
  "#22c55e", // green
  "#eab308", // yellow
  "#f59e0b", // amber
  "#f97316", // orange
  "#ef4444", // red
  "#ec4899", // pink
  "#8b5cf6", // violet
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
          placeholder="#6366f1"
          spellCheck={false}
          className="h-7 flex-1 rounded-md border border-border bg-transparent px-2 text-xs font-mono outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>
    </div>
  )
}
