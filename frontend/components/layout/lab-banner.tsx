"use client"

import { useEffect, useState } from "react"
import { FlaskConical, X } from "lucide-react"

import { cn } from "@/lib/utils"

/** Adresse de retour (dev) — à remplacer par un vrai canal de feedback le moment venu. */
const FEEDBACK_EMAIL = "feedback@taskforce.dev"

interface LabBannerProps {
  /** Clé stable (mémorise le « fermé » par fonctionnalité dans localStorage). */
  readonly feature: string
  /** Message affiché (défaut générique « en cours de finition »). */
  readonly message?: string
  /** Espacement géré par le parent (ex. `mx-4 mt-4`) — appliqué à l'élément visible uniquement. */
  readonly className?: string
}

/**
 * Bandeau d'information « Lab » (bleu, façon bandeau sandbox Stripe) affiché en tête d'une
 * fonctionnalité pas encore finalisée à 100 %. Purement informatif — les données restent réelles.
 * Dismissible et mémorisé par fonctionnalité. Pendant du drapeau `lab` de la sidebar (fiole bleue).
 */
export function LabBanner({ feature, message, className }: LabBannerProps) {
  const storageKey = `tf.lab-banner.dismissed.${feature}`
  // Masqué par défaut avant hydratation → évite un flash puis une disparition si déjà fermé.
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    setVisible(localStorage.getItem(storageKey) !== "1")
  }, [storageKey])

  if (!visible) return null

  const dismiss = () => {
    localStorage.setItem(storageKey, "1")
    setVisible(false)
  }

  const subject = encodeURIComponent(`Feedback — ${feature}`)

  return (
    <div className={cn("flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-200", className)}>
      <FlaskConical className="size-4 shrink-0 text-blue-500" />
      <span className="flex-1">
        {message ?? "Fonctionnalité en cours de finition — les données sont réelles, l'expérience évolue encore."}
      </span>
      <a
        href={`mailto:${FEEDBACK_EMAIL}?subject=${subject}`}
        className="shrink-0 rounded-md border border-blue-300 bg-white/70 px-2.5 py-1 text-xs font-medium text-blue-700 transition-colors hover:bg-white dark:border-blue-800 dark:bg-blue-900/40 dark:text-blue-100 dark:hover:bg-blue-900/70"
      >
        Donner mon feedback
      </a>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Fermer le bandeau"
        className="shrink-0 rounded p-1 text-blue-500 transition-colors hover:bg-blue-100 dark:hover:bg-blue-900/60"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
