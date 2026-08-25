"use client"

import { usePathname } from "next/navigation"
import { FlaskConical } from "lucide-react"

import { usePreferencesStore } from "@/lib/store/preferences-store"

/** Zones expérimentales : Intelligence (`/analytics`) + Brain OS (`/brain`). */
const LAB_ROUTE = /\/(analytics|brain)(\/|$)/

/**
 * Cadre « sandbox » (façon mode test Stripe) autour de TOUTE l'app sur les zones Labs.
 *
 * <p>Overlay <b>fixe et non-interactif</b> (`fixed inset-0`, `pointer-events-none`) : il n'affecte
 * ni le layout ni le scroll, il dessine juste un liseré bleu tout autour du viewport + une pastille
 * « Experimental » ancrée en bas. Monté <b>hors</b> de `AppShell` (le `<main>` est animé par
 * framer-motion, donc porteur d'un `transform` qui casserait un `fixed`).</p>
 *
 * <p>Porte l'indicateur Lab que la topbar affichait auparavant en `absolute` centré — d'où le
 * chevauchement responsive sur petit écran. Ici il est en bas, il ne chevauche plus rien.</p>
 */
export function LabFrame() {
  const pathname = usePathname()
  const { t } = usePreferencesStore()

  if (!LAB_ROUTE.test(pathname)) return null

  return (
    <>
      {/* Liseré bleu autour du viewport (au-dessus du chrome, non cliquable). */}
      <div aria-hidden className="tf-lab-frame pointer-events-none fixed inset-0 z-50" />

      {/* Pastille d'ancrage en bas — identité Labs + lien feedback. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-3 z-50 flex justify-center">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full border border-blue-300/70 bg-blue-50/90 px-2.5 py-1 text-[11px] font-semibold text-blue-700 shadow-sm backdrop-blur dark:border-blue-500/40 dark:bg-blue-950/80 dark:text-blue-200">
            <FlaskConical className="size-3.5" strokeWidth={2} />
            {t.shell.experimental}
          </span>
          <a
            href="mailto:feedback@taskforce.dev?subject=Feedback"
            className="pointer-events-auto hidden text-[11px] font-medium text-blue-700/80 underline-offset-2 hover:text-blue-700 hover:underline dark:text-blue-300/80 dark:hover:text-blue-200 sm:inline"
          >
            {t.shell.giveFeedback}
          </a>
        </div>
      </div>
    </>
  )
}
