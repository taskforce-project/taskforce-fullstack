"use client"

import { CortexModelChoice } from "@/components/settings/cortex-model-choice"
import { useWorkspaceStore } from "@/lib/store/workspace-store"

/**
 * Réglages « AI » de la webapp : l'instance règle son fournisseur (ses variables d'environnement), la personne y choisit
 * le modèle de Cortex pour elle (R113). Ce que sait faire chaque modèle se lit dans le volet « Progress » (R125), où mène
 * le lien. L'app desktop a les siens ({@code DesktopAiPanel}), où l'IA se choisit sur l'ordinateur.
 */
export function InstanceAiPanel() {
  const slug = useWorkspaceStore((s) => s.activeWorkspace?.slug) ?? ""
  if (!slug) return null
  return <CortexModelChoice slug={slug} />
}
