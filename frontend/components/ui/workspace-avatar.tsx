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
  // Dégradé déterministe (même workspace → même rendu) mais à forte variété : on tire la teinte,
  // l'écart de teinte, la saturation, la luminosité et l'angle de bits INDÉPENDANTS du hash. Avant,
  // seule la teinte variait (sat/lum figées, écart de teinte étroit) → tous les workspaces se
  // ressemblaient. Là, deux workspaces se ressemblent rarement.
  const h = hashString(String(seed ?? name ?? ""))
  const hue1 = h % 360
  const hue2 = (hue1 + 60 + ((h >>> 3) % 180)) % 360 // écart 60–240° : analogique → complémentaire
  const sat = 58 + ((h >>> 7) % 30) // 58–88 %
  const light1 = 46 + ((h >>> 11) % 14) // 46–60 %
  const light2 = Math.max(30, light1 - 12 - ((h >>> 15) % 8))
  const angle = (h >>> 5) % 360
  const gradient = `linear-gradient(${angle}deg, hsl(${hue1} ${sat}% ${light1}%), hsl(${hue2} ${sat}% ${light2}%))`

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
