"use client"

import { ProgressPane } from "@/components/progress/progress-pane"

/**
 * Le volet « Progress » (R125, séance n°18) : `/{slug}/progress`, à côté de la conversation. On l'ouvre depuis le nom du
 * modèle sous le compositeur, depuis Settings > AI, depuis « More » dans la barre de gauche et depuis la recherche.
 */
export default function ProgressPage() {
  return <ProgressPane />
}
