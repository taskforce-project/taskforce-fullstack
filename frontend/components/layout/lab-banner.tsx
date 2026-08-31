"use client"

import { useEffect, useState } from "react"
import { FlaskConical, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { useFeedbackStore } from "@/lib/store/feedback-store"

interface LabBannerProps {
  /** Clé stable (mémorise le « fermé » par fonctionnalité dans localStorage). */
  readonly feature: string
  /** Message affiché (défaut générique « en cours de finition »). */
  readonly message?: string
  /** Espacement géré par le parent (ex. `mx-4 mt-4`) - appliqué à l'élément visible uniquement. */
  readonly className?: string
}

/**
 * Bandeau d'information « Lab » (bleu, façon bandeau sandbox Stripe) affiché en tête d'une
 * fonctionnalité pas encore finalisée à 100 %. Purement informatif - les données restent réelles.
 * Dismissible et mémorisé par fonctionnalité. Pendant du drapeau `lab` de la sidebar (fiole bleue).
 */
export function LabBanner({ feature, message, className }: LabBannerProps) {
  const storageKey = `tf.lab-banner.dismissed.${feature}`
  // Masqué par défaut avant hydratation → évite un flash puis une disparition si déjà fermé.
  const [visible, setVisible] = useState(false)
  const openFeedback = useFeedbackStore((s) => s.openFeedback)

  useEffect(() => {
    setVisible(localStorage.getItem(storageKey) !== "1")
  }, [storageKey])

  if (!visible) return null

  const dismiss = () => {
    localStorage.setItem(storageKey, "1")
    setVisible(false)
  }

  return (
    /* Violet et non bleu : le bleu porte désormais les actions primaires (boutons, cases,
       interrupteurs). Un bandeau « lab » en bleu se lirait comme quelque chose d'actionnable,
       alors que c'est un avertissement de maturité. Une teinte distincte le rend lisible d'un
       coup d'œil sans le confondre avec le reste. */
    <div className={cn("flex items-start gap-3 rounded-lg border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm text-violet-900 dark:border-violet-900/50 dark:bg-violet-950/40 dark:text-violet-200", className)}>
      <FlaskConical className="size-4 shrink-0 text-violet-500 mt-0.5" />
      <span className="min-w-0 flex-1">
        {message ?? "Fonctionnalité en cours de finition - les données sont réelles, l'expérience évolue encore."}
      </span>
      <button
        type="button"
        onClick={() => openFeedback(feature)}
        className="shrink-0 rounded-md border border-violet-300 bg-white/70 px-2.5 py-1 text-xs font-medium text-violet-700 transition-colors hover:bg-white dark:border-violet-800 dark:bg-violet-900/40 dark:text-violet-100 dark:hover:bg-violet-900/70"
      >
        Donner mon feedback
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Fermer le bandeau"
        className="shrink-0 rounded p-1 text-violet-500 transition-colors hover:bg-violet-100 dark:hover:bg-violet-900/60"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
