"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"
import { usePreferencesStore } from "@/lib/store/preferences-store"

interface AppFooterProps {
  /**
   * Marges négatives pour occuper toute la largeur du conteneur parent.
   *
   * Vrai dans l'application, où le footer vit à l'intérieur d'un contenu déjà encadré et doit
   * « percer » ce cadre. Faux sur les pages d'authentification, dont la coquille est une grille
   * pleine largeur : les marges négatives y feraient déborder la page horizontalement.
   */
  bleed?: boolean
}

/**
 * Footer minimaliste (1 ligne), partagé par l'application et les pages d'authentification.
 *
 * Dans l'application il est placé en fin du flux de défilement (`mt-auto`) : il reste caché tant
 * qu'on n'a pas atteint le bas de la page. Sur les pages d'authentification, qui ne défilent pas,
 * il occupe la dernière bande de la grille.
 */
export function AppFooter({ bleed = true }: AppFooterProps) {
  const { t } = usePreferencesStore()
  const year = new Date().getFullYear()
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? "v1.0"

  return (
    <footer
      className={cn(
        "flex shrink-0 items-center justify-between gap-3 border-t border-border bg-background px-6 py-2 text-[11px] text-muted-foreground md:px-8",
        bleed && "-mx-6 -mb-6 mt-auto md:-mx-8 md:-mb-8"
      )}
    >
      <span className="truncate">© {year} TaskForce · {version}</span>
      <nav className="flex shrink-0 items-center gap-4">
        <Link href="/privacy-policy" className="transition-colors hover:text-foreground">{t.shell.privacy}</Link>
        <Link href="/legal-notices" className="transition-colors hover:text-foreground">{t.shell.legalNotices}</Link>
      </nav>
    </footer>
  )
}
