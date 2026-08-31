"use client"

import { useEffect } from "react"
import { useRouter, useParams } from "next/navigation"

import { useSettingsStore } from "@/lib/store/settings-store"

/**
 * Route `/profile` - la page standalone a été RETIRÉE. Tout le profil vit désormais dans le modal
 * Réglages : section « Profil » (édition identité + aperçu stats/heatmap/activité) et section
 * « Compétences » (skills + disponibilité). Cette route ouvre donc le modal sur la section Profil,
 * par-dessus le dashboard - dynamique façon Claude, plus de page dédiée par écran.
 */
export default function ProfilePage() {
  const router = useRouter()
  const params = useParams()
  const openSettings = useSettingsStore((s) => s.openSettings)
  const workspace = typeof params.workspace === "string" ? params.workspace : ""

  useEffect(() => {
    openSettings("profile")
    router.replace(workspace ? `/${workspace}/dashboard` : "/")
  }, [openSettings, router, workspace])

  return null
}
