"use client"

import { usePathname } from "next/navigation"
import { FlaskConical } from "lucide-react"

import { useFeedbackStore } from "@/lib/store/feedback-store"

/** Zones expérimentales : Intelligence (`/analytics`) + Brain OS (`/brain`). */
const LAB_ROUTE = /\/(analytics|brain)(\/|$)/

/**
 * Coquille « sandbox » façon mode test Stripe pour les zones Labs : un <b>bandeau bleu en haut</b>
 * (pleine largeur), et l'app <b>poussée en dessous</b> avec les <b>coins supérieurs arrondis</b>
 * (le bleu affleure dans les coins). Pas de cadre sur les côtés/bas — juste le haut.
 *
 * <p>Hors zone Labs : simple conteneur pleine hauteur. Dans les deux cas c'est LUI qui donne la
 * hauteur à l'app (l'`AppShell` passe donc de `h-svh` à `h-full`).</p>
 */
export function LabShell({ children }: { readonly children: React.ReactNode }) {
  const pathname = usePathname()
  const isLab = LAB_ROUTE.test(pathname)
  const openFeedback = useFeedbackStore((s) => s.openFeedback)

  if (!isLab) {
    return <div className="h-svh">{children}</div>
  }

  const labArea = pathname.includes("/brain") ? "Brain OS" : "Intelligence"

  return (
    <div
      className="tf-lab-shell flex h-svh flex-col bg-cover bg-center"
      style={{ backgroundImage: "url('/assets/tour/labs-wave.jpg')" }}
    >
      {/* Bandeau sandbox — pleine largeur, en haut (fond image « labs-wave », dégradé clair). */}
      <div className="flex h-9 shrink-0 items-center justify-center gap-2.5 px-4 text-slate-800">
        <FlaskConical className="size-3.5 shrink-0 text-slate-700" strokeWidth={2.5} aria-hidden />
        <span className="text-xs font-semibold tracking-tight">Experimental space</span>
        <span className="hidden text-[11px] text-slate-600 sm:inline">
          — Intelligence and Brain OS are still evolving
        </span>
        <button
          type="button"
          onClick={() => openFeedback(`Labs · ${labArea}`)}
          className="ml-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-slate-700 underline-offset-2 transition-colors hover:bg-black/5 hover:underline"
        >
          Give feedback
        </button>
      </div>

      {/* L'app, poussée en bas, coins supérieurs arrondis (le bleu affleure dans les coins). */}
      <div className="min-h-0 flex-1 overflow-hidden rounded-t-2xl bg-background">
        {children}
      </div>
    </div>
  )
}
