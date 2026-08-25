"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * Avatar de workspace — fond **dégradé sombre + glow coloré + grain léger**, déterministe (QA2-7).
 *
 * Même seed (uuid/slug/nom) → même rendu, partout. Base sombre façon « noise + gradient » : un
 * dégradé sombre teinté, un glow coloré décalé, et un grain (feTurbulence) posé en overlay très
 * discret pour ajouter de la « matière ». Rounded-full, initiales blanches, ou logo si fourni.
 */

// Bruit fractal (feTurbulence) en data-URI — posé en overlay `mix-blend-overlay` très léger.
const NOISE_URL =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")"

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
  // Déterministe et varié : teinte, 2e teinte, position du glow et angle tirés de bits INDÉPENDANTS
  // du hash → deux workspaces se ressemblent rarement. Base SOMBRE + glow coloré.
  const h = hashString(String(seed ?? name ?? ""))
  const hue1 = h % 360
  const hue2 = (hue1 + 40 + ((h >>> 3) % 130)) % 360
  const glowX = 58 + ((h >>> 7) % 32) // 58–90 %
  const glowY = 55 + ((h >>> 11) % 35) // 55–90 %
  const angle = (h >>> 5) % 360
  const gradient = [
    `radial-gradient(circle at ${glowX}% ${glowY}%, hsl(${hue2} 70% 48% / 0.5), transparent 62%)`,
    `linear-gradient(${angle}deg, hsl(${hue1} 45% 9%), hsl(${hue2} 42% 17%))`,
  ].join(", ")

  return (
    <div
      className={cn(
        "relative isolate flex aspect-square shrink-0 items-center justify-center overflow-hidden rounded-full text-white",
        className
      )}
      style={logoUrl ? undefined : { backgroundImage: gradient }}
    >
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt={name} className="size-full rounded-full object-cover" />
      ) : (
        <>
          {/* Grain très léger — ajoute de la matière au dégradé sans le dénaturer. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-20 mix-blend-overlay"
            style={{ backgroundImage: NOISE_URL, backgroundSize: "110px 110px" }}
          />
          <span className={cn("relative z-10 text-xs font-bold leading-none", textClassName)}>
            {initialsOf(name)}
          </span>
        </>
      )}
    </div>
  )
}
