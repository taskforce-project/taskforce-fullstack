"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { shapeFill } from "@/lib/palette"

/**
 * Avatar de workspace : tuile pleine aux couleurs de la palette, initiales à l'encre lisible, ou logo
 * si fourni. Déterministe (QA2-7) : même graine (uuid/slug/nom), même couleur partout.
 */

function hashString(input: string): number {
  let h = 0
  for (let i = 0; i < input.length; i++) {
    h = (h << 5) - h + input.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?"
  )
}

export interface WorkspaceAvatarProps {
  readonly name: string
  /** Seed déterministe (uuid/slug/nom). À défaut, le nom sert de seed. */
  readonly seed?: string | number | null
  /** Logo persisté en DB : remplace la tuile de couleur. */
  readonly logoUrl?: string | null
  readonly className?: string
  readonly textClassName?: string
}

export function WorkspaceAvatar({
  name,
  seed,
  logoUrl,
  className,
  textClassName,
}: WorkspaceAvatarProps) {
  const fill = shapeFill(hashString(String(seed ?? name ?? "")))

  return (
    <div
      className={cn(
        "relative isolate flex aspect-square shrink-0 items-center justify-center overflow-hidden",
        !logoUrl && fill.bg,
        !logoUrl && fill.fg,
        className
      )}
    >
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt={name} className="size-full object-cover" />
      ) : (
        <span className={cn("relative text-xs font-semibold leading-none", textClassName)}>
          {initialsOf(name)}
        </span>
      )}
    </div>
  )
}
