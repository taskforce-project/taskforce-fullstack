/**
 * Ce que Cortex peut lire dans un espace (R125, séance n°18) : `/api/workspaces/{slug}/assistant/sources`. Chaque source
 * comptée pour la personne qui demande, avec les droits des lectures de Cortex, et la date de son dernier changement.
 */
import { apiClient } from "./client"
import { CORTEX_SOURCE_ROUTES } from "../config/api-routes"

/** Les sources, dans l'ordre où le serveur les rend. */
export type CortexSourceKey = "projects" | "issues" | "comments" | "notes" | "documents" | "connectors"

export interface CortexSource {
  key: CortexSourceKey
  count: number
  /** Quand la plus récente a changé ; null quand il n'y en a aucune. */
  changedAt: string | null
}

export interface CortexSources {
  sources: CortexSource[]
}

/** Les sources de Cortex. Appel de fond (ouverture du volet) : jamais de toast. */
export async function getCortexSources(slug: string): Promise<CortexSources> {
  const res = await apiClient.get<{ data: CortexSources }>(CORTEX_SOURCE_ROUTES.SOURCES(slug), { silentError: true })
  return res.data.data
}
