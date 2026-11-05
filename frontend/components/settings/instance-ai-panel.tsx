"use client"

import { ModelCapabilityTable } from "@/components/settings/model-capability-table"
import { useWorkspaceStore } from "@/lib/store/workspace-store"

/**
 * Réglages « AI » de la webapp : l'instance règle son fournisseur (ses variables d'environnement), la personne y lit ce
 * que sait faire chaque modèle servi et choisit celui de Cortex pour elle (R113). L'app desktop a les siens
 * ({@code DesktopAiPanel}), où l'IA se choisit sur l'ordinateur.
 */
export function InstanceAiPanel() {
  const slug = useWorkspaceStore((s) => s.activeWorkspace?.slug) ?? ""
  if (!slug) return null
  return <ModelCapabilityTable slug={slug} />
}
