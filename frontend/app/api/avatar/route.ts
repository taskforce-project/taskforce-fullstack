import { type NextRequest } from "next/server"

const PALETTES: [string, string][] = [
  ["#6366f1", "#8b5cf6"], // indigo → violet
  ["#8b5cf6", "#ec4899"], // violet → pink
  ["#ec4899", "#f97316"], // pink → orange
  ["#14b8a6", "#3b82f6"], // teal → blue
  ["#f59e0b", "#ef4444"], // amber → red
  ["#10b981", "#6366f1"], // emerald → indigo
  ["#3b82f6", "#06b6d4"], // blue → cyan
  ["#f97316", "#eab308"], // orange → yellow
  ["#a855f7", "#14b8a6"], // purple → teal
]

function hashSeed(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) {
    h = (seed.codePointAt(i) ?? 0) + ((h << 5) - h)
  }
  return Math.abs(h)
}

function buildSvg(initials: string, seed: string): string {
  const [from, to] = PALETTES[hashSeed(seed) % PALETTES.length]
  const gradId = "g"

  // Grille 5×5 de dots décoratifs
  const dots = Array.from({ length: 25 }, (_, i) => {
    const r = Math.floor(i / 5)
    const c = i % 5
    const opacity = (hashSeed(seed + i) % 3) === 0 ? 0.2 : 0.08
    return `<circle cx="${6 + c * 11}" cy="${6 + r * 11}" r="1.5" fill="white" opacity="${opacity}"/>`
  }).join("")

  return `<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${from}"/>
      <stop offset="100%" stop-color="${to}"/>
    </linearGradient>
    <clipPath id="clip"><circle cx="32" cy="32" r="32"/></clipPath>
  </defs>
  <circle cx="32" cy="32" r="32" fill="url(#${gradId})"/>
  <g clip-path="url(#clip)" transform="translate(4, 4)">${dots}</g>
  <text x="32" y="32" text-anchor="middle" dominant-baseline="central"
    fill="white" font-size="22" font-weight="700"
    font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif">${initials}</text>
</svg>`
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  // initials passées explicitement (ex: "JD"), seed pour la couleur (email)
  const initials = (params.get("initials") ?? "?").slice(0, 2).toUpperCase()
  const seed     = params.get("seed") ?? initials

  const svg = buildSvg(initials, seed)

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  })
}
