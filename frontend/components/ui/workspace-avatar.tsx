"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * Avatar de workspace — fond dégradé **déterministe** dérivé d'un seed (QA2-7).
 *
 * Tant que la persistance DB (`backgroundSeed`/`primaryColor`/`secondaryColor`, → QA2-16)
 * n'est pas en place, le dégradé est calculé côté client à partir du seed (uuid/slug/nom) :
 * même seed → même rendu, partout. Rounded-full, initiales en blanc (lisibles), ou logo si fourni.
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
  /** Logo persisté en DB : remplace le dégradé. */
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
  const h = hashString(String(seed ?? name ?? ""))
  const hue1 = h % 360
  const hue2 = (hue1 + 35 + (h % 55)) % 360
  const gradient = `linear-gradient(135deg, hsl(${hue1} 68% 54%), hsl(${hue2} 70% 44%))`

  return (
    <div
      className={cn(
        "flex aspect-square shrink-0 items-center justify-center overflow-hidden rounded-full text-white",
        className
      )}
      style={logoUrl ? undefined : { backgroundImage: gradient }}
    >
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt={name} className="size-full rounded-full object-cover" />
      ) : (
        <span className={cn("text-xs font-bold leading-none", textClassName)}>
          {initialsOf(name)}
        </span>
      )}
    </div>
  )
}
