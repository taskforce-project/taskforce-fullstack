"use client"

import Link from "next/link"

/**
 * Footer minimaliste permanent (1 ligne), épinglé en bas du shell — hors zone de
 * scroll, donc visible sur toutes les pages protégées.
 */
export function AppFooter() {
  const year = new Date().getFullYear()
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? "v1.0"

  return (
    <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-background px-6 py-2 text-[11px] text-muted-foreground md:px-8">
      <span className="truncate">© {year} TaskForce · {version}</span>
      <nav className="flex shrink-0 items-center gap-4">
        <Link href="/privacy-policy" className="transition-colors hover:text-foreground">Confidentialité</Link>
        <Link href="/legal-notices" className="transition-colors hover:text-foreground">Mentions légales</Link>
      </nav>
    </footer>
  )
}
