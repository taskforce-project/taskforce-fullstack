"use client"

import Link from "next/link"

/**
 * Footer minimaliste (1 ligne). Placé en fin du flux de scroll (full-bleed via marges
 * négatives + `mt-auto`) : il reste caché tant qu'on n'a pas atteint le bas de la page,
 * et le dernier scroll le révèle.
 */
export function AppFooter() {
  const year = new Date().getFullYear()
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? "v1.0"

  return (
    <footer className="-mx-6 -mb-6 mt-auto flex shrink-0 items-center justify-between gap-3 border-t border-border bg-background px-6 py-2 text-[11px] text-muted-foreground md:-mx-8 md:-mb-8 md:px-8">
      <span className="truncate">© {year} TaskForce · {version}</span>
      <nav className="flex shrink-0 items-center gap-4">
        <Link href="/privacy-policy" className="transition-colors hover:text-foreground">Confidentialité</Link>
        <Link href="/legal-notices" className="transition-colors hover:text-foreground">Mentions légales</Link>
      </nav>
    </footer>
  )
}
