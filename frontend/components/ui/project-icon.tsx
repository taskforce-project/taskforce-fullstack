"use client"

import * as LucideIcons from "lucide-react"
import { FolderKanban } from "lucide-react"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProjectIconProps {
  iconUrl?: string | null
  name?: string
  className?: string
  /** Size in pixels for the container (default 40) */
  size?: number
  /** Accent color (Tailwind `bg-*` class). Tints the tile for lucide/emoji/default renders. */
  color?: string | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Checks whether a string is a single emoji or very short non-URL string (emoji picker output) */
function isEmojiOrShortText(value: string): boolean {
  if (value.startsWith("lucide:") || value.startsWith("data:") || value.startsWith("http")) return false
  return value.length <= 8
}

function getLucideIcon(name: string): React.ElementType | null {
  const icon = (LucideIcons as Record<string, unknown>)[name]
  if (typeof icon === "function" || (typeof icon === "object" && icon !== null)) {
    return icon as React.ElementType
  }
  return null
}

// ---------------------------------------------------------------------------
// ProjectIcon
// ---------------------------------------------------------------------------

/**
 * Renders a project icon based on the `iconUrl` value:
 * - `null` / `undefined`  → default FolderKanban lucide icon
 * - `lucide:IconName`     → dynamic lucide icon
 * - emoji / short text    → plain text render
 * - `data:...` or URL     → <img> element
 */
export function ProjectIcon({ iconUrl, className, size = 40, color }: ProjectIconProps) {
  const containerStyle = { width: size, height: size }
  const tinted = Boolean(color) && color !== "bg-primary"
  const baseClass = cn(
    "rounded-lg flex items-center justify-center shrink-0 border overflow-hidden",
    tinted ? cn(color, "border-transparent") : "bg-muted border-border",
    className
  )
  // Sur fond teinté, l'icône passe en blanc ; sinon teinte neutre.
  const glyphClass = tinted ? "text-white" : "text-muted-foreground"

  // Image (base64 or URL)
  if (iconUrl && (iconUrl.startsWith("data:") || iconUrl.startsWith("http"))) {
    return (
      <div className={cn(baseClass, "bg-muted")} style={containerStyle}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={iconUrl}
          alt="project icon"
          className="w-full h-full object-cover"
        />
      </div>
    )
  }

  // Lucide icon
  if (iconUrl && iconUrl.startsWith("lucide:")) {
    const iconName = iconUrl.slice(7)
    const Icon = getLucideIcon(iconName)
    if (Icon) {
      return (
        <div className={baseClass} style={containerStyle}>
          {/*
            `static-components` interdit de définir un composant pendant le rendu, car sa nouvelle
            identité à chaque passe remonterait tout le sous-arbre. Ici il n'y a pas de définition :
            `getLucideIcon` lit une référence dans l'espace de noms du module `lucide-react`, qui est
            constant. Pour un `iconName` donné, l'identité ne change jamais. La règle ne sait
            simplement pas traverser l'accès par propriété dynamique.
          */}
          {/* eslint-disable-next-line react-hooks/static-components */}
          <Icon style={{ width: size * 0.5, height: size * 0.5 }} className={glyphClass} />
        </div>
      )
    }
  }

  // Emoji / short text
  if (iconUrl && isEmojiOrShortText(iconUrl)) {
    return (
      <div className={baseClass} style={containerStyle}>
        <span style={{ fontSize: size * 0.45 }} role="img">{iconUrl}</span>
      </div>
    )
  }

  // Default fallback
  return (
    <div className={baseClass} style={containerStyle}>
      <FolderKanban style={{ width: size * 0.5, height: size * 0.5 }} className={glyphClass} />
    </div>
  )
}
