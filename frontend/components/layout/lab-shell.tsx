"use client"

import { usePathname } from "next/navigation"
import { FlaskConical } from "lucide-react"

import { useFeedbackStore } from "@/lib/store/feedback-store"

/** Zones expérimentales : Intelligence (`/analytics`) + Brain OS (`/brain`). */
const LAB_ROUTE = /\/(analytics|brain)(\/|$)/

/**
 * Coquille « sandbox » façon mode test Stripe pour les zones Labs : un <b>bandeau en haut</b>
 * (pleine largeur, fond = le bas du dégradé Labs), et l'app <b>encadrée</b> en dessous par un fin
 * liseré de ce même dégradé sur les <b>côtés et le bas</b> — coins arrondis. Le « cadre » enveloppe
 * donc l'app (plus seulement le haut) ; le fond du conteneur affleure dans le liseré et les coins.
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
      className="tf-lab-shell flex h-svh flex-col bg-cover bg-bottom"
      style={{ backgroundImage: "url('/assets/tour/labs-wave.jpg')" }}
    >
      {/* Bandeau sandbox — le fond montre le BAS de l'image « labs-wave » (formes + couleurs) ;
          texte en blanc avec une ombre douce pour rester lisible dessus. */}
      <div
        className="flex h-9 shrink-0 items-center justify-center gap-2.5 px-4 text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.35)]"
        style={{
          backgroundImage: "url('/assets/tour/labs-wave.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center 78%",
        }}
      >
        <FlaskConical className="size-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
        <span className="text-xs font-semibold tracking-tight">Experimental space</span>
        <span className="hidden text-[11px] text-white/85 sm:inline">
          — Intelligence and Brain OS are still evolving
        </span>
        <button
          type="button"
          onClick={() => openFeedback(`Labs · ${labArea}`)}
          className="ml-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-white underline-offset-2 transition-colors hover:bg-white/15 hover:underline"
        >
          Give feedback
        </button>
      </div>

      {/* L'app : encadrée par un liseré du dégradé Labs (côtés + bas), coins arrondis — le « cadre »
          sandbox enveloppe l'app, plus seulement le haut. Le fond du conteneur affleure dans le liseré. */}
      <div className="min-h-0 flex-1 px-1.5 pb-1.5">
        <div className="h-full overflow-hidden rounded-2xl bg-background">
          {children}
        </div>
      </div>
    </div>
  )
}
