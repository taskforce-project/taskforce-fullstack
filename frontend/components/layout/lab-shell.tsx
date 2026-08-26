"use client"

import { usePathname } from "next/navigation"
import { FlaskConical } from "lucide-react"

import { useFeedbackStore } from "@/lib/store/feedback-store"

/** Zones expérimentales : Intelligence (`/analytics`) + Brain OS (`/brain`). */
const LAB_ROUTE = /\/(analytics|brain)(\/|$)/

/**
 * Coquille « sandbox » façon mode test Stripe pour les zones Labs : un <b>bandeau en haut</b> sur le
 * dégradé Labs, et l'app juste en dessous en <b>plein cadre</b> (côtés + bas = l'app) avec les
 * <b>coins supérieurs arrondis</b>. Le dégradé est posé en <b>UN seul calque</b> qui couvre le bandeau
 * ET les coins arrondis → le bandeau et les coins montrent exactement le même crop (continu), et rien
 * ne « déborde » sur les côtés / le bas (c'est l'app).
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
    <div className="tf-lab-shell relative flex h-svh flex-col overflow-hidden bg-background">
      {/* Le dégradé Labs, posé UNE fois : couvre le bandeau (0–36px) ET les coins arrondis de l'app
          juste en dessous → bandeau et coins montrent le MÊME crop continu. Seul calque qui porte
          l'image ; tout le reste (côtés, bas) est l'app, pas de liseré. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-cover"
        style={{
          backgroundImage: "url('/assets/tour/labs-wave.jpg')",
          backgroundPosition: "center 78%",
        }}
      />

      {/* Bandeau sandbox — transparent (laisse voir le dégradé au-dessus) ; texte blanc + ombre. */}
      <div className="relative z-10 flex h-9 shrink-0 items-center justify-center gap-2.5 px-4 text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.35)]">
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

      {/* L'app : plein cadre (côtés + bas = l'app), coins SUPÉRIEURS arrondis → le dégradé du bandeau
          affleure dans les coins. */}
      <div className="relative z-10 min-h-0 flex-1 overflow-hidden rounded-t-2xl bg-background">
        {children}
      </div>
    </div>
  )
}
