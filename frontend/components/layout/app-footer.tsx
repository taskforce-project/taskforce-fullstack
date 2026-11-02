"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { analyticsConfigured, openConsentPreferences } from "@/lib/analytics/consent"
import { appVersion } from "@/lib/app-version"

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
 * Footer minimaliste (1 ligne) des pages d'authentification, où il occupe la dernière bande de la grille. Dans
 * l'application, la version et les liens légaux sont dans le menu du compte (revue UX du 01/11/2026) : un pied de
 * site s'intercalait entre l'écran de travail et la barre unique.
 */
export function AppFooter({ bleed = true }: AppFooterProps) {
  const { t } = usePreferencesStore()
  const year = new Date().getFullYear()
  const { label: version, title: versionTitle } = appVersion()

  return (
    <footer
      className={cn(
        "flex shrink-0 items-center justify-between gap-3 border-t border-border bg-background px-6 py-2 text-[11px] text-muted-foreground md:px-8",
        bleed && "-mx-6 -mb-6 mt-auto md:-mx-8 md:-mb-8"
      )}
    >
      <span className="truncate" title={versionTitle}>© {year} TaskForce · {version}</span>
      <nav className="flex shrink-0 items-center gap-4">
        {analyticsConfigured() && (
          <button type="button" onClick={openConsentPreferences} className="transition-colors hover:text-foreground">{t.shell.manageCookies}</button>
        )}
        <Link href="/privacy-policy" className="transition-colors hover:text-foreground">{t.shell.privacy}</Link>
        <Link href="/legal-notices" className="transition-colors hover:text-foreground">{t.shell.legalNotices}</Link>
      </nav>
    </footer>
  )
}
