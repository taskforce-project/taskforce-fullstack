"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * Avatar de workspace - fond **dégradé sombre + glow coloré + grain léger**, déterministe (QA2-7).
 *
 * Même seed (uuid/slug/nom) → même rendu, partout. Base sombre façon « noise + gradient » : un
 * dégradé sombre teinté, un glow coloré décalé, et un grain (feTurbulence) posé en overlay très
 * discret pour ajouter de la « matière ». Rounded-full, initiales blanches, ou logo si fourni.
 */

// Bruit fractal (feTurbulence) en data-URI - posé en overlay `mix-blend-overlay` très léger.
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
  // Déterministe (même workspace → même rendu, SSR-safe, pas de flicker) mais **couleurs vives et
  // très variées** : teinte, 2e teinte (écart large), saturation, luminosités, position du glow et
  // angle tirés de bits INDÉPENDANTS du hash → chaque org tombe sur une couleur « random » distincte.
  // Sombre mais assez lumineux pour que la teinte se VOIE (l'ancien 9 % rendait tout quasi noir).
  const h = hashString(String(seed ?? name ?? ""))
  const hue1 = h % 360
  const hue2 = (hue1 + 60 + ((h >>> 9) % 240)) % 360 // écart 60–300° : forte variété
  const sat = 64 + ((h >>> 7) % 24) // 64–88 %
  const light1 = 30 + ((h >>> 11) % 14) // 30–44 %
  const light2 = 18 + ((h >>> 15) % 10) // 18–28 %
  const glowLight = 50 + ((h >>> 3) % 12) // 50–62 %
  const glowX = 55 + ((h >>> 13) % 35) // 55–90 %
  const glowY = 52 + ((h >>> 17) % 36) // 52–88 %
  const angle = (h >>> 5) % 360
  const gradient = [
    `radial-gradient(circle at ${glowX}% ${glowY}%, hsl(${hue2} ${sat}% ${glowLight}% / 0.55), transparent 60%)`,
    `linear-gradient(${angle}deg, hsl(${hue1} ${sat}% ${light1}%), hsl(${hue2} ${sat}% ${light2}%))`,
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
          {/* Grain très léger - ajoute de la matière au dégradé sans le dénaturer. */}
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
